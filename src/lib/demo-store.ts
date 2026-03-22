import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { getSystemModes } from "@/lib/config";
import {
  createInitialStore,
  DEFAULT_AGORA_SYSTEM_PROMPT,
  SAMPLE_DOCUMENT,
  SAMPLE_REQUEST_TEMPLATE,
} from "@/lib/seed-data";
import { ActivityEvent, DashboardSnapshot, DemoStore } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";

const STORE_PATH = path.join(process.cwd(), "data", "demo-store.json");

function ensureStoreFile() {
  mkdirSync(path.dirname(STORE_PATH), { recursive: true });

  if (!existsSync(STORE_PATH)) {
    writeFileSync(STORE_PATH, JSON.stringify(createInitialStore(), null, 2));
  }
}

export function readStore(): DemoStore {
  ensureStoreFile();

  const parsed = JSON.parse(readFileSync(STORE_PATH, "utf-8")) as DemoStore;

  if (!parsed.agoraSystemPrompt?.trim()) {
    parsed.agoraSystemPrompt =
      process.env.AGORA_LLM_SYSTEM_PROMPT?.trim() || DEFAULT_AGORA_SYSTEM_PROMPT;
  }

  return parsed;
}

export function writeStore(store: DemoStore) {
  ensureStoreFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function resetStore() {
  const previous = existsSync(STORE_PATH) ? readStore() : null;
  const initialStore = createInitialStore();

  if (previous?.agoraSystemPrompt?.trim()) {
    initialStore.agoraSystemPrompt = previous.agoraSystemPrompt;
  }

  writeStore(initialStore);

  return initialStore;
}

export function clearWorkflowState(store: DemoStore) {
  store.extractedQuote = null;
  store.supplierQuotes = [];
  store.recommendation = null;
  store.draftOrder = null;
}

export function appendActivity(
  store: DemoStore,
  event: Omit<ActivityEvent, "id" | "createdAt">,
) {
  const nextEvent: ActivityEvent = {
    ...event,
    id: createId("evt"),
    createdAt: nowIso(),
  };

  store.activityEvents = [nextEvent, ...store.activityEvents].slice(0, 16);

  return nextEvent;
}

export function buildDashboardSnapshot(store: DemoStore): DashboardSnapshot {
  const requests = [...store.requests].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
  const activeRequest =
    requests.find((request) => request.id === store.activeRequestId) ?? null;

  return {
    sampleRequestTemplate: SAMPLE_REQUEST_TEMPLATE,
    sampleDocument: SAMPLE_DOCUMENT,
    systemModes: getSystemModes(),
    agoraSystemPrompt:
      store.agoraSystemPrompt?.trim() ||
      process.env.AGORA_LLM_SYSTEM_PROMPT?.trim() ||
      DEFAULT_AGORA_SYSTEM_PROMPT,
    requests,
    activeRequestId: store.activeRequestId,
    activeRequest,
    extractedQuote: store.extractedQuote,
    supplierQuotes: store.supplierQuotes,
    recommendation: store.recommendation,
    draftOrder: store.draftOrder,
    activityEvents: [...store.activityEvents].sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    ),
  };
}

export function getDashboardSnapshot() {
  return buildDashboardSnapshot(readStore());
}

export function getDraftOrderById(orderId: string) {
  const store = readStore();

  if (store.draftOrder?.id === orderId) {
    return store.draftOrder;
  }

  return null;
}
