import { NextResponse } from "next/server";
import { extractQuoteData } from "@/lib/adapters/ocr";
import { discoverSupplierQuotes } from "@/lib/adapters/supplier-search";
import {
  appendActivity,
  buildDashboardSnapshot,
  readStore,
  writeStore,
} from "@/lib/demo-store";
import { SAMPLE_DOCUMENT } from "@/lib/seed-data";
import { scoreSupplierQuotes } from "@/lib/scoring";
import { ApiSnapshotResponse } from "@/lib/types";

export async function POST(request: Request) {
  const formData = await request.formData();
  const requestId = String(formData.get("requestId") ?? "");
  const source = String(formData.get("source") ?? "upload");
  const file = formData.get("file");
  const store = readStore();
  const activeRequest = store.requests.find((item) => item.id === requestId);

  if (!activeRequest) {
    return NextResponse.json(
      { error: "Create or select a purchase request before scanning a quote." },
      { status: 404 },
    );
  }

  const uploadedFile = file instanceof File ? file : null;
  const sourceDocumentName =
    source === "sample" ? SAMPLE_DOCUMENT.fileName : uploadedFile?.name;

  if (!sourceDocumentName) {
    return NextResponse.json(
      { error: "Upload a quote file or use the seeded sample document." },
      { status: 400 },
    );
  }

  const ocrResult = await extractQuoteData({
    request: activeRequest,
    fileName: sourceDocumentName,
    fileBuffer: uploadedFile
      ? Buffer.from(await uploadedFile.arrayBuffer())
      : undefined,
    sourceSummary:
      source === "sample"
        ? "Seeded sample quote"
        : "Uploaded supplier quote",
  });

  const supplierResult = await discoverSupplierQuotes({
    request: activeRequest,
    extractedQuote: ocrResult.extractedQuote,
  });

  const { supplierQuotes, recommendation } = scoreSupplierQuotes({
    request: activeRequest,
    supplierQuotes: supplierResult.supplierQuotes,
  });

  store.extractedQuote = ocrResult.extractedQuote;
  store.supplierQuotes = supplierQuotes;
  store.recommendation = recommendation;
  store.draftOrder = null;
  activeRequest.status = "recommended";

  appendActivity(store, {
    requestId: activeRequest.id,
    type: "quote",
    tone: "success",
    message: `Quote scanned from ${sourceDocumentName}.`,
  });

  appendActivity(store, {
    requestId: activeRequest.id,
    type: "quote",
    tone: "success",
    message: `Structured fields extracted for ${ocrResult.extractedQuote.supplierName}.`,
  });

  appendActivity(store, {
    requestId: activeRequest.id,
    type: "comparison",
    tone: "success",
    message:
      "Compared 2 suppliers across market benchmark, MOQ economics, stock cover, delivery, and rating.",
  });

  appendActivity(store, {
    requestId: activeRequest.id,
    type: "recommendation",
    tone: "success",
    message: recommendation.rationale,
  });

  appendActivity(store, {
    requestId: activeRequest.id,
    type: "recommendation",
    tone: "success",
    message:
      "Procurement intelligence ready: market benchmark, MOQ economics, stock cover, and negotiation guidance calculated.",
  });

  let notice = "";

  if (ocrResult.notice) {
    appendActivity(store, {
      requestId: activeRequest.id,
      type: "quote",
      tone: "warning",
      message: ocrResult.notice,
    });
    notice = ocrResult.notice;
  }

  if (supplierResult.notice) {
    appendActivity(store, {
      requestId: activeRequest.id,
      type: "comparison",
      tone: "warning",
      message: supplierResult.notice,
    });
    notice = notice ? `${notice} ${supplierResult.notice}` : supplierResult.notice;
  }

  writeStore(store);

  const response: ApiSnapshotResponse = {
    snapshot: buildDashboardSnapshot(store),
    notice: notice || undefined,
  };

  return NextResponse.json(response);
}
