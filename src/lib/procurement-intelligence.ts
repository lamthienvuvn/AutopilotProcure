import {
  MarketBenchmarkInsight,
  MarketPosition,
  MoqFitStatus,
  NegotiationAction,
  NegotiationGuidance,
  ProcurementIntelligence,
  PurchaseRequest,
  SupplierMoqAnalysis,
  SupplierQuote,
  SupplierSupplyContext,
  UrgencyLevel,
} from "@/lib/types";
import { clamp, formatCurrency } from "@/lib/utils";

type ProductProfile = {
  canonicalProductName: string;
  canonicalProductId: string;
  baseUnit: string;
  marketBasePrice: number;
  benchmarkSpread: number;
  planningWindowDays: number;
  safetyBufferRatio: number;
  typicalMoq: number;
  orderMultiple: number;
  landedCostPerOrder: number;
};

type ProcurementInputs = {
  canonicalProductName: string;
  canonicalProductId: string;
  baseUnit: string;
  marketBenchmark: MarketBenchmarkInsight;
  supplierQuotes: SupplierQuote[];
  moqAnalyses: SupplierMoqAnalysis[];
  stockContexts: SupplierSupplyContext[];
  planningWindowDays: number;
  dailyDemand: number;
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round(value * 10) / 10;
}

function alignUp(value: number, multiple: number) {
  return Math.ceil(value / multiple) * multiple;
}

function supplierSeed(name: string) {
  return [...name].reduce((total, character) => total + character.charCodeAt(0), 0);
}

function supplierInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3);
}

function quantityDiscountFactor(quantity: number) {
  if (quantity >= 250) {
    return 0.93;
  }

  if (quantity >= 150) {
    return 0.955;
  }

  if (quantity >= 100) {
    return 0.97;
  }

  if (quantity >= 50) {
    return 0.985;
  }

  if (quantity >= 25) {
    return 0.995;
  }

  return 1;
}

function specAdjustmentFactor(request: PurchaseRequest) {
  const normalized = `${request.productName} ${request.specs}`.toLowerCase();
  let adjustment = 1;

  if (normalized.includes("usb-c")) {
    adjustment += 0.01;
  }

  if (normalized.includes("ips")) {
    adjustment += 0.008;
  }

  if (normalized.includes("4k")) {
    adjustment += 0.04;
  }

  if (normalized.includes("ergonomic")) {
    adjustment += 0.02;
  }

  if (normalized.includes("adjustable")) {
    adjustment += 0.015;
  }

  if (normalized.includes("dell")) {
    adjustment += 0.008;
  }

  return adjustment;
}

function buildProductProfile(request: PurchaseRequest): ProductProfile {
  const normalized = `${request.productName} ${request.specs}`.toLowerCase();

  if (normalized.includes("monitor")) {
    return {
      canonicalProductName: "Business Monitor 27-inch Class",
      canonicalProductId: "MON-27-BIZ",
      baseUnit: "EA",
      marketBasePrice: 248,
      benchmarkSpread: 0.045,
      planningWindowDays: 30,
      safetyBufferRatio: 0.15,
      typicalMoq: 60,
      orderMultiple: 10,
      landedCostPerOrder: 58,
    };
  }

  if (normalized.includes("laptop")) {
    return {
      canonicalProductName: "Business Laptop 14-15-inch Class",
      canonicalProductId: "LTP-BIZ",
      baseUnit: "EA",
      marketBasePrice: 980,
      benchmarkSpread: 0.055,
      planningWindowDays: 21,
      safetyBufferRatio: 0.12,
      typicalMoq: 20,
      orderMultiple: 5,
      landedCostPerOrder: 96,
    };
  }

  if (normalized.includes("chair")) {
    return {
      canonicalProductName: "Ergonomic Office Chair",
      canonicalProductId: "CHR-ERG-OFF",
      baseUnit: "EA",
      marketBasePrice: 180,
      benchmarkSpread: 0.07,
      planningWindowDays: 45,
      safetyBufferRatio: 0.18,
      typicalMoq: 50,
      orderMultiple: 10,
      landedCostPerOrder: 72,
    };
  }

  if (normalized.includes("desk")) {
    return {
      canonicalProductName: "Office Workstation Desk",
      canonicalProductId: "DSK-WKS",
      baseUnit: "EA",
      marketBasePrice: 340,
      benchmarkSpread: 0.07,
      planningWindowDays: 45,
      safetyBufferRatio: 0.18,
      typicalMoq: 20,
      orderMultiple: 5,
      landedCostPerOrder: 88,
    };
  }

  if (normalized.includes("keyboard")) {
    return {
      canonicalProductName: "Business Keyboard",
      canonicalProductId: "KBD-BIZ",
      baseUnit: "EA",
      marketBasePrice: 85,
      benchmarkSpread: 0.08,
      planningWindowDays: 30,
      safetyBufferRatio: 0.15,
      typicalMoq: 100,
      orderMultiple: 20,
      landedCostPerOrder: 42,
    };
  }

  return {
    canonicalProductName: request.productName,
    canonicalProductId: "GEN-MRO",
    baseUnit: "EA",
    marketBasePrice: 145,
    benchmarkSpread: 0.08,
    planningWindowDays: 30,
    safetyBufferRatio: 0.15,
    typicalMoq: 40,
    orderMultiple: 10,
    landedCostPerOrder: 54,
  };
}

function buildSupplierSku(quote: SupplierQuote, profile: ProductProfile) {
  const supplierPrefix = supplierInitials(quote.supplierName);
  const variantSuffix = quote.extractedFromOCR ? "Q" : "B";
  const profilePrefix = profile.canonicalProductId.replace(/-/g, "").slice(0, 6);

  return `${supplierPrefix}-${profilePrefix}-${variantSuffix}`;
}

function describeVariance(value: number) {
  if (value === 0) {
    return "at market median";
  }

  return `${Math.abs(value).toFixed(1)}% ${value > 0 ? "above" : "below"} median`;
}

function marketPositionForPrice(
  quotePrice: number,
  marketLow: number,
  marketHigh: number,
): MarketPosition {
  if (quotePrice < marketLow) {
    return "below_market";
  }

  if (quotePrice > marketHigh) {
    return "above_market";
  }

  return "within_market";
}

function buildMarketBenchmark(
  request: PurchaseRequest,
  supplierQuotes: SupplierQuote[],
  profile: ProductProfile,
) {
  const marketMedian = roundCurrency(
    profile.marketBasePrice *
      quantityDiscountFactor(request.quantity) *
      specAdjustmentFactor(request),
  );
  const marketLow = roundCurrency(marketMedian * (1 - profile.benchmarkSpread));
  const marketHigh = roundCurrency(
    marketMedian * (1 + profile.benchmarkSpread * 1.25),
  );

  const supplierComparisons = supplierQuotes.map((quote) => {
    const variancePct = roundPercent(((quote.price - marketMedian) / marketMedian) * 100);

    return {
      supplierName: quote.supplierName,
      quotePrice: quote.price,
      variancePct,
      position: marketPositionForPrice(quote.price, marketLow, marketHigh),
    };
  });

  const lowestQuote =
    [...supplierComparisons].sort((left, right) => left.quotePrice - right.quotePrice)[0] ??
    supplierComparisons[0];
  const highestQuote =
    [...supplierComparisons].sort((left, right) => right.quotePrice - left.quotePrice)[0] ??
    supplierComparisons[0];

  return {
    marketBenchmark: {
      marketLow,
      marketMedian,
      marketHigh,
      currency: "USD",
      priceBandLabel: `${formatCurrency(marketLow)}-${formatCurrency(
        marketHigh,
      )} normal buy band`,
      supplierComparisons,
      summary: `${profile.canonicalProductName} benchmarks at ${formatCurrency(
        marketMedian,
      )} median per unit, with a normal market band of ${formatCurrency(
        marketLow,
      )}-${formatCurrency(marketHigh)}. ${lowestQuote.supplierName} is ${describeVariance(
        lowestQuote.variancePct,
      )}, while ${highestQuote.supplierName} is ${describeVariance(
        highestQuote.variancePct,
      )}.`,
    },
  };
}

function buildMoqAnalysis(
  request: PurchaseRequest,
  quote: SupplierQuote,
  profile: ProductProfile,
): SupplierMoqAnalysis {
  const seedOffset = supplierSeed(quote.supplierName) % 2;
  const orderMultiple = quote.extractedFromOCR
    ? profile.orderMultiple
    : profile.orderMultiple * 2;
  const baseMoq =
    profile.typicalMoq +
    (quote.extractedFromOCR ? seedOffset * profile.orderMultiple : profile.orderMultiple * 2);
  const compliantQuantity = alignUp(
    Math.max(request.quantity, baseMoq),
    Math.max(orderMultiple, 1),
  );
  const requestTierQuantity = alignUp(
    Math.max(request.quantity, baseMoq + orderMultiple),
    Math.max(orderMultiple, 1),
  );
  const volumeBreakQuantity = alignUp(
    Math.max(requestTierQuantity + orderMultiple * 2, Math.ceil(request.quantity * 1.2)),
    Math.max(orderMultiple, 1),
  );
  const lowTierPremium = quote.extractedFromOCR ? 0.018 : 0.014;
  const volumeTierDiscount = quote.extractedFromOCR ? 0.016 : 0.022;
  const landedCost = profile.landedCostPerOrder + (quote.extractedFromOCR ? 10 : 0);

  const tiers = [
    {
      label: "MOQ tier",
      minQty: baseMoq,
      unitPrice: roundCurrency(quote.price * (1 + lowTierPremium)),
    },
    {
      label: "Request-fit tier",
      minQty: requestTierQuantity,
      unitPrice: roundCurrency(quote.price),
    },
    {
      label: "Volume break",
      minQty: volumeBreakQuantity,
      unitPrice: roundCurrency(quote.price * (1 - volumeTierDiscount)),
    },
  ]
    .filter(
      (tier, index, allTiers) =>
        allTiers.findIndex((candidate) => candidate.minQty === tier.minQty) === index,
    )
    .sort((left, right) => left.minQty - right.minQty)
    .map((tier) => ({
      ...tier,
      effectiveUnitPrice: roundCurrency(tier.unitPrice + landedCost / tier.minQty),
      eligible: tier.minQty <= compliantQuantity,
    }));

  const appliedTier =
    [...tiers].reverse().find((tier) => tier.minQty <= compliantQuantity) ?? tiers[0];
  const nextTier = tiers.find((tier) => tier.minQty > compliantQuantity) ?? null;
  const extraUnitsToNextTier = nextTier ? nextTier.minQty - compliantQuantity : Number.POSITIVE_INFINITY;
  const upgradeWorthwhile =
    nextTier !== null &&
    request.quantity >= baseMoq &&
    extraUnitsToNextTier < Math.max(orderMultiple, Math.ceil(request.quantity * 0.1)) &&
    nextTier.effectiveUnitPrice <= appliedTier.effectiveUnitPrice * 0.985;
  const selectedTier = upgradeWorthwhile && nextTier ? nextTier : appliedTier;

  let moqFit: MoqFitStatus = "exact_fit";

  if (request.quantity < baseMoq) {
    moqFit = "below_moq";
  } else if (upgradeWorthwhile && nextTier) {
    moqFit = "tier_upgrade";
  } else if (compliantQuantity !== request.quantity) {
    moqFit = "rounded_to_multiple";
  }

  return {
    supplierName: quote.supplierName,
    baseMoq,
    orderMultiple,
    requestedQuantity: request.quantity,
    recommendedBuyQuantity: upgradeWorthwhile && nextTier ? nextTier.minQty : compliantQuantity,
    moqFit,
    appliedTierLabel: selectedTier.label,
    effectiveUnitPrice: selectedTier.effectiveUnitPrice,
    nextTierQuantity: nextTier?.minQty ?? null,
    nextTierUnitPrice: nextTier?.effectiveUnitPrice ?? null,
    nextTierSavings: nextTier
      ? roundCurrency(
          Math.max(0, appliedTier.effectiveUnitPrice - nextTier.effectiveUnitPrice) *
            nextTier.minQty,
        )
      : 0,
    tiers,
  };
}

function buildSupplyContext(
  request: PurchaseRequest,
  quote: SupplierQuote,
  profile: ProductProfile,
  moqAnalysis: SupplierMoqAnalysis,
): SupplierSupplyContext {
  const safetyBufferUnits = Math.max(
    Math.ceil(request.quantity * profile.safetyBufferRatio),
    moqAnalysis.orderMultiple,
  );
  const netAvailableStock = Math.max(quote.inventory - safetyBufferUnits, 0);
  const dailyDemand = request.quantity / profile.planningWindowDays;
  const stockCoverDays = roundPercent(netAvailableStock / Math.max(dailyDemand, 0.1));
  const stockGapUnits = Math.max(request.quantity - netAvailableStock, 0);

  let urgencyLevel: UrgencyLevel = "low";

  if (
    stockGapUnits > 0 ||
    stockCoverDays < quote.deliveryDays * 1.25 ||
    quote.deliveryDays > profile.planningWindowDays * 0.4
  ) {
    urgencyLevel = "high";
  } else if (
    stockCoverDays < quote.deliveryDays * 2.5 ||
    stockCoverDays < profile.planningWindowDays
  ) {
    urgencyLevel = "medium";
  }

  const urgencyScore = Math.round(
    clamp(
      (stockGapUnits / Math.max(request.quantity, 1)) * 50 +
        ((quote.deliveryDays / profile.planningWindowDays) * 25 +
          (1 - clamp(stockCoverDays / (profile.planningWindowDays * 1.2), 0, 1)) * 25),
      8,
      96,
    ),
  );

  let urgencyReason = `Net available stock covers ${stockCoverDays.toFixed(
    1,
  )} days after the safety buffer, comfortably ahead of the ${quote.deliveryDays}-day lead time.`;

  if (stockGapUnits > 0) {
    urgencyReason = `After reserving a ${safetyBufferUnits} ${profile.baseUnit} safety buffer, the supplier is short ${stockGapUnits} ${profile.baseUnit} against demand.`;
  } else if (urgencyLevel === "medium") {
    urgencyReason = `Usable stock cover is ${stockCoverDays.toFixed(
      1,
    )} days, so lead-time slippage would quickly consume the buffer.`;
  } else if (urgencyLevel === "high") {
    urgencyReason = `Stock cover is only ${stockCoverDays.toFixed(
      1,
    )} days versus a ${quote.deliveryDays}-day lead time, so the order needs fast confirmation.`;
  }

  return {
    supplierName: quote.supplierName,
    supplierSku: buildSupplierSku(quote, profile),
    canonicalProductName: profile.canonicalProductName,
    canonicalProductId: profile.canonicalProductId,
    baseUnit: profile.baseUnit,
    normalizedRequestQuantity: request.quantity,
    normalizedAvailableStock: quote.inventory,
    safetyBufferUnits,
    netAvailableStock,
    stockCoverDays,
    leadTimeDays: quote.deliveryDays,
    stockGapUnits,
    urgencyLevel,
    urgencyScore,
    urgencyReason,
  };
}

function buildNegotiationGuidance(input: {
  marketBenchmark: MarketBenchmarkInsight;
  selectedQuote: SupplierQuote;
  selectedMoq: SupplierMoqAnalysis;
  selectedStock: SupplierSupplyContext;
}) {
  const { marketBenchmark, selectedQuote, selectedMoq, selectedStock } = input;
  const priceVariance = selectedQuote.marketVariancePct ?? 0;
  const hasUsableCoverage = selectedStock.netAvailableStock >= selectedStock.normalizedRequestQuantity;
  const nextTierLeverage =
    selectedMoq.nextTierQuantity &&
    selectedMoq.nextTierUnitPrice &&
    selectedMoq.nextTierUnitPrice < selectedMoq.effectiveUnitPrice
      ? selectedMoq.nextTierQuantity
      : null;

  let action: NegotiationAction = "buy_now";

  if (!hasUsableCoverage && selectedStock.urgencyLevel === "low") {
    action = "wait";
  } else if (
    priceVariance > 1.5 ||
    selectedMoq.moqFit !== "exact_fit" ||
    (Boolean(nextTierLeverage) && priceVariance > 0.75)
  ) {
    action = "negotiate";
  }

  const targetUnitPriceHigh = roundCurrency(
    Math.min(
      selectedQuote.price,
      marketBenchmark.marketMedian * 1.005,
      selectedMoq.nextTierUnitPrice
        ? selectedMoq.nextTierUnitPrice + 1.5
        : selectedQuote.price,
    ),
  );
  const targetUnitPriceLow = roundCurrency(
    Math.min(
      targetUnitPriceHigh - 0.25,
      Math.max(
        marketBenchmark.marketLow,
        Math.min(selectedQuote.price * 0.985, marketBenchmark.marketMedian * 0.98),
      ),
    ),
  );

  let headline = "Buy now: quote is inside the market band with healthy stock cover.";
  let rationale = `${selectedQuote.supplierName} is ${describeVariance(
    priceVariance,
  )} and still covers the requested volume after applying the safety buffer.`;
  let askPoints = [
    `Proceed at the current commercial terms if the supplier confirms stock reservation today.`,
    `If procurement opens a commercial ask, anchor between ${formatCurrency(
      targetUnitPriceLow,
    )} and ${formatCurrency(targetUnitPriceHigh)} per unit.`,
    `Request written confirmation on lead time and reserved stock before final release.`,
  ];

  if (action === "negotiate") {
    headline = "Negotiate: there is price or MOQ leverage before releasing the order.";
    rationale = `${selectedQuote.supplierName} is ${describeVariance(
      priceVariance,
    )}, and the current MOQ structure leaves room to push closer to the market median.`;
    askPoints = [
      `Open at ${formatCurrency(targetUnitPriceLow)}-${formatCurrency(
        targetUnitPriceHigh,
      )} per unit using the ${formatCurrency(
        marketBenchmark.marketMedian,
      )} market median as the anchor.`,
      nextTierLeverage
        ? `Ask the supplier to honor the ${nextTierLeverage} ${selectedStock.baseUnit} tier on the current requirement.`
        : `Push for a concession tied to the current MOQ and order multiple rather than accepting list pricing.`,
      `Trade speed or payment timing only if the supplier also commits stock allocation and ship date.`,
    ];
  }

  if (action === "wait") {
    headline = "Wait: inventory depth is not strong enough to justify immediate release.";
    rationale = `${selectedQuote.supplierName} does not cover the requirement after reserving buffer stock, so buying immediately increases service risk.`;
    askPoints = [
      `Hold the release until the supplier confirms replenishment timing or additional allocatable stock.`,
      `Re-open negotiations only if the quote moves into the ${formatCurrency(
        targetUnitPriceLow,
      )}-${formatCurrency(targetUnitPriceHigh)} range with better coverage.`,
      `Use the lower-risk supplier as leverage if timing allows.`,
    ];
  }

  return {
    action,
    supplierName: selectedQuote.supplierName,
    headline,
    rationale,
    targetUnitPriceLow,
    targetUnitPriceHigh,
    askPoints,
  } satisfies NegotiationGuidance;
}

export function prepareProcurementInputs(input: {
  request: PurchaseRequest;
  supplierQuotes: SupplierQuote[];
}): ProcurementInputs {
  const profile = buildProductProfile(input.request);
  const { marketBenchmark } = buildMarketBenchmark(
    input.request,
    input.supplierQuotes,
    profile,
  );
  const moqAnalyses = input.supplierQuotes.map((quote) =>
    buildMoqAnalysis(input.request, quote, profile),
  );
  const stockContexts = input.supplierQuotes.map((quote, index) =>
    buildSupplyContext(input.request, quote, profile, moqAnalyses[index]),
  );
  const dailyDemand = roundPercent(input.request.quantity / profile.planningWindowDays);

  const supplierQuotes = input.supplierQuotes.map((quote, index) => {
    const comparison = marketBenchmark.supplierComparisons.find(
      (item) => item.supplierName === quote.supplierName,
    );
    const moqAnalysis = moqAnalyses[index];
    const stockContext = stockContexts[index];

    return {
      ...quote,
      supplierSku: stockContext.supplierSku,
      canonicalProductName: profile.canonicalProductName,
      canonicalProductId: profile.canonicalProductId,
      baseUnit: profile.baseUnit,
      normalizedRequestedQuantity: input.request.quantity,
      normalizedInventory: quote.inventory,
      normalizedAvailableStock: stockContext.normalizedAvailableStock,
      safetyBufferUnits: stockContext.safetyBufferUnits,
      netAvailableStock: stockContext.netAvailableStock,
      stockCoverDays: stockContext.stockCoverDays,
      stockGapUnits: stockContext.stockGapUnits,
      urgencyLevel: stockContext.urgencyLevel,
      urgencyScore: stockContext.urgencyScore,
      urgencyReason: stockContext.urgencyReason,
      marketVariancePct: comparison?.variancePct ?? 0,
      marketPosition: comparison?.position ?? "within_market",
      baseMoq: moqAnalysis.baseMoq,
      orderMultiple: moqAnalysis.orderMultiple,
      recommendedBuyQuantity: moqAnalysis.recommendedBuyQuantity,
      effectiveUnitPrice: moqAnalysis.effectiveUnitPrice,
      moqFit: moqAnalysis.moqFit,
      appliedTierLabel: moqAnalysis.appliedTierLabel,
      nextTierQuantity: moqAnalysis.nextTierQuantity,
      nextTierUnitPrice: moqAnalysis.nextTierUnitPrice,
      nextTierSavings: moqAnalysis.nextTierSavings,
      tiers: moqAnalysis.tiers,
      inventorySufficient: stockContext.netAvailableStock >= input.request.quantity,
      totalPrice: roundCurrency(quote.price * input.request.quantity),
    };
  });

  return {
    canonicalProductName: profile.canonicalProductName,
    canonicalProductId: profile.canonicalProductId,
    baseUnit: profile.baseUnit,
    marketBenchmark,
    supplierQuotes,
    moqAnalyses,
    stockContexts,
    planningWindowDays: profile.planningWindowDays,
    dailyDemand,
  };
}

export function buildProcurementIntelligence(input: {
  selectedSupplierName: string;
  procurementInputs: ProcurementInputs;
}) {
  const selectedQuote =
    input.procurementInputs.supplierQuotes.find(
      (quote) => quote.supplierName === input.selectedSupplierName,
    ) ?? input.procurementInputs.supplierQuotes[0];
  const alternativeQuote =
    input.procurementInputs.supplierQuotes.find(
      (quote) => quote.supplierName !== selectedQuote.supplierName,
    ) ?? input.procurementInputs.supplierQuotes[0];
  const selectedMoq =
    input.procurementInputs.moqAnalyses.find(
      (analysis) => analysis.supplierName === selectedQuote.supplierName,
    ) ?? input.procurementInputs.moqAnalyses[0];
  const alternativeMoq =
    input.procurementInputs.moqAnalyses.find(
      (analysis) => analysis.supplierName !== selectedQuote.supplierName,
    ) ?? input.procurementInputs.moqAnalyses[0];
  const selectedStock =
    input.procurementInputs.stockContexts.find(
      (context) => context.supplierName === selectedQuote.supplierName,
    ) ?? input.procurementInputs.stockContexts[0];
  const negotiationGuidance = buildNegotiationGuidance({
    marketBenchmark: input.procurementInputs.marketBenchmark,
    selectedQuote,
    selectedMoq,
    selectedStock,
  });

  return {
    canonicalProductName: input.procurementInputs.canonicalProductName,
    canonicalProductId: input.procurementInputs.canonicalProductId,
    baseUnit: input.procurementInputs.baseUnit,
    marketBenchmark: input.procurementInputs.marketBenchmark,
    moqImpact: {
      requestedQuantity: selectedMoq.requestedQuantity,
      recommendedBuyQuantity: selectedMoq.recommendedBuyQuantity,
      selectedSupplier: selectedQuote.supplierName,
      supplierAnalyses: input.procurementInputs.moqAnalyses,
      summary: `${selectedQuote.supplierName} fits the request at ${
        selectedMoq.recommendedBuyQuantity
      } ${input.procurementInputs.baseUnit} with ${selectedMoq.appliedTierLabel.toLowerCase()} economics. ${
        alternativeQuote.supplierName
      } needs ${
        alternativeMoq.moqFit === "exact_fit"
          ? "no MOQ adjustment"
          : `${alternativeMoq.moqFit.replace(/_/g, " ")} treatment`
      } for the same demand.`,
    },
    stockContext: {
      planningWindowDays: input.procurementInputs.planningWindowDays,
      dailyDemand: input.procurementInputs.dailyDemand,
      selectedSupplier: selectedQuote.supplierName,
      supplierContexts: input.procurementInputs.stockContexts,
      summary: `${selectedQuote.supplierName} normalizes to ${
        input.procurementInputs.canonicalProductId
      } in ${input.procurementInputs.baseUnit} units. Net allocatable stock is ${
        selectedStock.netAvailableStock
      } ${input.procurementInputs.baseUnit}, covering ${selectedStock.stockCoverDays.toFixed(
        1,
      )} days against a ${selectedStock.leadTimeDays}-day lead time, so urgency is ${
        selectedStock.urgencyLevel
      }.`,
    },
    negotiationGuidance,
  } satisfies ProcurementIntelligence;
}
