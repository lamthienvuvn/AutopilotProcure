import { NextResponse } from "next/server";
import {
  appendActivity,
  buildDashboardSnapshot,
  readStore,
  writeStore,
} from "@/lib/demo-store";
import { scoreSupplierQuotes } from "@/lib/scoring";
import { ApiSnapshotResponse } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    requestId?: string;
    supplierId?: string;
    negotiatedPrice?: number;
    summary?: string;
    accepted?: boolean;
  };

  const requestId = String(body.requestId ?? "").trim();
  const supplierId = String(body.supplierId ?? "").trim();
  const negotiatedPrice = Number(body.negotiatedPrice ?? 0);
  const summary = String(body.summary ?? "").trim();
  const accepted = Boolean(body.accepted);

  if (!requestId || !supplierId) {
    return NextResponse.json(
      { error: "requestId and supplierId are required." },
      { status: 400 },
    );
  }

  if (!Number.isFinite(negotiatedPrice) || negotiatedPrice <= 0) {
    return NextResponse.json(
      { error: "negotiatedPrice must be greater than zero." },
      { status: 400 },
    );
  }

  const store = readStore();
  const activeRequest = store.requests.find((item) => item.id === requestId);

  if (!activeRequest) {
    return NextResponse.json(
      { error: "Request not found." },
      { status: 404 },
    );
  }

  const supplierQuote = store.supplierQuotes.find((item) => item.id === supplierId);

  if (!supplierQuote) {
    return NextResponse.json(
      { error: "Supplier quote not found." },
      { status: 404 },
    );
  }

  supplierQuote.price = Math.round(negotiatedPrice * 100) / 100;
  supplierQuote.priceObserved = true;
  supplierQuote.source = accepted
    ? "Voice negotiation confirmed"
    : "Voice negotiation updated quote";

  const rescored = scoreSupplierQuotes({
    request: activeRequest,
    supplierQuotes: store.supplierQuotes,
  });

  store.supplierQuotes = rescored.supplierQuotes;
  store.recommendation = rescored.recommendation;

  appendActivity(store, {
    requestId: activeRequest.id,
    type: "comparison",
    tone: "success",
    message: `${supplierQuote.supplierName} updated to USD ${supplierQuote.price.toFixed(2)} per unit after laptop call negotiation.`,
  });

  appendActivity(store, {
    requestId: activeRequest.id,
    type: "recommendation",
    tone: "info",
    message:
      summary ||
      `${supplierQuote.supplierName} provided updated call feedback. Recommendation recalculated.`,
  });

  writeStore(store);

  const response: ApiSnapshotResponse = {
    snapshot: buildDashboardSnapshot(store),
  };

  return NextResponse.json(response);
}
