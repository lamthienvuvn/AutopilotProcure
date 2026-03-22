export type AdapterMode = "mock" | "live";

export type RequestStatus =
  | "ready_for_quote"
  | "quote_analyzed"
  | "recommended"
  | "draft_created";

export type ActivityType =
  | "system"
  | "request"
  | "quote"
  | "comparison"
  | "recommendation"
  | "order";

export type EventTone = "info" | "success" | "warning" | "error";
export type MarketPosition = "below_market" | "within_market" | "above_market";
export type MoqFitStatus =
  | "exact_fit"
  | "rounded_to_multiple"
  | "tier_upgrade"
  | "below_moq";
export type UrgencyLevel = "low" | "medium" | "high";
export type NegotiationAction = "buy_now" | "negotiate" | "wait";

export interface MoqTier {
  label: string;
  minQty: number;
  unitPrice: number;
  effectiveUnitPrice: number;
  eligible: boolean;
}

export interface MarketComparison {
  supplierName: string;
  quotePrice: number;
  variancePct: number;
  position: MarketPosition;
}

export interface MarketBenchmarkInsight {
  marketLow: number;
  marketMedian: number;
  marketHigh: number;
  currency: string;
  priceBandLabel: string;
  supplierComparisons: MarketComparison[];
  summary: string;
}

export interface SupplierMoqAnalysis {
  supplierName: string;
  baseMoq: number;
  orderMultiple: number;
  requestedQuantity: number;
  recommendedBuyQuantity: number;
  moqFit: MoqFitStatus;
  appliedTierLabel: string;
  effectiveUnitPrice: number;
  nextTierQuantity: number | null;
  nextTierUnitPrice: number | null;
  nextTierSavings: number;
  tiers: MoqTier[];
}

export interface SupplierSupplyContext {
  supplierName: string;
  supplierSku: string;
  canonicalProductName: string;
  canonicalProductId: string;
  baseUnit: string;
  normalizedRequestQuantity: number;
  normalizedAvailableStock: number;
  safetyBufferUnits: number;
  netAvailableStock: number;
  stockCoverDays: number;
  leadTimeDays: number;
  stockGapUnits: number;
  urgencyLevel: UrgencyLevel;
  urgencyScore: number;
  urgencyReason: string;
}

export interface NegotiationGuidance {
  action: NegotiationAction;
  supplierName: string;
  headline: string;
  rationale: string;
  targetUnitPriceLow: number;
  targetUnitPriceHigh: number;
  askPoints: string[];
}

export interface ProcurementIntelligence {
  canonicalProductName: string;
  canonicalProductId: string;
  baseUnit: string;
  marketBenchmark: MarketBenchmarkInsight;
  moqImpact: {
    requestedQuantity: number;
    recommendedBuyQuantity: number;
    selectedSupplier: string;
    supplierAnalyses: SupplierMoqAnalysis[];
    summary: string;
  };
  stockContext: {
    planningWindowDays: number;
    dailyDemand: number;
    selectedSupplier: string;
    supplierContexts: SupplierSupplyContext[];
    summary: string;
  };
  negotiationGuidance: NegotiationGuidance;
}

export interface PurchaseRequest {
  id: string;
  title: string;
  productName: string;
  quantity: number;
  specs: string;
  status: RequestStatus;
  createdAt: string;
}

export interface ExtractedQuote {
  id: string;
  requestId: string;
  supplierName: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  sourceDocumentName: string;
  sourceSummary: string;
  confidence: number;
  createdAt: string;
}

export interface SupplierQuote {
  id: string;
  requestId: string;
  supplierName: string;
  price: number;
  priceObserved?: boolean;
  inventory: number;
  deliveryDays: number;
  rating: number;
  source: string;
  sourceUrl?: string;
  supplierContactName?: string;
  supplierContactEmail?: string;
  supplierContactPhone?: string;
  agoraFollowUpSuggested?: boolean;
  extractedFromOCR: boolean;
  score?: number;
  inventorySufficient?: boolean;
  totalPrice?: number;
  supplierSku?: string;
  canonicalProductName?: string;
  canonicalProductId?: string;
  baseUnit?: string;
  normalizedRequestedQuantity?: number;
  normalizedInventory?: number;
  normalizedAvailableStock?: number;
  safetyBufferUnits?: number;
  netAvailableStock?: number;
  stockCoverDays?: number;
  stockGapUnits?: number;
  urgencyLevel?: UrgencyLevel;
  urgencyScore?: number;
  urgencyReason?: string;
  marketVariancePct?: number;
  marketPosition?: MarketPosition;
  baseMoq?: number;
  orderMultiple?: number;
  recommendedBuyQuantity?: number;
  effectiveUnitPrice?: number;
  moqFit?: MoqFitStatus;
  appliedTierLabel?: string;
  nextTierQuantity?: number | null;
  nextTierUnitPrice?: number | null;
  nextTierSavings?: number;
  tiers?: MoqTier[];
}

export interface Recommendation {
  requestId: string;
  supplierName: string;
  score: number;
  rationale: string;
  estimatedSavings: number;
  speedAdvantageDays: number;
  decisionFactors: string[];
  procurementIntelligence: ProcurementIntelligence;
}

export interface DraftOrder {
  id: string;
  referenceId: string;
  requestId: string;
  supplierName: string;
  productName: string;
  quantity: number;
  status: "draft_saved";
  createdAt: string;
  executionMode: AdapterMode;
  fallbackUsed: boolean;
  portalPath: string;
  contactName: string;
  shippingAddress: string;
  notes: string;
  portalName: string;
  portalSessionId: string;
  submittedBy: string;
  executionSummary: string[];
}

export interface ActivityEvent {
  id: string;
  requestId: string | null;
  type: ActivityType;
  tone: EventTone;
  message: string;
  createdAt: string;
}

export interface SampleDocument {
  id: string;
  label: string;
  fileName: string;
  summary: string;
  previewPath: string;
}

export interface SystemModes {
  ocr: AdapterMode;
  supplierSearch: AdapterMode;
  tinyFish: AdapterMode;
}

export interface DemoStore {
  requests: PurchaseRequest[];
  activeRequestId: string | null;
  agoraSystemPrompt: string;
  extractedQuote: ExtractedQuote | null;
  supplierQuotes: SupplierQuote[];
  recommendation: Recommendation | null;
  draftOrder: DraftOrder | null;
  activityEvents: ActivityEvent[];
}

export interface DashboardSnapshot {
  sampleRequestTemplate: PurchaseRequest;
  sampleDocument: SampleDocument;
  systemModes: SystemModes;
  agoraSystemPrompt: string;
  requests: PurchaseRequest[];
  activeRequestId: string | null;
  activeRequest: PurchaseRequest | null;
  extractedQuote: ExtractedQuote | null;
  supplierQuotes: SupplierQuote[];
  recommendation: Recommendation | null;
  draftOrder: DraftOrder | null;
  activityEvents: ActivityEvent[];
}

export interface ApiSnapshotResponse {
  snapshot: DashboardSnapshot;
  notice?: string;
}
