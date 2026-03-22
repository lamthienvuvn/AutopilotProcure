import { NextResponse } from "next/server";
import {
  appendActivity,
  buildDashboardSnapshot,
  readStore,
  writeStore,
} from "@/lib/demo-store";
import { ApiSnapshotResponse } from "@/lib/types";

type SavePromptRequest = {
  prompt?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as SavePromptRequest;
  const prompt = String(body.prompt ?? "").trim();

  if (!prompt) {
    return NextResponse.json(
      { error: "Prompt cannot be empty." },
      { status: 400 },
    );
  }

  const store = readStore();
  store.agoraSystemPrompt = prompt;

  appendActivity(store, {
    requestId: store.activeRequestId,
    type: "system",
    tone: "info",
    message: "Agora negotiation prompt updated from settings.",
  });

  writeStore(store);

  const response: ApiSnapshotResponse = {
    snapshot: buildDashboardSnapshot(store),
    notice: "Agora prompt saved. New calls will follow this prompt.",
  };

  return NextResponse.json(response);
}
