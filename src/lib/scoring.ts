import {
  PurchaseRequest,
  Recommendation,
  SupplierQuote,
} from "@/lib/types";
import {
  buildProcurementIntelligence,
  prepareProcurementInputs,
} from "@/lib/procurement-intelligence";
import { clamp } from "@/lib/utils";

function priceCompetitivenessScore(quote: SupplierQuote, bestEffectiveUnitPrice: number) {
  const effectiveUnitPrice = quote.effectiveUnitPrice ?? quote.price;

  return clamp(bestEffectiveUnitPrice / effectiveUnitPrice, 0.72, 1.04);
}

function marketAlignmentScore(quote: SupplierQuote) {
  const variance = quote.marketVariancePct ?? 0;

  if (variance <= 0) {
    return clamp(1 - Math.abs(variance) * 0.01, 0.88, 1);
  }

  if (variance <= 2.5) {
    return clamp(0.96 - variance * 0.04, 0.82, 0.96);
  }

  if (variance <= 6) {
    return clamp(0.82 - (variance - 2.5) * 0.06, 0.58, 0.82);
  }

  return 0.42;
}

function supplyAdequacyScore(quote: SupplierQuote, request: PurchaseRequest) {
  const netAvailableStock = quote.netAvailableStock ?? quote.inventory;
  const coverageRatio = netAvailableStock / Math.max(request.quantity, 1);

  if (coverageRatio >= 1.15) {
    return 1;
  }

  if (coverageRatio >= 1) {
    return 0.94;
  }

  if (coverageRatio >= 0.85) {
    return 0.72;
  }

  return clamp(coverageRatio * 0.55, 0.18, 0.68);
}

function leadTimeScore(quote: SupplierQuote, bestLeadTimeDays: number) {
  const urgencyModifier =
    quote.urgencyLevel === "high" ? 0.92 : quote.urgencyLevel === "medium" ? 0.97 : 1;

  return clamp((bestLeadTimeDays / quote.deliveryDays) * urgencyModifier, 0.68, 1);
}

function moqScore(quote: SupplierQuote) {
  switch (quote.moqFit) {
    case "tier_upgrade":
      return 0.93;
    case "rounded_to_multiple":
      return 0.88;
    case "below_moq":
      return 0.58;
    default:
      return 1;
  }
}

function describeMoqFit(quote: SupplierQuote, request: PurchaseRequest) {
  const buyQuantity = quote.recommendedBuyQuantity ?? request.quantity;
  const baseUnit = quote.baseUnit ?? "EA";

  switch (quote.moqFit) {
    case "tier_upgrade":
      return `tier-optimized at ${buyQuantity} ${baseUnit}`;
    case "rounded_to_multiple":
      return `rounded to ${buyQuantity} ${baseUnit} for supplier pack multiples`;
    case "below_moq":
      return `lifted to ${buyQuantity} ${baseUnit} to satisfy supplier MOQ`;
    default:
      return `exact MOQ fit at ${buyQuantity} ${baseUnit}`;
  }
}

function factorSentence(
  chosen: SupplierQuote,
  runnerUp: SupplierQuote | undefined,
  request: PurchaseRequest,
) {
  const factors: string[] = [];

  if ((chosen.marketVariancePct ?? 0) <= 0) {
    factors.push(
      `${Math.abs(chosen.marketVariancePct ?? 0).toFixed(1)}% below market median`,
    );
  } else if ((chosen.marketVariancePct ?? 0) <= 2.5) {
    factors.push("inside the market benchmark band");
  } else {
    factors.push("strongest commercial outcome despite above-market pricing");
  }

  factors.push(describeMoqFit(chosen, request));

  if ((chosen.netAvailableStock ?? chosen.inventory) >= request.quantity) {
    factors.push(
      `${chosen.netAvailableStock ?? chosen.inventory} ${chosen.baseUnit ?? "EA"} net available after buffer`,
    );
  } else {
    factors.push(
      `best available supply position with only ${
        chosen.stockGapUnits ?? Math.max(0, request.quantity - chosen.inventory)
      } ${chosen.baseUnit ?? "EA"} uncovered`,
    );
  }

  if (runnerUp && chosen.deliveryDays < runnerUp.deliveryDays) {
    factors.push(`${runnerUp.deliveryDays - chosen.deliveryDays} days faster lead time`);
  } else {
    factors.push(`${chosen.deliveryDays}-day lead time`);
  }

  return factors.slice(0, 4);
}

export function scoreSupplierQuotes(input: {
  request: PurchaseRequest;
  supplierQuotes: SupplierQuote[];
}): {
  supplierQuotes: SupplierQuote[];
  recommendation: Recommendation;
} {
  const procurementInputs = prepareProcurementInputs(input);
  const bestEffectiveUnitPrice = Math.min(
    ...procurementInputs.supplierQuotes.map(
      (quote) => quote.effectiveUnitPrice ?? quote.price,
    ),
  );
  const bestLeadTimeDays = Math.min(
    ...procurementInputs.supplierQuotes.map((quote) => quote.deliveryDays),
  );

  const enrichedQuotes = procurementInputs.supplierQuotes.map((quote) => {
    const priceScore = priceCompetitivenessScore(quote, bestEffectiveUnitPrice);
    const benchmarkScore = marketAlignmentScore(quote);
    const supplyScore = supplyAdequacyScore(quote, input.request);
    const deliveryScore = leadTimeScore(quote, bestLeadTimeDays);
    const fitScore = moqScore(quote);
    const ratingScore = quote.rating / 5;

    const score = Math.round(
      (priceScore * 0.28 +
        benchmarkScore * 0.18 +
        supplyScore * 0.24 +
        deliveryScore * 0.14 +
        fitScore * 0.1 +
        ratingScore * 0.06) *
        100,
    );

    return {
      ...quote,
      score,
    };
  });

  const rankedQuotes = [...enrichedQuotes].sort((left, right) => {
    if ((right.score ?? 0) !== (left.score ?? 0)) {
      return (right.score ?? 0) - (left.score ?? 0);
    }

    return (left.effectiveUnitPrice ?? left.price) - (right.effectiveUnitPrice ?? right.price);
  });

  const [winner, runnerUp] = rankedQuotes;
  const procurementIntelligence = buildProcurementIntelligence({
    selectedSupplierName: winner.supplierName,
    procurementInputs: {
      ...procurementInputs,
      supplierQuotes: enrichedQuotes,
    },
  });
  const decisionFactors = factorSentence(winner, runnerUp, input.request);
  const estimatedSavings = runnerUp
    ? Math.max(
        0,
        ((runnerUp.effectiveUnitPrice ?? runnerUp.price) -
          (winner.effectiveUnitPrice ?? winner.price)) *
          input.request.quantity,
      )
    : 0;
  const speedAdvantageDays = runnerUp
    ? Math.max(0, runnerUp.deliveryDays - winner.deliveryDays)
    : 0;
  const marketCallout =
    (winner.marketVariancePct ?? 0) <= 0
      ? `${Math.abs(winner.marketVariancePct ?? 0).toFixed(1)}% below market median`
      : `${(winner.marketVariancePct ?? 0).toFixed(1)}% above market median`;
  const stockCallout = `${
    winner.netAvailableStock ?? winner.inventory
  } ${winner.baseUnit ?? "EA"} net available after safety buffer`;

  return {
    supplierQuotes: enrichedQuotes,
    recommendation: {
      requestId: input.request.id,
      supplierName: winner.supplierName,
      score: winner.score ?? 0,
      rationale: `Recommended supplier: ${winner.supplierName}. ${marketCallout}, ${describeMoqFit(
        winner,
        input.request,
      )}, ${stockCallout}, and ${winner.deliveryDays}-day delivery.`,
      estimatedSavings: Math.round(estimatedSavings),
      speedAdvantageDays,
      decisionFactors,
      procurementIntelligence,
    },
  };
}
