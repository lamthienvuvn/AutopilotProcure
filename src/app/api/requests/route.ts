import { NextResponse } from "next/server";
import {
  appendActivity,
  buildDashboardSnapshot,
  clearWorkflowState,
  readStore,
  writeStore,
} from "@/lib/demo-store";
import { createCustomRequest, createSampleRequest } from "@/lib/seed-data";
import { ApiSnapshotResponse } from "@/lib/types";
import { sanitizeText } from "@/lib/utils";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    mode: "sample" | "custom";
    productName?: string;
    quantity?: number | string;
    specs?: string;
  };

  const store = readStore();
  const useSample = body.mode === "sample";
  const quantity = Number(body.quantity);

  if (!useSample) {
    if (!sanitizeText(body.productName)) {
      return NextResponse.json(
        { error: "Add a product name before creating the request." },
        { status: 400 },
      );
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: "Quantity must be a whole number greater than zero." },
        { status: 400 },
      );
    }
  }

  const nextRequest = useSample
    ? createSampleRequest()
    : createCustomRequest({
        productName: sanitizeText(body.productName),
        quantity,
        specs: sanitizeText(body.specs),
      });

  clearWorkflowState(store);
  store.requests = [
    nextRequest,
    ...store.requests.filter((item) => item.id !== nextRequest.id),
  ];
  store.activeRequestId = nextRequest.id;

  appendActivity(store, {
    requestId: nextRequest.id,
    type: "request",
    tone: "success",
    message: useSample
      ? `Sample request loaded: ${nextRequest.title}.`
      : `Request created for ${nextRequest.quantity} ${nextRequest.productName}.`,
  });

  writeStore(store);

  const response: ApiSnapshotResponse = {
    snapshot: buildDashboardSnapshot(store),
  };

  return NextResponse.json(response);
}
