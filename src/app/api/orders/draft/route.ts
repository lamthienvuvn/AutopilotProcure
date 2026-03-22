import { NextResponse } from "next/server";
import { createDraftOrderWithTinyFish } from "@/lib/adapters/tinyfish";
import {
  appendActivity,
  buildDashboardSnapshot,
  readStore,
  writeStore,
} from "@/lib/demo-store";
import { ApiSnapshotResponse } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    requestId?: string;
    supplierId?: string;
  };
  const store = readStore();
  const activeRequest = store.requests.find((item) => item.id === body.requestId);
  const supplierQuote = store.supplierQuotes.find(
    (item) => item.id === body.supplierId,
  );

  if (!activeRequest || !supplierQuote) {
    return NextResponse.json(
      { error: "Re-run supplier comparison before drafting the order." },
      { status: 404 },
    );
  }

  if (
    store.draftOrder &&
    store.draftOrder.requestId === activeRequest.id &&
    store.draftOrder.supplierName === supplierQuote.supplierName
  ) {
    const existingResponse: ApiSnapshotResponse = {
      snapshot: buildDashboardSnapshot(store),
      notice: "Existing draft order reopened for the current supplier.",
    };

    return NextResponse.json(existingResponse);
  }

  appendActivity(store, {
    requestId: activeRequest.id,
    type: "order",
    tone: "info",
    message: `Auto-order started for ${supplierQuote.supplierName} at ${
      supplierQuote.recommendedBuyQuantity ?? activeRequest.quantity
    } ${supplierQuote.baseUnit ?? "EA"}.`,
  });

  const tinyFishResult = await createDraftOrderWithTinyFish({
    request: activeRequest,
    supplierQuote,
  });

  store.draftOrder = tinyFishResult.draftOrder;
  activeRequest.status = "draft_created";

  appendActivity(store, {
    requestId: activeRequest.id,
    type: "order",
    tone: "success",
    message: `Draft order ${tinyFishResult.draftOrder.referenceId} created for ${supplierQuote.supplierName}.`,
  });

  if (tinyFishResult.notice) {
    appendActivity(store, {
      requestId: activeRequest.id,
      type: "order",
      tone: "warning",
      message: tinyFishResult.notice,
    });
  }

  writeStore(store);

  const response: ApiSnapshotResponse = {
    snapshot: buildDashboardSnapshot(store),
    notice: tinyFishResult.notice,
  };

  return NextResponse.json(response);
}
