import { getSystemModes } from "@/lib/config";
import { buildMockExtractedQuote } from "@/lib/seed-data";
import { ExtractedQuote, PurchaseRequest } from "@/lib/types";

interface OcrInput {
  request: PurchaseRequest;
  fileName?: string;
  fileBuffer?: Buffer;
  sourceSummary: string;
}

interface OcrResult {
  extractedQuote: ExtractedQuote;
  mode: "mock" | "live";
  usedFallback: boolean;
  notice?: string;
}

function describeLiveFailure(error: unknown) {
  if (!(error instanceof Error)) {
    return "the live OCR response could not be validated.";
  }

  if (error.message.startsWith("HTTP_")) {
    const statusCode = Number(error.message.replace("HTTP_", ""));

    if (statusCode === 401 || statusCode === 403) {
      return "OCR authentication was rejected.";
    }

    if (statusCode === 404) {
      return "the OCR endpoint URL appears incorrect.";
    }

    if (statusCode >= 500) {
      return "the OCR service returned a server error.";
    }

    return `the OCR service returned HTTP ${statusCode}.`;
  }

  const message = error.message.toLowerCase();

  if (
    message.includes("fetch failed") ||
    message.includes("econnrefused") ||
    message.includes("enotfound")
  ) {
    return "the OCR endpoint was unreachable.";
  }

  if (message.includes("timeout") || message.includes("abort")) {
    return "the OCR request timed out.";
  }

  return "the live OCR response could not be validated.";
}

function normalizeLiveExtraction(
  payload: unknown,
  input: OcrInput,
): ExtractedQuote {
  const root = payload as Record<string, unknown>;
  const candidate = (root?.quote as Record<string, unknown>) ?? root;

  return {
    id: crypto.randomUUID(),
    requestId: input.request.id,
    supplierName: String(candidate.supplierName ?? candidate.supplier ?? "Live Supplier"),
    productName: String(
      candidate.productName ?? candidate.product ?? input.request.productName,
    ),
    unitPrice: Number(candidate.unitPrice ?? candidate.price ?? 0) || 0,
    quantity: Number(candidate.quantity ?? input.request.quantity) || input.request.quantity,
    sourceDocumentName: input.fileName ?? "uploaded-document",
    sourceSummary: input.sourceSummary,
    confidence: Number(candidate.confidence ?? 0.93) || 0.93,
    createdAt: new Date().toISOString(),
  };
}

async function runLiveOcr(input: OcrInput) {
  const response = await fetch(String(process.env.INTERFAZE_API_URL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.INTERFAZE_API_KEY}`,
    },
    body: JSON.stringify({
      request: {
        productName: input.request.productName,
        quantity: input.request.quantity,
        specs: input.request.specs,
      },
      document: {
        fileName: input.fileName,
        contentBase64: input.fileBuffer?.toString("base64"),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }

  return normalizeLiveExtraction(await response.json(), input);
}

export async function extractQuoteData(input: OcrInput): Promise<OcrResult> {
  const modes = getSystemModes();

  if (modes.ocr === "live") {
    try {
      const extractedQuote = await runLiveOcr(input);

      return {
        extractedQuote,
        mode: "live",
        usedFallback: false,
      };
    } catch (error) {
      return {
        extractedQuote: buildMockExtractedQuote(input),
        mode: "mock",
        usedFallback: true,
        notice:
          `Live OCR was unavailable (${describeLiveFailure(error)}), so Auto-Sourcing Pro switched to the deterministic demo extractor.`,
      };
    }
  }

  return {
    extractedQuote: buildMockExtractedQuote(input),
    mode: "mock",
    usedFallback: false,
  };
}
