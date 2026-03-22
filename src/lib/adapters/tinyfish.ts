import { getSystemModes } from "@/lib/config";
import { DraftOrder, PurchaseRequest, SupplierQuote } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";

interface TinyFishInput {
  request: PurchaseRequest;
  supplierQuote: SupplierQuote;
}

interface TinyFishResult {
  draftOrder: DraftOrder;
  mode: "mock" | "live";
  usedFallback: boolean;
  notice?: string;
}

interface TinyFishRunStatus {
  run_id?: string;
  status?: string;
  type?: string;
  result?: Record<string, unknown>;
  resultJson?: Record<string, unknown>;
  error?: string;
  notes?: string;
  referenceId?: string;
  [key: string]: unknown;
}

const TINYFISH_REQUEST_TIMEOUT_MS = 20000;

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
}

function describeLiveFailure(error: unknown) {
  if (!(error instanceof Error)) {
    return "the TinyFish response could not be validated.";
  }

  if (error.message.startsWith("HTTP_")) {
    const statusCode = Number(error.message.replace("HTTP_", ""));

    if (statusCode === 401 || statusCode === 403) {
      return "TinyFish authentication was rejected.";
    }

    if (statusCode === 404) {
      return "the TinyFish endpoint URL appears incorrect.";
    }

    if (statusCode >= 500) {
      return "the TinyFish service returned a server error.";
    }

    return `the TinyFish service returned HTTP ${statusCode}.`;
  }

  const message = error.message.toLowerCase();

  if (
    message.includes("fetch failed") ||
    message.includes("econnrefused") ||
    message.includes("enotfound")
  ) {
    return "the TinyFish endpoint was unreachable.";
  }

  if (message.includes("timeout") || message.includes("abort")) {
    return "the TinyFish request timed out.";
  }

  return "the TinyFish response could not be validated.";
}

function buildDraftOrder(
  input: TinyFishInput,
  executionMode: "mock" | "live",
  fallbackUsed: boolean,
): DraftOrder {
  const id = createId("order");
  const createdAt = nowIso();
  const orderedQuantity =
    input.supplierQuote.recommendedBuyQuantity ?? input.request.quantity;
  const portalPrefix = input.supplierQuote.supplierName
    .split(" ")
    .slice(0, 2)
    .join(" ");
  const portalSessionId = `TF-${id.split("_")[1].toUpperCase()}`;

  return {
    id,
    referenceId: `DRAFT-${createdAt.slice(0, 10).replaceAll("-", "")}-${id
      .split("_")[1]
      .toUpperCase()}`,
    requestId: input.request.id,
    supplierName: input.supplierQuote.supplierName,
    productName: input.request.productName,
    quantity: orderedQuantity,
    status: "draft_saved",
    createdAt,
    executionMode,
    fallbackUsed,
    portalPath: `/supplier-portal/${id}`,
    contactName: "Maya Chen",
    shippingAddress: "44 Harbor View, District 7, Ho Chi Minh City",
    notes:
      executionMode === "live"
        ? "Draft payload accepted by TinyFish and mirrored into the local portal view."
        : "Draft created through the local TinyFish simulator and saved to the demo supplier portal.",
    portalName: `${portalPrefix} Vendor Desk`,
    portalSessionId,
    submittedBy:
      executionMode === "live"
        ? "tinyfish.live@autosourcingpro.ai"
        : "tinyfish.mock@autosourcingpro.ai",
    executionSummary: [
      "Prepared a supplier-ready payload from the approved recommendation.",
      `Applied the procurement intelligence buy quantity of ${orderedQuantity} ${input.supplierQuote.baseUnit ?? "EA"}.`,
      "Opened a supplier portal session with duplicate protection enabled.",
      "Authenticated the buying session and mapped the order fields.",
      "Filled the draft order form and saved the draft for final review.",
    ],
  };
}

function normalizeTinyFishUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function isCookbookAutomationEndpoint(url: string) {
  return /\/automation\/(run|run-sse|run-async)$/i.test(url);
}

function getCookbookEndpoint(url: string) {
  if (isCookbookAutomationEndpoint(url)) {
    return url;
  }

  return `${normalizeTinyFishUrl(url)}/automation/run-async`;
}

function getTinyFishGoal(input: TinyFishInput) {
  const quantity =
    input.supplierQuote.recommendedBuyQuantity ?? input.request.quantity;

  return [
    "You are assisting an internal procurement draft-order process.",
    "Do not browse unrelated pages.",
    "Return JSON only with keys referenceId and notes.",
    `supplierName: ${input.supplierQuote.supplierName}`,
    `productName: ${input.request.productName}`,
    `quantity: ${quantity}`,
  ].join("\n");
}

function getTinyFishPayload(input: TinyFishInput) {
  return {
    url: "https://example.com/procurement-draft",
    goal: getTinyFishGoal(input),
    timeout: 120000,
    browser_profile: "lite",
  };
}

async function parseSseCompletion(response: Response) {
  if (!response.body) {
    throw new Error("TinyFish SSE response body was empty.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: Record<string, unknown> | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) {
        continue;
      }

      const rawPayload = line.slice(5).trim();
      if (!rawPayload) {
        continue;
      }

      try {
        const event = JSON.parse(rawPayload) as TinyFishRunStatus;
        if (
          event.type === "COMPLETE" ||
          event.status === "COMPLETED" ||
          event.resultJson ||
          event.result
        ) {
          completed =
            event.resultJson ??
            event.result ??
            ({
              referenceId: event.referenceId,
              notes: event.notes,
            } satisfies Record<string, unknown>);
        }

        if (event.type === "ERROR" || event.status === "FAILED") {
          throw new Error(event.error ?? "TinyFish SSE execution failed.");
        }
      } catch {
        // Ignore non-JSON or partial chunks and continue streaming.
      }
    }
  }

  return completed;
}

async function pollTinyFishRunStatus(
  baseUrl: string,
  runId: string,
  deadlineAt: number,
) {
  const statusUrl = `${normalizeTinyFishUrl(baseUrl)}/runs/${runId}`;
  const headers = {
    "X-API-Key": String(process.env.TINYFISH_API_KEY),
  };

  for (let attempt = 0; attempt < 48; attempt += 1) {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) {
      throw new Error("TinyFish run polling timed out.");
    }

    const requestTimeout = createTimeoutSignal(Math.min(remainingMs, 5000));
    let response: Response;

    try {
      response = await fetch(statusUrl, {
        headers,
        cache: "no-store",
        signal: requestTimeout.signal,
      });
    } finally {
      requestTimeout.clear();
    }

    if (!response.ok) {
      throw new Error(`HTTP_${response.status}`);
    }

    const payload = (await response.json()) as TinyFishRunStatus;
    const status = String(payload.status ?? "").toUpperCase();

    if (status === "COMPLETED") {
      return payload.result ?? payload.resultJson ?? payload;
    }

    if (status === "FAILED" || status === "CANCELLED") {
      throw new Error(payload.error ?? `TinyFish run ended with ${status}.`);
    }

    const delayMs = Math.min(2500, Math.max(deadlineAt - Date.now(), 0));
    if (delayMs <= 0) {
      throw new Error("TinyFish run polling timed out.");
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error("TinyFish run polling timed out.");
}

function applyTinyFishResult(
  draftOrder: DraftOrder,
  result: Record<string, unknown> | null,
) {
  if (!result) {
    return draftOrder;
  }

  return {
    ...draftOrder,
    referenceId: String(result.referenceId ?? draftOrder.referenceId),
    notes: String(result.notes ?? draftOrder.notes),
  } satisfies DraftOrder;
}

async function runCookbookTinyFish(input: TinyFishInput, endpoint: string) {
  const payload = getTinyFishPayload(input);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": String(process.env.TINYFISH_API_KEY),
  };
  const deadlineAt = Date.now() + TINYFISH_REQUEST_TIMEOUT_MS;

  if (endpoint.endsWith("/run-sse")) {
    headers.Accept = "text/event-stream";
  }

  const timeout = createTimeoutSignal(TINYFISH_REQUEST_TIMEOUT_MS);
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: timeout.signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }

  const draftOrder = buildDraftOrder(input, "live", false);

  try {
    if (endpoint.endsWith("/run-sse")) {
      const result = await parseSseCompletion(response);
      return applyTinyFishResult(draftOrder, result);
    }

    const data = (await response.json()) as TinyFishRunStatus;

    if (endpoint.endsWith("/run-async")) {
      const runId = String(data.run_id ?? "");

      if (!runId) {
        throw new Error("TinyFish run ID was missing from async response.");
      }

      const baseUrl = endpoint.replace(/\/automation\/run-async$/i, "");
      const result = await pollTinyFishRunStatus(baseUrl, runId, deadlineAt);
      return applyTinyFishResult(draftOrder, result);
    }

    return applyTinyFishResult(draftOrder, data.result ?? data.resultJson ?? data);
  } finally {
    timeout.clear();
  }
}

async function runLiveTinyFish(input: TinyFishInput) {
  const rawEndpoint = String(process.env.TINYFISH_API_URL);
  const endpoint = getCookbookEndpoint(rawEndpoint);

  if (isCookbookAutomationEndpoint(endpoint)) {
    return runCookbookTinyFish(input, endpoint);
  }

  const timeout = createTimeoutSignal(TINYFISH_REQUEST_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(rawEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TINYFISH_API_KEY}`,
        "X-API-Key": String(process.env.TINYFISH_API_KEY),
      },
      body: JSON.stringify({
        supplierName: input.supplierQuote.supplierName,
        productName: input.request.productName,
        quantity: input.supplierQuote.recommendedBuyQuantity ?? input.request.quantity,
        supplierQuote: input.supplierQuote,
      }),
      signal: timeout.signal,
    });
  } finally {
    timeout.clear();
  }

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const draftOrder = buildDraftOrder(input, "live", false);

  return {
    ...draftOrder,
    referenceId: String(payload.referenceId ?? draftOrder.referenceId),
    notes: String(payload.notes ?? draftOrder.notes),
  } satisfies DraftOrder;
}

export async function createDraftOrderWithTinyFish(
  input: TinyFishInput,
): Promise<TinyFishResult> {
  const modes = getSystemModes();

  if (modes.tinyFish === "live") {
    try {
      return {
        draftOrder: await runLiveTinyFish(input),
        mode: "live",
        usedFallback: false,
      };
    } catch (error) {
      return {
        draftOrder: buildDraftOrder(input, "mock", true),
        mode: "mock",
        usedFallback: true,
        notice:
          `TinyFish live execution was unavailable (${describeLiveFailure(error)}), so the draft was completed through the local supplier portal simulator.`,
      };
    }
  }

  return {
    draftOrder: buildDraftOrder(input, "mock", false),
    mode: "mock",
    usedFallback: false,
  };
}
