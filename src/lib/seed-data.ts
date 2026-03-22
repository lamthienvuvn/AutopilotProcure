import {
  DemoStore,
  ExtractedQuote,
  PurchaseRequest,
  SampleDocument,
  SupplierQuote,
} from "@/lib/types";
import { createId, nowIso, titleFromRequest } from "@/lib/utils";

const SAMPLE_PRODUCT_NAME = "Dell 27-inch Monitor";
const SAMPLE_QUANTITY = 100;

export const DEFAULT_AGORA_SYSTEM_PROMPT = `You are a B2B procurement negotiation agent for buyer-side sourcing.

Goal:
- Secure the lowest achievable unit price while preserving delivery reliability and quality.
- Keep conversation natural, concise, and professional.

Context Variables:
- Product: {{product_name}}
- Buyer target quantity: {{quantity}}
- Current quoted price: {{current_price_usd}} USD/unit
- Buyer target ceiling: {{target_ceiling_usd}} USD/unit
- Hard walk-away ceiling: {{walkaway_usd}} USD/unit
- Preferred terms: {{payment_terms}}, {{delivery_window}}, {{warranty_terms}}
- Competitor reference (if any): {{competitor_anchor}}

Operating Rules:
1. First confirm supplier baseline quote and constraints (MOQ, lead time, payment terms, stock).
2. Negotiate in rounds with reasoned concessions:
   - leverage volume commitment
   - faster payment terms
   - repeat-order / long-term commitment
   - bundling opportunities
   - close-now certainty
3. Never invent facts or approvals.
4. Ask one focused question at a time.
5. If supplier rejects price drop, trade for non-price value (shipping, warranty, payment terms, MOQ flexibility).
6. If supplier proposes a counter-offer, evaluate against walk-away ceiling and continue up to 5 rounds.
7. If final offer <= target_ceiling_usd: mark as ACCEPT_CANDIDATE.
8. If final offer > walkaway_usd and no extra value: mark as NO_DEAL.
9. End with a concise recap and explicit next action.

Response Style:
- Tone: calm, commercial, decisive.
- Length: 1-3 short paragraphs per turn.
- Always include current working unit price in USD when discussing offers.

Mandatory End-of-Call Output (exact JSON only):
{
  "status": "ACCEPT_CANDIDATE | NO_DEAL | NEED_INTERNAL_APPROVAL",
  "final_unit_price_usd": number,
  "supplier_name": string,
  "qty": number,
  "moq": number|null,
  "lead_time_days": number|null,
  "payment_terms": string|null,
  "non_price_concessions": [string],
  "summary": string,
  "confidence": 0.0
}`;

export const SAMPLE_REQUEST_TEMPLATE: PurchaseRequest = {
  id: "sample_request_template",
  title: "Need 100 Dell 27-inch monitors for the new office",
  productName: SAMPLE_PRODUCT_NAME,
  quantity: SAMPLE_QUANTITY,
  specs: "27-inch IPS display, HDMI plus USB-C preferred, delivery to HQ",
  status: "ready_for_quote",
  createdAt: "2026-03-21T09:00:00.000Z",
};

export const SAMPLE_DOCUMENT: SampleDocument = {
  id: "sample_document_monitor_quote",
  label: "Seeded Northwind quote",
  fileName: "northwind-monitor-quote.pdf",
  summary:
    "Scanned supplier quote for the office monitor rollout, ready for deterministic OCR extraction.",
  previewPath: "/samples/quote-scan.svg",
};

export function createInitialStore(): DemoStore {
  return {
    requests: [],
    activeRequestId: null,
    agoraSystemPrompt:
      process.env.AGORA_LLM_SYSTEM_PROMPT?.trim() || DEFAULT_AGORA_SYSTEM_PROMPT,
    extractedQuote: null,
    supplierQuotes: [],
    recommendation: null,
    draftOrder: null,
    activityEvents: [
      {
        id: createId("evt"),
        requestId: null,
        type: "system",
        tone: "info",
        message:
          "System ready. Load the seeded request to demo the full source-to-draft flow.",
        createdAt: nowIso(),
      },
    ],
  };
}

export function createSampleRequest(): PurchaseRequest {
  return {
    ...SAMPLE_REQUEST_TEMPLATE,
    id: createId("req"),
    status: "ready_for_quote",
    createdAt: nowIso(),
  };
}

export function createCustomRequest(input: {
  productName: string;
  quantity: number;
  specs?: string;
}): PurchaseRequest {
  return {
    id: createId("req"),
    title: titleFromRequest(input.productName, input.quantity),
    productName: input.productName,
    quantity: input.quantity,
    specs: input.specs?.trim() ?? "",
    status: "ready_for_quote",
    createdAt: nowIso(),
  };
}

function estimateBasePrice(productName: string) {
  const normalized = productName.toLowerCase();

  if (normalized.includes("monitor")) {
    return 248;
  }

  if (normalized.includes("laptop")) {
    return 980;
  }

  if (normalized.includes("chair")) {
    return 180;
  }

  if (normalized.includes("desk")) {
    return 340;
  }

  if (normalized.includes("keyboard")) {
    return 85;
  }

  return 145;
}

function chooseSupplierNames(productName: string) {
  const normalized = productName.toLowerCase();

  if (normalized.includes("monitor")) {
    return {
      quotedSupplier: "Northwind Displays",
      marketSupplier: "Summit Pixel Supply",
    };
  }

  if (normalized.includes("laptop")) {
    return {
      quotedSupplier: "Cedar Ridge Computing",
      marketSupplier: "BluePeak Devices",
    };
  }

  if (normalized.includes("chair") || normalized.includes("desk")) {
    return {
      quotedSupplier: "Harbor Workspace Co.",
      marketSupplier: "Forge Office Interiors",
    };
  }

  return {
    quotedSupplier: "Anchor Industrial Supply",
    marketSupplier: "Atlas Procurement Group",
  };
}

function buildPublicSourceUrl(productName: string) {
  const query = encodeURIComponent(`${productName} price supplier`);
  return `https://www.google.com/search?q=${query}`;
}

export function buildMockExtractedQuote(input: {
  request: PurchaseRequest;
  fileName?: string;
  sourceSummary: string;
}): ExtractedQuote {
  const basePrice = estimateBasePrice(input.request.productName);
  const supplierNames = chooseSupplierNames(input.request.productName);
  const quantity = input.request.quantity;

  return {
    id: createId("extract"),
    requestId: input.request.id,
    supplierName: supplierNames.quotedSupplier,
    productName: input.request.productName,
    unitPrice: Math.round(basePrice * 1.02),
    quantity,
    sourceDocumentName: input.fileName ?? SAMPLE_DOCUMENT.fileName,
    sourceSummary: input.sourceSummary,
    confidence: 0.97,
    createdAt: nowIso(),
  };
}

export function buildMockSupplierQuotes(input: {
  request: PurchaseRequest;
  extractedQuote: ExtractedQuote;
}): SupplierQuote[] {
  const basePrice = estimateBasePrice(input.request.productName);
  const supplierNames = chooseSupplierNames(input.request.productName);
  const quantity = input.request.quantity;
  const quotedInventory =
    quantity > 140 ? Math.floor(quantity * 0.82) : quantity + 20;
  const marketInventory = quantity + Math.max(50, Math.floor(quantity * 0.45));
  const publicSourceUrl = buildPublicSourceUrl(input.request.productName);

  const extractedSupplier: SupplierQuote = {
    id: createId("quote"),
    requestId: input.request.id,
    supplierName: input.extractedQuote.supplierName,
    price: input.extractedQuote.unitPrice,
    inventory: quotedInventory,
    deliveryDays: quantity > 160 ? 7 : 6,
    rating: 4.4,
    source: "OCR quote extraction",
    priceObserved: true,
    extractedFromOCR: true,
  };

  const marketSupplier: SupplierQuote = {
    id: createId("quote"),
    requestId: input.request.id,
    supplierName: supplierNames.marketSupplier,
    price: Math.max(Math.round(basePrice * 0.99), extractedSupplier.price - 6),
    inventory: marketInventory,
    deliveryDays: quantity > 160 ? 5 : 4,
    rating: 4.8,
    source: "Supplier search benchmark (price unavailable, estimate used)",
    sourceUrl: publicSourceUrl,
    priceObserved: false,
    supplierContactName: "Sales Desk",
    supplierContactEmail: "sales@example-supplier.com",
    supplierContactPhone: "+84832787977",
    agoraFollowUpSuggested: true,
    extractedFromOCR: false,
  };

  return [extractedSupplier, marketSupplier];
}
