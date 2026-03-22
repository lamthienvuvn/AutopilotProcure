import { getSystemModes } from "@/lib/config";
import { buildMockSupplierQuotes } from "@/lib/seed-data";
import { ExtractedQuote, PurchaseRequest, SupplierQuote } from "@/lib/types";
import { createId } from "@/lib/utils";

interface SearchInput {
  request: PurchaseRequest;
  extractedQuote: ExtractedQuote;
}

interface SearchResult {
  supplierQuotes: SupplierQuote[];
  mode: "mock" | "live";
  usedFallback: boolean;
  notice?: string;
}

function describeLiveFailure(error: unknown) {
  if (!(error instanceof Error)) {
    return "the live supplier payload could not be validated.";
  }

  if (error.message.startsWith("HTTP_")) {
    const statusCode = Number(error.message.replace("HTTP_", ""));

    if (statusCode === 401 || statusCode === 403) {
      return "supplier-search authentication was rejected.";
    }

    if (statusCode === 404) {
      return "the supplier-search endpoint URL appears incorrect.";
    }

    if (statusCode >= 500) {
      return "the supplier-search service returned a server error.";
    }

    return `the supplier-search service returned HTTP ${statusCode}.`;
  }

  const message = error.message.toLowerCase();

  if (
    message.includes("fetch failed") ||
    message.includes("econnrefused") ||
    message.includes("enotfound")
  ) {
    return "the supplier-search endpoint was unreachable.";
  }

  if (message.includes("timeout") || message.includes("abort")) {
    return "the supplier-search request timed out.";
  }

  return "the live supplier payload could not be validated.";
}

function buildPublicSourceUrl(productName: string) {
  const query = encodeURIComponent(`${productName} price supplier`);
  return `https://www.google.com/search?q=${query}`;
}

function normalizeLiveSearchResult(
  payload: unknown,
  input: SearchInput,
): SupplierQuote[] {
  const root = payload as Record<string, unknown>;
  const candidates =
    (root.quotes as Array<Record<string, unknown>>) ??
    (root.results as Array<Record<string, unknown>>) ??
    [];
  const alternative = candidates[0] ?? {};
  const rawPrice = Number(alternative.price ?? alternative.unitPrice);
  const hasObservedPrice = Number.isFinite(rawPrice) && rawPrice > 0;
  const fallbackPrice = Math.max(input.extractedQuote.unitPrice - 5, 1);

  const sourceUrl = String(
    alternative.url ?? alternative.link ?? alternative.sourceUrl ?? "",
  ).trim();
  const resolvedSourceUrl = sourceUrl || buildPublicSourceUrl(input.request.productName);
  const contactEmail = String(
    alternative.contactEmail ?? alternative.email ?? "",
  ).trim();
  const contactPhone = String(
    alternative.contactPhone ?? alternative.phone ?? "",
  ).trim();
  const contactName = String(
    alternative.contactName ?? alternative.contact ?? "",
  ).trim();

  return [
    {
      id: createId("quote"),
      requestId: input.request.id,
      supplierName: input.extractedQuote.supplierName,
      price: input.extractedQuote.unitPrice,
      inventory: input.request.quantity + 20,
      deliveryDays: 6,
      rating: 4.4,
      source: "OCR quote extraction",
      priceObserved: true,
      extractedFromOCR: true,
    },
    {
      id: createId("quote"),
      requestId: input.request.id,
      supplierName: String(
        alternative.supplierName ??
          alternative.title ??
          alternative.company ??
          "Verified market supplier",
      ),
      price: hasObservedPrice ? rawPrice : fallbackPrice,
      priceObserved: hasObservedPrice,
      inventory:
        Number(alternative.inventory ?? alternative.stock) ||
        input.request.quantity + 60,
      deliveryDays: Number(alternative.deliveryDays ?? alternative.delivery) || 4,
      rating: Number(alternative.rating) || 4.7,
      source: hasObservedPrice
        ? "Live supplier search"
        : "Live supplier search (price unavailable, estimate used)",
      sourceUrl: resolvedSourceUrl,
      supplierContactName: contactName || undefined,
      supplierContactEmail: contactEmail || undefined,
      supplierContactPhone: contactPhone || undefined,
      agoraFollowUpSuggested: !hasObservedPrice,
      extractedFromOCR: false,
    },
  ];
}

async function runLiveSupplierSearch(input: SearchInput) {
  const response = await fetch(
    process.env.EXA_API_URL ?? "https://api.exa.ai/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": String(process.env.EXA_API_KEY),
      },
      body: JSON.stringify({
        query: `${input.request.productName} supplier pricing inventory delivery for quantity ${input.request.quantity}`,
        numResults: 2,
        type: "keyword",
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }

  return normalizeLiveSearchResult(await response.json(), input);
}

export async function discoverSupplierQuotes(
  input: SearchInput,
): Promise<SearchResult> {
  const modes = getSystemModes();

  if (modes.supplierSearch === "live") {
    try {
      const supplierQuotes = await runLiveSupplierSearch(input);

      return {
        supplierQuotes,
        mode: "live",
        usedFallback: false,
      };
    } catch (error) {
      return {
        supplierQuotes: buildMockSupplierQuotes(input),
        mode: "mock",
        usedFallback: true,
        notice:
          `Live supplier discovery was unavailable (${describeLiveFailure(error)}), so the deterministic benchmark suppliers were used instead.`,
      };
    }
  }

  return {
    supplierQuotes: buildMockSupplierQuotes(input),
    mode: "mock",
    usedFallback: false,
  };
}
