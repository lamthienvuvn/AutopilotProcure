"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AgoraLiveCallModal } from "@/components/agora-live-call-modal";
import { IntegrationsPanel } from "@/components/integrations-panel";
import {
  ActivityEvent,
  ActivityType,
  ApiSnapshotResponse,
  DashboardSnapshot,
  EventTone,
  MarketPosition,
  MoqFitStatus,
  NegotiationAction,
  SupplierQuote,
  SystemModes,
  UrgencyLevel,
} from "@/lib/types";
import { delay, formatCurrency, formatDateTime } from "@/lib/utils";

type BannerState = {
  tone: EventTone;
  message: string;
} | null;

type RecoveryState = "scan" | "order" | null;

type RunState =
  | { kind: "idle" }
  | {
      kind: "scan" | "order";
      title: string;
      steps: string[];
      activeStep: number;
      status: "working" | "success";
      detail: string;
    };

type AgoraLiveSession = {
  supplierName: string;
  channelName: string;
  appId: string;
  token: string;
  localUid: string;
  agentUid?: string;
  agentId: string;
};

const scanSteps = [
  "Uploading quote",
  "Scanning quote",
  "Extracting line items",
  "Comparing suppliers",
  "Preparing recommendation",
];

const scanStepNarratives = [
  "Validating the uploaded document and preparing it for OCR.",
  "Reading the supplier quote and isolating commercial fields from the scan.",
  "Normalizing supplier name, quantity, and price into structured line items.",
  "Checking a second supplier against market price, MOQ fit, stock cover, delivery, and rating.",
  "Generating deterministic procurement intelligence and a recommendation summary for approval.",
];

const orderSteps = [
  "Preparing order payload",
  "Connecting to supplier portal",
  "Logging in",
  "Filling draft order",
  "Draft order created",
];

const orderStepNarratives = [
  "Packaging product, quantity, shipping contact, and supplier pricing into a draft-safe order payload.",
  "Opening the supplier destination and confirming the correct vendor workspace.",
  "Starting a secure buying session through the TinyFish execution layer.",
  "Mapping product, quantity, and delivery fields into the supplier draft form.",
  "Saving the supplier-ready draft order and returning a reference for approval.",
];

function toneStyles(tone: EventTone) {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "error":
      return "border-rose-200 bg-rose-50 text-rose-900";
    default:
      return "border-slate-200 bg-white/80 text-slate-700";
  }
}

function eventDot(tone: EventTone) {
  switch (tone) {
    case "success":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "error":
      return "bg-rose-500";
    default:
      return "bg-slate-400";
  }
}

function modeBadgeLabel(label: string, mode: "mock" | "live") {
  return `${label}: Configured ${mode === "live" ? "Live" : "Mock"}`;
}

function requestStatusLabel(status: DashboardSnapshot["sampleRequestTemplate"]["status"]) {
  switch (status) {
    case "quote_analyzed":
      return "Quote analyzed";
    case "recommended":
      return "Supplier recommended";
    case "draft_created":
      return "Draft created";
    default:
      return "Ready for quote";
  }
}

function supplierInventoryLabel(quote: SupplierQuote, quantity: number) {
  if ((quote.inventorySufficient ?? false) || quote.inventory >= quantity) {
    return `${quote.inventory} available`;
  }

  return `${quote.inventory} available, short ${quantity - quote.inventory}`;
}

function formatUnitCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSignedPercent(value: number) {
  if (value === 0) {
    return "0.0%";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function marketPositionLabel(position: MarketPosition) {
  switch (position) {
    case "below_market":
      return "Below market";
    case "above_market":
      return "Above market";
    default:
      return "Within market";
  }
}

function marketPositionStyles(position: MarketPosition) {
  switch (position) {
    case "below_market":
      return "bg-emerald-100 text-emerald-800";
    case "above_market":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-sky-100 text-sky-800";
  }
}

function moqFitLabel(moqFit: MoqFitStatus) {
  switch (moqFit) {
    case "tier_upgrade":
      return "Tier upgrade";
    case "rounded_to_multiple":
      return "Rounded";
    case "below_moq":
      return "Below MOQ";
    default:
      return "Exact fit";
  }
}

function moqFitStyles(moqFit: MoqFitStatus) {
  switch (moqFit) {
    case "tier_upgrade":
      return "bg-sky-100 text-sky-800";
    case "rounded_to_multiple":
      return "bg-amber-100 text-amber-800";
    case "below_moq":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-emerald-100 text-emerald-800";
  }
}

function urgencyLabel(level: UrgencyLevel) {
  switch (level) {
    case "high":
      return "High urgency";
    case "medium":
      return "Medium urgency";
    default:
      return "Low urgency";
  }
}

function urgencyStyles(level: UrgencyLevel) {
  switch (level) {
    case "high":
      return "bg-rose-100 text-rose-800";
    case "medium":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-emerald-100 text-emerald-800";
  }
}

function negotiationActionLabel(action: NegotiationAction) {
  switch (action) {
    case "negotiate":
      return "Negotiate";
    case "wait":
      return "Wait";
    default:
      return "Buy now";
  }
}

function negotiationActionStyles(action: NegotiationAction) {
  switch (action) {
    case "negotiate":
      return "bg-amber-100 text-amber-900";
    case "wait":
      return "bg-slate-200 text-slate-900";
    default:
      return "bg-emerald-100 text-emerald-900";
  }
}

function runStateStepDetail(state: RunState) {
  if (state.kind === "idle") {
    return "";
  }

  const stepIndex = Math.max(0, state.activeStep);

  if (state.kind === "order") {
    return orderStepNarratives[stepIndex] ?? state.detail;
  }

  if (state.kind === "scan") {
    return scanStepNarratives[stepIndex] ?? state.detail;
  }

  return state.detail;
}

function activityTypeLabel(type: ActivityType) {
  switch (type) {
    case "request":
      return "Request";
    case "quote":
      return "Quote";
    case "comparison":
      return "Compare";
    case "recommendation":
      return "Recommend";
    case "order":
      return "Order";
    default:
      return "System";
  }
}

function activityTypeStyles(type: ActivityType) {
  switch (type) {
    case "request":
      return "bg-sky-50 text-sky-700";
    case "quote":
      return "bg-amber-50 text-amber-700";
    case "comparison":
      return "bg-violet-50 text-violet-700";
    case "recommendation":
      return "bg-emerald-50 text-emerald-700";
    case "order":
      return "bg-slate-900 text-white";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

async function parseSnapshotResponse(response: Response) {
  const data = (await response.json()) as ApiSnapshotResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error ?? "Something went wrong. Please try again.");
  }

  return data;
}

function resolveSelectedSupplierId(snapshot: DashboardSnapshot) {
  const recommendedName = snapshot.recommendation?.supplierName;

  return (
    snapshot.supplierQuotes.find(
      (quote) => quote.supplierName === recommendedName,
    )?.id ?? snapshot.supplierQuotes[0]?.id ?? null
  );
}

const workflowSteps = [
  "Start request",
  "Scan quote",
  "Review supplier",
  "Create draft",
];

function focusSection(sectionId: string) {
  document.getElementById(sectionId)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[28px] border border-white/70 bg-[var(--panel)] p-6 shadow-[0_18px_55px_rgba(16,32,45,0.08)] backdrop-blur ${className}`}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#10202d]">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-sm leading-6 text-slate-600">{subtitle}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function ModeBadge({
  label,
  mode,
}: {
  label: string;
  mode: SystemModes[keyof SystemModes];
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
        mode === "live"
          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
          : "border-white/15 bg-white/10 text-white/75"
      }`}
    >
      {modeBadgeLabel(label, mode)}
    </span>
  );
}

function EmptyState({
  eyebrow,
  title,
  body,
  bullets,
  actions,
}: {
  eyebrow?: string;
  title: string;
  body: string;
  bullets?: string[];
  actions?: React.ReactNode;
}) {
  return (
    <div className="rounded-[22px] border border-dashed border-slate-300/80 bg-white/55 p-6 text-sm leading-6 text-slate-600">
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {eyebrow}
        </p>
      ) : null}
      <p className="font-semibold text-slate-800">{title}</p>
      <p className="mt-2">{body}</p>
      {bullets?.length ? (
        <ul className="mt-4 space-y-2">
          {bullets.map((item, index) => (
            <li key={item} className="rounded-2xl bg-white/75 px-3 py-2">
              <span className="mr-2 font-semibold text-slate-900">{index + 1}.</span>
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      {actions ? <div className="mt-4 flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}

function ActivityItem({ event }: { event: ActivityEvent }) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className={`mt-1 h-2.5 w-2.5 rounded-full ${eventDot(event.tone)}`} />
        <span className="mt-2 h-full w-px bg-slate-200" />
      </div>
      <div className="pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${activityTypeStyles(event.type)}`}
          >
            {activityTypeLabel(event.type)}
          </span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            {formatDateTime(event.createdAt)}
          </span>
        </div>
        <p className="text-sm font-medium leading-6 text-slate-900">{event.message}</p>
      </div>
    </li>
  );
}

export function DashboardClient({
  initialSnapshot,
}: {
  initialSnapshot: DashboardSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [productName, setProductName] = useState(
    initialSnapshot.sampleRequestTemplate.productName,
  );
  const [quantity, setQuantity] = useState(
    String(initialSnapshot.sampleRequestTemplate.quantity),
  );
  const [specs, setSpecs] = useState(initialSnapshot.sampleRequestTemplate.specs);
  const [banner, setBanner] = useState<BannerState>(null);
  const [runState, setRunState] = useState<RunState>({ kind: "idle" });
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [draftingSupplierId, setDraftingSupplierId] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [recoveryState, setRecoveryState] = useState<RecoveryState>(null);
  const [lastScanSource, setLastScanSource] = useState<"sample" | "upload" | null>(
    null,
  );
  const [lastScanFile, setLastScanFile] = useState<File | null>(null);
  const [lastOrderSupplierId, setLastOrderSupplierId] = useState<string | null>(null);
  const [startingAgoraSupplierId, setStartingAgoraSupplierId] = useState<string | null>(
    null,
  );
  const [startingAgoraSource, setStartingAgoraSource] = useState<
    "official" | "laptop-demo" | null
  >(null);
  const [activeAgoraAgentId, setActiveAgoraAgentId] = useState<string | null>(null);
  const [activeAgoraLiveSession, setActiveAgoraLiveSession] =
    useState<AgoraLiveSession | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(
    resolveSelectedSupplierId(initialSnapshot),
  );
  const [agoraPromptDraft, setAgoraPromptDraft] = useState(
    initialSnapshot.agoraSystemPrompt,
  );
  const [isSavingAgoraPrompt, setIsSavingAgoraPrompt] = useState(false);

  const recommendedSupplierName = snapshot.recommendation?.supplierName;
  const procurementIntelligence = snapshot.recommendation?.procurementIntelligence ?? null;
  const activeRequest = snapshot.activeRequest;
  const recommendedSupplier =
    snapshot.supplierQuotes.find(
      (quote) => quote.supplierName === recommendedSupplierName,
    ) ?? snapshot.supplierQuotes[0];
  const selectedSupplier =
    snapshot.supplierQuotes.find((quote) => quote.id === selectedSupplierId) ??
    recommendedSupplier;
  const displaySupplierQuotes = [...snapshot.supplierQuotes].sort((left, right) => {
    const leftRecommended = left.supplierName === recommendedSupplierName ? 1 : 0;
    const rightRecommended = right.supplierName === recommendedSupplierName ? 1 : 0;

    if (leftRecommended !== rightRecommended) {
      return rightRecommended - leftRecommended;
    }

    return (right.score ?? 0) - (left.score ?? 0);
  });
  const selectedMoqAnalysis =
    procurementIntelligence?.moqImpact.supplierAnalyses.find(
      (analysis) => analysis.supplierName === selectedSupplier?.supplierName,
    ) ?? null;
  const selectedStockContext =
    procurementIntelligence?.stockContext.supplierContexts.find(
      (context) => context.supplierName === selectedSupplier?.supplierName,
    ) ?? null;
  const negotiationGuidance = procurementIntelligence?.negotiationGuidance ?? null;
  const orderTargetSupplier =
    snapshot.supplierQuotes.find((quote) => quote.id === draftingSupplierId) ??
    selectedSupplier;
  const isOrderOverlayVisible =
    runState.kind === "order" && runState.status === "working";
  const isScanPanelVisible = runState.kind === "scan";
  const workflowStepIndex = !activeRequest
    ? 0
    : !snapshot.extractedQuote
      ? 1
      : !snapshot.draftOrder
        ? 2
        : 3;

  useEffect(() => {
    setAgoraPromptDraft(snapshot.agoraSystemPrompt);
  }, [snapshot.agoraSystemPrompt]);

  function clearRecovery() {
    setRecoveryState(null);
  }

  async function retryLastScan() {
    if (!lastScanSource) {
      return;
    }

    await runQuoteAnalysis(lastScanSource, lastScanFile ?? undefined);
  }

  async function retryLastOrder() {
    if (!lastOrderSupplierId) {
      return;
    }

    await autoOrder(lastOrderSupplierId);
  }

  async function createRequest(mode: "sample" | "custom") {
    setIsSubmittingRequest(true);
    setBanner(null);
    clearRecovery();

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          productName,
          quantity,
          specs,
        }),
      });
      const data = await parseSnapshotResponse(response);

      setSnapshot(data.snapshot);
      setSelectedSupplierId(resolveSelectedSupplierId(data.snapshot));
      setRunState({ kind: "idle" });
      setLastScanSource(null);
      setLastScanFile(null);
      setLastOrderSupplierId(null);
      setSelectedSupplierId(null);
      setBanner({
        tone: "success",
        message:
          mode === "sample"
            ? "Sample request loaded. Scan a paper quote or use the seeded document to continue."
            : "Request created. Auto-Sourcing Pro is ready for quote scanning.",
      });
      focusSection("scan-quote");
      return true;
    } catch (error) {
      setBanner({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The request could not be created. Please try again.",
      });
      return false;
    } finally {
      setIsSubmittingRequest(false);
    }
  }

  async function handleCustomSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createRequest("custom");
  }

  async function startFreshSampleRun() {
    setIsResetting(true);
    setBanner(null);
    clearRecovery();

    try {
      await fetch("/api/reset", { method: "POST" });
      const created = await createRequest("sample");

      if (created) {
        setBanner({
          tone: "success",
          message:
            "New demo run is ready. Use the seeded quote to replay the full flow.",
        });
        focusSection("scan-quote");
      }
    } catch (error) {
      setBanner({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The sample replay could not be prepared. Please try again.",
      });
    } finally {
      setIsResetting(false);
    }
  }

  async function runQuoteAnalysis(source: "sample" | "upload", file?: File) {
    if (!snapshot.activeRequestId) {
      setBanner({
        tone: "warning",
        message: "Start by loading a purchase request before scanning a quote.",
      });
      return;
    }

    setIsAnalyzing(true);
    setBanner(null);
    clearRecovery();
    setLastScanSource(source);
    setLastScanFile(file ?? null);
    setRunState({
      kind: "scan",
      title: "Quote analysis in progress",
      steps: scanSteps,
      activeStep: 0,
      status: "working",
      detail:
        "The OCR adapter is structuring the paper quote and preparing market, MOQ, and supplier comparison logic.",
    });

    try {
      const formData = new FormData();
      formData.append("requestId", snapshot.activeRequestId);
      formData.append("source", source);

      if (file) {
        formData.append("file", file);
      }

      const responsePromise = fetch("/api/workflow/analyze", {
        method: "POST",
        body: formData,
      });

      for (let index = 0; index < scanSteps.length - 1; index += 1) {
        setRunState({
          kind: "scan",
          title: "Quote analysis in progress",
          steps: scanSteps,
          activeStep: index,
          status: "working",
          detail:
            index < 2
              ? "Turning the messy supplier document into structured line-item data."
              : "Benchmarking a second supplier and applying deterministic scoring.",
        });
        await delay(420);
      }

      const data = await parseSnapshotResponse(await responsePromise);

      setSnapshot(data.snapshot);
      setSelectedSupplierId((current) => {
        if (
          current &&
          data.snapshot.supplierQuotes.some((quote) => quote.id === current)
        ) {
          return current;
        }

        return resolveSelectedSupplierId(data.snapshot);
      });
      setRunState({
        kind: "scan",
        title: "Recommendation ready",
        steps: scanSteps,
        activeStep: scanSteps.length - 1,
        status: "success",
        detail:
          "Structured quote data, procurement benchmark, MOQ fit, and a recommended vendor are ready to review.",
      });
      setBanner(
        data.notice
          ? { tone: "warning", message: data.notice }
          : {
              tone: "success",
              message:
                "Quote structured successfully. Review the benchmark, MOQ fit, and recommendation before creating the draft order.",
            },
      );
      focusSection("comparison");
    } catch (error) {
      setRecoveryState("scan");
      setBanner({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Quote analysis failed. Try again or use the seeded sample document.",
      });
      setRunState({ kind: "idle" });
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    await runQuoteAnalysis("upload", file);
    event.target.value = "";
  }

  async function autoOrder(supplierId: string) {
    if (!snapshot.activeRequestId || draftingSupplierId) {
      return;
    }

    setDraftingSupplierId(supplierId);
    setBanner(null);
    clearRecovery();
    setLastOrderSupplierId(supplierId);
    setRunState({
      kind: "order",
      title: "TinyFish execution in progress",
      steps: orderSteps,
      activeStep: 0,
      status: "working",
      detail:
        "Auto-Sourcing Pro is assembling the supplier-ready payload and moving it into the portal draft flow.",
    });

    try {
      const responsePromise = fetch("/api/orders/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId: snapshot.activeRequestId,
          supplierId,
        }),
      });

      for (let index = 0; index < orderSteps.length - 1; index += 1) {
        setRunState({
          kind: "order",
          title: "TinyFish execution in progress",
          steps: orderSteps,
          activeStep: index,
          status: "working",
          detail:
            index < 2
              ? "Connecting to the supplier destination and verifying the draft session."
              : "Applying order details to the supplier draft form with duplicate protection enabled.",
        });
        await delay(460);
      }

      const data = await parseSnapshotResponse(await responsePromise);

      setSnapshot(data.snapshot);
      setSelectedSupplierId((current) => {
        if (
          current &&
          data.snapshot.supplierQuotes.some((quote) => quote.id === current)
        ) {
          return current;
        }

        return resolveSelectedSupplierId(data.snapshot);
      });
      setRunState({
        kind: "order",
        title: "Draft order created",
        steps: orderSteps,
        activeStep: orderSteps.length - 1,
        status: "success",
        detail:
          data.snapshot.draftOrder?.executionMode === "live"
            ? "The TinyFish live execution completed and the draft order is ready for portal review."
            : "The demo-safe TinyFish simulator completed the supplier draft and saved it for portal review.",
      });
      setBanner(
        data.notice
          ? { tone: "warning", message: data.notice }
          : {
              tone: "success",
              message:
                "Draft Order Created Successfully. The supplier-ready draft is now available in the portal preview.",
            },
      );
      focusSection("draft-result");
    } catch (error) {
      setRecoveryState("order");
      setBanner({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The draft order could not be created. Please retry the draft-order step.",
      });
      setRunState({ kind: "idle" });
    } finally {
      setDraftingSupplierId(null);
    }
  }

  async function startAgoraPriceCheck(
    quote: SupplierQuote,
    source: "official" | "laptop-demo" = "official",
  ) {
    const phoneNumber = quote.supplierContactPhone;

    if (source === "official" && !phoneNumber) {
      setBanner({
        tone: "warning",
        message: "No supplier phone is available for Agora price verification.",
      });
      return;
    }

    setStartingAgoraSupplierId(quote.id);
    setStartingAgoraSource(source);

    try {
      const response = await fetch("/api/agora/price-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          supplierName: quote.supplierName,
          phoneNumber: source === "official" ? phoneNumber : "",
          systemPrompt: snapshot.agoraSystemPrompt,
          source,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        agentId?: string;
        channelName?: string;
        allowedPhone?: string;
        promptSource?: string;
        rtc?: {
          appId?: string;
          channelName?: string;
          token?: string;
          tokenSource?: string;
          tokenExpiresAt?: number | null;
          localUid?: string;
          agentUid?: string;
        };
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Agora price check could not be started.");
      }

      setActiveAgoraAgentId(payload.agentId ?? null);

      if (source === "laptop-demo" && payload.agentId) {
        // For laptop-demo, open modal with OpenAI+ElevenLabs (no RTC needed)
        setActiveAgoraLiveSession({
          supplierName: quote.supplierName,
          channelName: `demo-${payload.agentId}`,
          appId: "demo-mode",
          token: "", // No token needed for OpenAI+ElevenLabs
          localUid: "1",
          agentUid: "0",
          agentId: payload.agentId,
        });
      } else if (
        source === "official" &&
        payload.agentId &&
        payload.rtc?.appId &&
        payload.rtc?.channelName &&
        payload.rtc?.token &&
        payload.rtc?.localUid
      ) {
        // For official calls, use Agora RTC with negotiation session
        setActiveAgoraLiveSession({
          supplierName: quote.supplierName,
          channelName: payload.rtc.channelName,
          appId: payload.rtc.appId,
          token: payload.rtc.token,
          localUid: payload.rtc.localUid,
          agentUid: payload.rtc.agentUid,
          agentId: payload.agentId,
        });
      }

      setBanner({
        tone: "success",
        message:
          source === "laptop-demo"
            ? `Laptop demo now runs through real Agora session. Channel ${payload.channelName}, Agent ${payload.agentId ?? "N/A"}, restricted to ${payload.allowedPhone}. Prompt source: ${payload.promptSource ?? "unknown"}.`
            : `Agora price-check started on channel ${payload.channelName}. Agent ${payload.agentId ?? "N/A"}. Restricted to ${payload.allowedPhone}. Prompt source: ${payload.promptSource ?? "unknown"}.`,
      });

      if (payload.rtc?.tokenSource === "static-env") {
        setBanner({
          tone: "warning",
          message:
            "RTC token source is static env. If you see CAN_NOT_GET_GATEWAY_SERVER or invalid token, set AGORA_APP_CERTIFICATE to enable auto-generated fresh token.",
        });
      }
    } catch (error) {
      setBanner({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Agora price check could not be started.",
      });
    } finally {
      setStartingAgoraSupplierId(null);
      setStartingAgoraSource(null);
    }
  }

  async function saveAgoraPromptSettings() {
    if (!agoraPromptDraft.trim()) {
      setBanner({
        tone: "warning",
        message: "Prompt cannot be empty.",
      });
      return;
    }

    setIsSavingAgoraPrompt(true);

    try {
      const response = await fetch("/api/settings/agora-prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: agoraPromptDraft }),
      });
      const data = await parseSnapshotResponse(response);

      setSnapshot(data.snapshot);
      setBanner({
        tone: "success",
        message:
          data.notice ??
          "Agora prompt saved. New calls will follow this prompt.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to save Agora prompt.",
      });
    } finally {
      setIsSavingAgoraPrompt(false);
    }
  }

  async function stopAgoraPriceCheck(agentIdOverride?: string) {
    const agentId = agentIdOverride ?? activeAgoraAgentId;

    if (!agentId) {
      return;
    }

    try {
      const response = await fetch("/api/agora/price-check/stop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Failed to stop Agora agent.");
      }

      setBanner({
        tone: "info",
        message: "Agora price-check session stopped.",
      });
      if (!agentIdOverride || agentIdOverride === activeAgoraAgentId) {
        setActiveAgoraAgentId(null);
      }
      setActiveAgoraLiveSession((current) =>
        current && current.agentId === agentId ? null : current,
      );
    } catch (error) {
      setBanner({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Failed to stop Agora agent.",
      });
    }
  }

  async function resetDemo() {
    setIsResetting(true);
    clearRecovery();

    try {
      const response = await fetch("/api/reset", { method: "POST" });
      const data = await parseSnapshotResponse(response);

      setSnapshot(data.snapshot);
      setSelectedSupplierId(resolveSelectedSupplierId(data.snapshot));
      setProductName(data.snapshot.sampleRequestTemplate.productName);
      setQuantity(String(data.snapshot.sampleRequestTemplate.quantity));
      setSpecs(data.snapshot.sampleRequestTemplate.specs);
      setLastScanSource(null);
      setLastScanFile(null);
      setLastOrderSupplierId(null);
      setBanner({
        tone: "info",
        message:
          "Demo reset complete. The seeded request and document are ready for another clean run.",
      });
      setRunState({ kind: "idle" });
    } catch (error) {
      setBanner({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The demo state could not be reset. Please refresh and try again.",
      });
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/12 bg-[#0f1b26] p-6 text-white shadow-[0_24px_90px_rgba(15,27,38,0.38)] sm:p-8">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(15,118,110,0.55),_transparent_62%)]" />
        <div className="absolute right-20 top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,_rgba(217,119,6,0.4),_transparent_65%)]" />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="inline-flex rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
                Procurement Control Center
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
                Auto-Sourcing Pro
              </h1>
              <p className="mt-3 max-w-2xl text-lg leading-8 text-slate-300">
                AI Procurement Autopilot for SME Purchasing Teams
              </p>
              <p className="mt-2 text-base leading-7 text-slate-400">
                From purchase request to supplier-ready draft order in 2 clicks.
                TinyFish powers the order execution step.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <ModeBadge label="OCR" mode={snapshot.systemModes.ocr} />
              <ModeBadge
                label="Search"
                mode={snapshot.systemModes.supplierSearch}
              />
              <ModeBadge label="TinyFish" mode={snapshot.systemModes.tinyFish} />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-white/55">
                  Primary flow
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  Request, compare, create draft
                </p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-white/55">
                  Supplier set
                </p>
                <p className="mt-2 text-lg font-semibold text-white">2 vendors only</p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-white/55">
                  Demo mode
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  Seeded and replay-ready
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <button
                type="button"
                onClick={() => void resetDemo()}
                disabled={isResetting}
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/14 bg-white/8 px-5 text-sm font-semibold text-white hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isResetting ? "Resetting..." : "Reset Data Only"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {banner ? (
        <div className={`rounded-[22px] border px-4 py-3 text-sm font-medium ${toneStyles(banner.tone)}`}>
          {banner.message}
        </div>
      ) : null}

      <section className="rounded-[22px] border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Guided flow
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {workflowSteps.map((step, index) => {
            const isActive = index === workflowStepIndex;
            const isDone = index < workflowStepIndex;

            return (
              <div
                key={step}
                className={`rounded-2xl border px-3 py-3 text-sm ${
                  isActive
                    ? "border-[#10202d] bg-[#10202d] text-white"
                    : isDone
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">
                  Step {index + 1}
                </p>
                <p className="mt-1 font-semibold">{step}</p>
              </div>
            );
          })}
        </div>
      </section>

      {recoveryState ? (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            Quick recovery
          </p>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            The workflow is still safe to continue. Retry the last step or jump
            back to the seeded demo path.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {recoveryState === "scan" ? (
              <>
                <button
                  type="button"
                  onClick={() => void retryLastScan()}
                  disabled={!lastScanSource || isAnalyzing}
                  className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#10202d] px-4 text-sm font-semibold text-white hover:bg-[#163143] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Retry Last Scan
                </button>
                <button
                  type="button"
                  onClick={() => void runQuoteAnalysis("sample")}
                  disabled={!activeRequest || isAnalyzing}
                  className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Use Sample Extraction
                </button>
              </>
            ) : null}

            {recoveryState === "order" ? (
              <>
                <button
                  type="button"
                  onClick={() => void retryLastOrder()}
                  disabled={!lastOrderSupplierId || Boolean(draftingSupplierId)}
                  className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#10202d] px-4 text-sm font-semibold text-white hover:bg-[#163143] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Retry Draft Creation
                </button>
                {snapshot.draftOrder ? (
                  <Link
                    href={snapshot.draftOrder.portalPath}
                    target="_blank"
                    className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    Open Last Draft
                  </Link>
                ) : null}
              </>
            ) : null}

            <button
              type="button"
              onClick={() => void startFreshSampleRun()}
              disabled={isResetting || isSubmittingRequest}
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Start New Demo Run
            </button>
          </div>
        </div>
      ) : null}

      {isOrderOverlayVisible ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-[#09131d]/62 px-4 py-8 backdrop-blur-sm sm:px-6">
          <div className="w-full max-w-4xl overflow-hidden rounded-[32px] border border-white/12 bg-[#0f1b26] text-white shadow-[0_40px_120px_rgba(15,27,38,0.5)]">
            <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(15,118,110,0.22),rgba(255,255,255,0.04),rgba(217,119,6,0.16))] p-6 sm:p-7">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">
                    TinyFish Execution Console
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
                    Auto-order in progress
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    {snapshot.systemModes.tinyFish === "live"
                      ? "Executing through the live TinyFish connection and tracking each step of the supplier draft handoff."
                      : "Running the polished mock executor so the full portal handoff remains stable, visible, and demo-safe."}
                  </p>
                </div>

                <div className="grid gap-2 text-right">
                  <span className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/75">
                    {snapshot.systemModes.tinyFish === "live"
                      ? "Live execution"
                      : "Mock execution"}
                  </span>
                  <span className="inline-flex items-center justify-center rounded-full border border-emerald-300/24 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                    Duplicate protection active
                  </span>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[22px] border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                    Supplier target
                  </p>
                  <p className="mt-2 text-base font-semibold text-white">
                    {orderTargetSupplier?.supplierName ?? "Preparing supplier"}
                  </p>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                    Product
                  </p>
                  <p className="mt-2 text-base font-semibold text-white">
                    {activeRequest?.productName ?? "Pending request"}
                  </p>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                    Quantity
                  </p>
                  <p className="mt-2 text-base font-semibold text-white">
                    {activeRequest?.quantity ?? "--"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-6 p-6 sm:p-7 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">Execution timeline</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Step {runState.activeStep + 1} of {runState.steps.length}
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#34d399,#f59e0b)]"
                    style={{
                      width: `${((runState.activeStep + 1) / runState.steps.length) * 100}%`,
                    }}
                  />
                </div>
                <ol className="mt-5 space-y-3">
                  {runState.steps.map((step, index) => {
                    const isActive = index === runState.activeStep;
                    const isComplete = index < runState.activeStep;

                    return (
                      <li
                        key={step}
                        className={`flex items-start gap-3 rounded-[22px] border px-4 py-4 ${
                          isActive
                            ? "border-emerald-300/30 bg-white/9"
                            : isComplete
                              ? "border-emerald-300/20 bg-emerald-400/10"
                              : "border-white/8 bg-white/4"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                            isActive
                              ? "bg-emerald-400 text-[#10202d]"
                              : isComplete
                                ? "bg-white text-[#10202d]"
                                : "bg-white/8 text-white/60"
                          }`}
                        >
                          {isComplete ? "OK" : index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">{step}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-300">
                            {orderStepNarratives[index]}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="space-y-4">
                <div className="rounded-[24px] border border-white/8 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Live step detail
                  </p>
                  <h3 className="mt-3 text-lg font-semibold text-white">
                    {runState.steps[runState.activeStep]}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {runStateStepDetail(runState)}
                  </p>
                </div>

                <div className="rounded-[24px] border border-white/8 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Order payload preview
                  </p>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-3 py-3">
                      <dt className="text-slate-400">Supplier</dt>
                      <dd className="font-semibold text-white">
                        {orderTargetSupplier?.supplierName ?? "--"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-3 py-3">
                      <dt className="text-slate-400">Product</dt>
                      <dd className="font-semibold text-white">
                        {activeRequest?.productName ?? "--"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-3 py-3">
                      <dt className="text-slate-400">Quantity</dt>
                      <dd className="font-semibold text-white">
                        {orderTargetSupplier?.recommendedBuyQuantity ??
                          activeRequest?.quantity ??
                          "--"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-3 py-3">
                      <dt className="text-slate-400">Unit price</dt>
                      <dd className="font-semibold text-white">
                        {orderTargetSupplier
                          ? formatUnitCurrency(
                              orderTargetSupplier.effectiveUnitPrice ??
                                orderTargetSupplier.price,
                            )
                          : "--"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeAgoraLiveSession ? (
        <AgoraLiveCallModal
          supplierName={activeAgoraLiveSession.supplierName}
          channelName={activeAgoraLiveSession.channelName}
          appId={activeAgoraLiveSession.appId}
          token={activeAgoraLiveSession.token}
          localUid={activeAgoraLiveSession.localUid}
          agentUid={activeAgoraLiveSession.agentUid}
          onStopAgent={() => stopAgoraPriceCheck(activeAgoraLiveSession.agentId)}
          onClose={() => setActiveAgoraLiveSession(null)}
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <IntegrationsPanel runStateStatus={runState.kind !== "idle" && runState.status === "working" ? "working" : "idle"} />
          <Panel
            title="Agent Prompt Settings"
            subtitle="Saved prompt is applied to all Agora price-check calls in the main flow."
          >
            <div className="rounded-[24px] border border-slate-200 bg-white p-4">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Agora System Prompt
              </label>
              <textarea
                value={agoraPromptDraft}
                onChange={(event) => setAgoraPromptDraft(event.target.value)}
                className="mt-2 min-h-52 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none focus:border-teal-500"
                placeholder="Define negotiation behavior, constraints, and JSON close format here."
              />
              <button
                type="button"
                onClick={() => void saveAgoraPromptSettings()}
                disabled={isSavingAgoraPrompt}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[#10202d] px-4 text-sm font-semibold text-white hover:bg-[#163143] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingAgoraPrompt ? "Saving prompt..." : "Save Prompt To System"}
              </button>
            </div>
          </Panel>
          <Panel
            title="Purchase Requests"
            subtitle="Start with the seeded monitor request or create a quick custom brief."
          >
            <div className="rounded-[24px] border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
                    Seeded demo path
                  </p>
                  <h3 className="mt-2 text-base font-semibold text-slate-900">
                    {snapshot.sampleRequestTemplate.title}
                  </h3>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  2-click flow
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Product
                  </dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {snapshot.sampleRequestTemplate.productName}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Quantity
                  </dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {snapshot.sampleRequestTemplate.quantity}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => void createRequest("sample")}
                disabled={isSubmittingRequest}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[#10202d] px-4 text-sm font-semibold text-white hover:bg-[#163143] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmittingRequest ? "Loading sample..." : "Use Sample Request"}
              </button>
            </div>

            <form className="mt-5 space-y-4" onSubmit={handleCustomSubmit}>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Product name
                </label>
                <input
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-teal-500"
                  placeholder="Dell 27-inch Monitor"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Quantity
                </label>
                <input
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-teal-500"
                  placeholder="100"
                  inputMode="numeric"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Specs
                </label>
                <textarea
                  value={specs}
                  onChange={(event) => setSpecs(event.target.value)}
                  className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-teal-500"
                  placeholder="Optional purchasing notes or required specs"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmittingRequest}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmittingRequest ? "Creating request..." : "Create Request"}
              </button>
            </form>

            {activeRequest ? (
              <div className="mt-5 rounded-[24px] border border-emerald-200 bg-emerald-50/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-emerald-900">
                    Active request
                  </p>
                  <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                    {requestStatusLabel(activeRequest.status)}
                  </span>
                </div>
                <h3 className="mt-2 text-base font-semibold text-slate-900">
                  {activeRequest.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {activeRequest.specs || "No extra specs supplied."}
                </p>
              </div>
            ) : null}
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          {activeRequest ? (
          <Panel
            title="Scan Paper Quote"
            subtitle="Upload a PDF or image, or use the seeded sample document for the reliable demo path."
            actions={
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                Step 1
              </span>
            }
          >
            <div id="scan-quote" className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-[#f6f4ec]">
                  <Image
                    src={snapshot.sampleDocument.previewPath}
                    alt="Sample supplier quote"
                    width={640}
                    height={420}
                    className="h-auto w-full"
                  />
                </div>
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Seeded sample document
                  </p>
                  <h3 className="mt-2 text-base font-semibold text-slate-900">
                    {snapshot.sampleDocument.label}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {snapshot.sampleDocument.summary}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void runQuoteAnalysis("sample")}
                      disabled={!activeRequest || isAnalyzing}
                      className="inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-[#10202d] px-4 text-sm font-semibold text-white hover:bg-[#163143] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isAnalyzing ? "Scanning..." : "Use Sample Document"}
                    </button>
                    <label className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:border-slate-400 hover:bg-slate-50">
                      Upload Image or PDF
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        className="hidden"
                        onChange={(event) => void handleFileChange(event)}
                        disabled={!activeRequest || isAnalyzing}
                      />
                    </label>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {activeRequest
                      ? "Auto-Sourcing Pro will move through upload, scan, and line-item extraction before comparing suppliers."
                      : "Create or load a purchase request first, then the quote scanning controls will unlock."}
                  </p>
                </div>

                {isScanPanelVisible ? (
                  <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                          Scan in progress
                        </p>
                        <h3 className="mt-2 text-base font-semibold text-slate-900">
                          {runState.title}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          {runStateStepDetail(runState)}
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                        Step {runState.activeStep + 1}/{runState.steps.length}
                      </span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#0ea5e9,#14b8a6)]"
                        style={{
                          width: `${((runState.activeStep + 1) / runState.steps.length) * 100}%`,
                        }}
                      />
                    </div>
                    <ol className="mt-4 space-y-2">
                      {runState.steps.map((step, index) => {
                        const isActive = index === runState.activeStep;
                        const isComplete = index < runState.activeStep;

                        return (
                          <li
                            key={step}
                            className={`rounded-2xl px-3 py-3 text-sm ${
                              isActive
                                ? "bg-slate-900 text-white"
                                : isComplete
                                  ? "bg-white text-slate-900"
                                  : "bg-white/70 text-slate-500"
                            }`}
                          >
                            <p className="font-semibold">{step}</p>
                            <p className="mt-1 text-xs leading-5 opacity-80">
                              {scanStepNarratives[index]}
                            </p>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ) : snapshot.extractedQuote ? (
                  <div className="rounded-[24px] border border-teal-100 bg-[var(--accent-soft)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
                      Structured extraction preview
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-white/80 p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Supplier
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {snapshot.extractedQuote.supplierName}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white/80 p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Product
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {snapshot.extractedQuote.productName}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white/80 p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Unit price
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {formatCurrency(snapshot.extractedQuote.unitPrice)}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white/80 p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Quantity
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {snapshot.extractedQuote.quantity}
                        </p>
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-700">
                      {snapshot.extractedQuote.sourceDocumentName} transformed into structured supplier data with{" "}
                      {Math.round(snapshot.extractedQuote.confidence * 100)}% extraction confidence.
                    </p>
                  </div>
                ) : (
                  <EmptyState
                    eyebrow="Step 1"
                    title="No quote scanned yet"
                    body="Use the seeded sample document for the cleanest demo run, or upload any PDF or image to trigger the mock-safe extraction flow."
                    bullets={[
                      "The seeded sample always produces the same polished extraction result.",
                      "Uploaded files still stay demo-safe because OCR can fall back to deterministic mock data.",
                      "Once the quote is parsed, supplier comparison appears automatically.",
                    ]}
                    actions={
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => void runQuoteAnalysis("sample")}
                          disabled={!activeRequest || isAnalyzing}
                          className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#10202d] px-4 text-sm font-semibold text-white hover:bg-[#163143] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Use Sample Document
                        </button>
                        {!activeRequest ? (
                          <button
                            type="button"
                            onClick={() => void createRequest("sample")}
                            disabled={isSubmittingRequest}
                            className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Load Sample Request First
                          </button>
                        ) : null}
                      </div>
                    }
                  />
                )}
              </div>
            </div>
          </Panel>
          ) : null}

          {activeRequest && snapshot.extractedQuote ? (
          <Panel
            title="Supplier Comparison"
            subtitle="Exactly two suppliers, deterministic scoring, and procurement intelligence on benchmark, MOQ, stock, and negotiation readiness."
            actions={
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                Step 2
              </span>
            }
          >
            <div id="comparison" className="space-y-4">
              {snapshot.recommendation && selectedSupplier && activeRequest ? (
                <div className="rounded-[28px] border border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5,#ffffff,#f0fdf4)] p-5 shadow-[0_16px_40px_rgba(15,118,110,0.08)]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        Recommended supplier
                      </p>
                      <h3 className="mt-2 text-lg font-semibold text-slate-900">
                        {snapshot.recommendation.rationale}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        Decision score {snapshot.recommendation.score}/100. Estimated savings{" "}
                        {formatCurrency(snapshot.recommendation.estimatedSavings)}.
                        {snapshot.recommendation.speedAdvantageDays > 0
                          ? ` Up to ${snapshot.recommendation.speedAdvantageDays} days faster delivery.`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      {(selectedSupplier.marketVariancePct ?? 0) > 0 && (
                        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 shadow-sm mb-2 max-w-sm">
                          <p className="text-sm font-bold text-rose-800 flex items-center gap-2">
                            <span className="text-lg">⚠️</span> Price Increase Detected
                          </p>
                          <p className="text-xs text-rose-700 mt-1">
                            Quoted price is {formatSignedPercent(selectedSupplier.marketVariancePct ?? 0)} above real-time market thresholds. Consider our suggested alternative before auto-ordering to protect margins.
                          </p>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => void autoOrder(selectedSupplier.id)}
                        disabled={Boolean(draftingSupplierId)}
                        className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#0f766e] px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,118,110,0.22)] hover:bg-[#0d6b64] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {draftingSupplierId === selectedSupplier.id
                          ? "Auto-Ordering..."
                          : "Create Draft Order via TinyFish"}
                      </button>
                      <p className="text-xs text-slate-600">
                        One click creates a supplier-ready draft order from the selected supplier.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-[20px] border border-white/80 bg-white/80 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Selected supplier
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {selectedSupplier.supplierName}
                      </p>
                    </div>
                    <div className="rounded-[20px] border border-white/80 bg-white/80 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Market variance
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {formatSignedPercent(selectedSupplier.marketVariancePct ?? 0)}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {marketPositionLabel(selectedSupplier.marketPosition ?? "within_market")}
                      </p>
                    </div>
                    <div className="rounded-[20px] border border-white/80 bg-white/80 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        MOQ plan
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {selectedSupplier.recommendedBuyQuantity ?? activeRequest.quantity}{" "}
                        {selectedSupplier.baseUnit ?? "EA"}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {moqFitLabel(selectedSupplier.moqFit ?? "exact_fit")}
                      </p>
                    </div>
                    <div className="rounded-[20px] border border-white/80 bg-white/80 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Stock cover
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {(selectedSupplier.stockCoverDays ?? 0).toFixed(1)} days
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {urgencyLabel(selectedSupplier.urgencyLevel ?? "low")}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {procurementIntelligence &&
              selectedMoqAnalysis &&
              selectedStockContext &&
              negotiationGuidance ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Market Benchmark
                        </p>
                        <h4 className="mt-2 text-base font-semibold text-slate-900">
                          {procurementIntelligence.canonicalProductName}
                        </h4>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                        {procurementIntelligence.marketBenchmark.priceBandLabel}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {procurementIntelligence.marketBenchmark.summary}
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Low
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {formatUnitCurrency(
                            procurementIntelligence.marketBenchmark.marketLow,
                          )}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Median
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {formatUnitCurrency(
                            procurementIntelligence.marketBenchmark.marketMedian,
                          )}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          High
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {formatUnitCurrency(
                            procurementIntelligence.marketBenchmark.marketHigh,
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {procurementIntelligence.marketBenchmark.supplierComparisons.map(
                        (comparison) => {
                          const isSelected =
                            comparison.supplierName === selectedSupplier?.supplierName;

                          return (
                            <div
                              key={comparison.supplierName}
                              className={`rounded-2xl border p-3 ${
                                isSelected
                                  ? "border-emerald-200 bg-emerald-50/70"
                                  : "border-slate-200 bg-slate-50/60"
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">
                                    {comparison.supplierName}
                                  </p>
                                  <p className="text-xs text-slate-600">
                                    Quote {formatUnitCurrency(comparison.quotePrice)} per unit
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                                      marketPositionStyles(comparison.position)
                                    }`}
                                  >
                                    {marketPositionLabel(comparison.position)}
                                  </span>
                                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                                    {formatSignedPercent(comparison.variancePct)} vs median
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          MOQ Impact
                        </p>
                        <h4 className="mt-2 text-base font-semibold text-slate-900">
                          Recommended buy quantity:{" "}
                          {procurementIntelligence.moqImpact.recommendedBuyQuantity}{" "}
                          {procurementIntelligence.baseUnit}
                        </h4>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                          moqFitStyles(selectedMoqAnalysis.moqFit)
                        }`}
                      >
                        {moqFitLabel(selectedMoqAnalysis.moqFit)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {procurementIntelligence.moqImpact.summary}
                    </p>
                    <div className="mt-4 space-y-3">
                      {procurementIntelligence.moqImpact.supplierAnalyses.map((analysis) => {
                        const isSelected =
                          analysis.supplierName === selectedSupplier?.supplierName;

                        return (
                          <div
                            key={analysis.supplierName}
                            className={`rounded-2xl border p-3 ${
                              isSelected
                                ? "border-emerald-200 bg-emerald-50/70"
                                : "border-slate-200 bg-slate-50/60"
                            }`}
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {analysis.supplierName}
                                </p>
                                <p className="mt-1 text-xs text-slate-600">
                                  MOQ {analysis.baseMoq} • Multiple {analysis.orderMultiple} •
                                  Effective {formatUnitCurrency(analysis.effectiveUnitPrice)}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                                    moqFitStyles(analysis.moqFit)
                                  }`}
                                >
                                  {moqFitLabel(analysis.moqFit)}
                                </span>
                                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                                  Buy {analysis.recommendedBuyQuantity}{" "}
                                  {procurementIntelligence.baseUnit}
                                </span>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {analysis.tiers.map((tier) => {
                                const isApplied = tier.label === analysis.appliedTierLabel;

                                return (
                                  <div
                                    key={`${analysis.supplierName}-${tier.label}`}
                                    className={`rounded-2xl border px-3 py-2 text-xs ${
                                      isApplied
                                        ? "border-emerald-300 bg-white text-emerald-900"
                                        : "border-slate-200 bg-white/80 text-slate-700"
                                    }`}
                                  >
                                    <span className="font-semibold">{tier.label}</span>{" "}
                                    {tier.minQty} @ {formatUnitCurrency(tier.effectiveUnitPrice)}
                                  </div>
                                );
                              })}
                            </div>
                            {analysis.nextTierQuantity ? (
                              <p className="mt-3 text-xs leading-5 text-slate-600">
                                Next break at {analysis.nextTierQuantity}{" "}
                                {procurementIntelligence.baseUnit}. Potential blended savings{" "}
                                {formatCurrency(analysis.nextTierSavings)}.
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Stock Cover / Urgency
                        </p>
                        <h4 className="mt-2 text-base font-semibold text-slate-900">
                          {procurementIntelligence.canonicalProductId} normalized in{" "}
                          {procurementIntelligence.baseUnit}
                        </h4>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                        {procurementIntelligence.stockContext.dailyDemand.toFixed(1)}{" "}
                        {procurementIntelligence.baseUnit}/day
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {procurementIntelligence.stockContext.summary}
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Planning window
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {procurementIntelligence.stockContext.planningWindowDays} days
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Selected SKU
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {selectedStockContext.supplierSku}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Safety buffer
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {selectedStockContext.safetyBufferUnits}{" "}
                          {procurementIntelligence.baseUnit}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {procurementIntelligence.stockContext.supplierContexts.map((context) => {
                        const isSelected =
                          context.supplierName === selectedSupplier?.supplierName;

                        return (
                          <div
                            key={context.supplierName}
                            className={`rounded-2xl border p-3 ${
                              isSelected
                                ? "border-emerald-200 bg-emerald-50/70"
                                : "border-slate-200 bg-slate-50/60"
                            }`}
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {context.supplierName}
                                </p>
                                <p className="mt-1 text-xs text-slate-600">
                                  SKU {context.supplierSku} • Net {context.netAvailableStock}{" "}
                                  {context.baseUnit} • Cover {context.stockCoverDays.toFixed(1)} days
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                                  Lead {context.leadTimeDays} days
                                </span>
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                                    urgencyStyles(context.urgencyLevel)
                                  }`}
                                >
                                  {urgencyLabel(context.urgencyLevel)}
                                </span>
                              </div>
                            </div>
                            <p className="mt-3 text-xs leading-5 text-slate-600">
                              {context.urgencyReason}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    className={`rounded-[24px] border p-5 ${
                      negotiationGuidance.action === "buy_now"
                        ? "border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5,#ffffff,#f0fdf4)]"
                        : negotiationGuidance.action === "negotiate"
                          ? "border-amber-200 bg-[linear-gradient(135deg,#fffbeb,#ffffff,#fef3c7)]"
                          : "border-slate-200 bg-[linear-gradient(135deg,#f8fafc,#ffffff,#e2e8f0)]"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Negotiation Guidance
                        </p>
                        <h4 className="mt-2 text-base font-semibold text-slate-900">
                          {negotiationGuidance.headline}
                        </h4>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                          negotiationActionStyles(negotiationGuidance.action)
                        }`}
                      >
                        {negotiationActionLabel(negotiationGuidance.action)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">
                      {negotiationGuidance.rationale}
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-white/85 p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Target supplier
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {negotiationGuidance.supplierName}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white/85 p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Target range
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {formatUnitCurrency(negotiationGuidance.targetUnitPriceLow)}-
                          {formatUnitCurrency(negotiationGuidance.targetUnitPriceHigh)}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white/85 p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Current quote
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {formatUnitCurrency(selectedSupplier.price)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {negotiationGuidance.askPoints.map((point) => (
                        <div
                          key={point}
                          className="rounded-2xl bg-white/85 px-3 py-3 text-sm leading-6 text-slate-700"
                        >
                          {point}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {snapshot.supplierQuotes.length === 2 && activeRequest ? (
                <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left">
                      <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                        <tr>
                          <th className="px-4 py-4 font-semibold">Supplier Name</th>
                          <th className="px-4 py-4 font-semibold">Price (USD)</th>
                          <th className="px-4 py-4 font-semibold">Inventory</th>
                          <th className="px-4 py-4 font-semibold">Delivery (Days)</th>
                          <th className="px-4 py-4 font-semibold">Rating</th>
                          <th className="px-4 py-4 font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displaySupplierQuotes.map((quote) => {
                          const isRecommended =
                            quote.supplierName === recommendedSupplierName;

                          return (
                            <tr
                              key={quote.id}
                              className={`border-t border-slate-200 ${
                                isRecommended
                                  ? "bg-[linear-gradient(90deg,rgba(16,185,129,0.12),rgba(255,255,255,1))]"
                                  : "bg-white"
                              }`}
                            >
                              <td
                                className={`px-4 py-4 align-top ${
                                  isRecommended ? "border-l-4 border-l-emerald-500" : ""
                                }`}
                              >
                                <div className="flex flex-col gap-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-slate-900">
                                      {quote.supplierName}
                                    </span>
                                    {isRecommended ? (
                                      <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                                        Recommended choice
                                      </span>
                                    ) : null}
                                    {quote.extractedFromOCR ? (
                                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                                        OCR source
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="text-sm leading-6 text-slate-600">
                                    {quote.source}. Score {quote.score}/100.
                                  </div>
                                  {quote.sourceUrl ? (
                                    <a
                                      href={quote.sourceUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-xs font-semibold text-sky-700 underline-offset-2 hover:underline"
                                    >
                                      Verify scraped source
                                    </a>
                                  ) : null}
                                  {quote.priceObserved === false ? (
                                    <div className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                                      Live price was not found. Estimated price is shown for comparison only.
                                    </div>
                                  ) : null}
                                  <div className="text-xs leading-5 text-slate-500">
                                    SKU {quote.supplierSku ?? "Pending"} •{" "}
                                    {quote.canonicalProductId ?? "Canonical mapping pending"}
                                  </div>
                                  {isRecommended ? (
                                    <div className="rounded-2xl bg-white/80 px-3 py-2 text-xs font-medium text-emerald-800">
                                      Best overall mix of benchmark price, MOQ fit,
                                      stock coverage, and delivery speed for this request.
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-4 py-4 align-top">
                                <div className="font-semibold text-slate-900">
                                  {formatCurrency(quote.price)}
                                </div>
                                <div className="text-sm text-slate-500">
                                  Total {formatCurrency(quote.totalPrice ?? quote.price)}
                                </div>
                                <div className="mt-2 text-xs leading-5 text-slate-600">
                                  Effective {formatUnitCurrency(quote.effectiveUnitPrice ?? quote.price)}
                                </div>
                                <div className="text-xs leading-5 text-slate-600">
                                  {formatSignedPercent(quote.marketVariancePct ?? 0)} vs market median
                                </div>
                              </td>
                              <td className="px-4 py-4 align-top">
                                <div
                                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                    quote.inventorySufficient
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-amber-100 text-amber-800"
                                  }`}
                                >
                                  {quote.inventorySufficient ? "Sufficient" : "Partial"}
                                </div>
                                <div className="mt-2 text-sm text-slate-600">
                                  {supplierInventoryLabel(quote, activeRequest.quantity)}
                                </div>
                                <div className="mt-2 text-xs leading-5 text-slate-600">
                                  Net {(quote.netAvailableStock ?? quote.inventory)}{" "}
                                  {quote.baseUnit ?? "EA"} after buffer
                                </div>
                                <div className="text-xs leading-5 text-slate-600">
                                  Cover {(quote.stockCoverDays ?? 0).toFixed(1)} days
                                </div>
                              </td>
                              <td className="px-4 py-4 align-top">
                                <div className="font-medium text-slate-900">
                                  {quote.deliveryDays}
                                </div>
                                <div className="mt-2">
                                  <span
                                    className={`inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                                      urgencyStyles(quote.urgencyLevel ?? "low")
                                    }`}
                                  >
                                    {urgencyLabel(quote.urgencyLevel ?? "low")}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-4 align-top">
                                <div className="font-medium text-slate-900">
                                  {quote.rating.toFixed(1)} / 5
                                </div>
                                <div className="mt-2">
                                  <span
                                    className={`inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                                      moqFitStyles(quote.moqFit ?? "exact_fit")
                                    }`}
                                  >
                                    {moqFitLabel(quote.moqFit ?? "exact_fit")}
                                  </span>
                                </div>
                                <div className="mt-2 text-xs leading-5 text-slate-600">
                                  Buy {quote.recommendedBuyQuantity ?? activeRequest.quantity}{" "}
                                  {quote.baseUnit ?? "EA"}
                                </div>
                              </td>
                              <td className="px-4 py-4 align-top">
                                <div className="flex flex-col gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedSupplierId(quote.id)}
                                    className={`inline-flex min-h-11 items-center justify-center rounded-2xl px-4 text-sm font-semibold ${
                                      selectedSupplier?.id === quote.id
                                        ? "bg-[#10202d] text-white"
                                        : "border border-slate-300 bg-white text-slate-900 hover:border-slate-400 hover:bg-slate-50"
                                    }`}
                                  >
                                    {selectedSupplier?.id === quote.id
                                      ? "Selected"
                                      : "Select Supplier"}
                                  </button>

                                  {quote.agoraFollowUpSuggested &&
                                  (quote.supplierContactPhone || quote.supplierContactEmail) ? (
                                    <>
                                      <p className="text-xs text-amber-700">
                                        Missing live price. For safety, Agora test call is restricted to +84832787977.
                                      </p>
                                      {quote.supplierContactPhone ? (
                                        <a
                                          href={`tel:${quote.supplierContactPhone}`}
                                          className="text-xs font-semibold text-slate-700 underline-offset-2 hover:underline"
                                        >
                                          Call {quote.supplierContactPhone}
                                        </a>
                                      ) : null}
                                      {quote.supplierContactEmail ? (
                                        <a
                                          href={`mailto:${quote.supplierContactEmail}`}
                                          className="text-xs font-semibold text-slate-700 underline-offset-2 hover:underline"
                                        >
                                          Email {quote.supplierContactEmail}
                                        </a>
                                      ) : null}
                                      <button
                                        type="button"
                                        onClick={() => void startAgoraPriceCheck(quote)}
                                        disabled={startingAgoraSupplierId === quote.id}
                                        className="inline-flex min-h-9 items-center justify-center rounded-xl border border-sky-300 bg-sky-50 px-3 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {startingAgoraSupplierId === quote.id
                                          ? startingAgoraSource === "official"
                                            ? "Starting Agora..."
                                            : "Starting from Laptop Demo..."
                                          : "Start Agora Price Check"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void startAgoraPriceCheck(quote, "laptop-demo")
                                        }
                                        disabled={startingAgoraSupplierId === quote.id}
                                        className="inline-flex min-h-9 items-center justify-center rounded-xl border border-indigo-300 bg-indigo-50 px-3 text-xs font-semibold text-indigo-900 hover:bg-indigo-100"
                                      >
                                        {startingAgoraSupplierId === quote.id &&
                                        startingAgoraSource === "laptop-demo"
                                          ? "Starting Laptop Demo..."
                                          : "Start Laptop Demo Call (Agora)"}
                                      </button>
                                      {activeAgoraAgentId ? (
                                        <button
                                          type="button"
                                          onClick={() => void stopAgoraPriceCheck()}
                                          className="inline-flex min-h-9 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                                        >
                                          Stop Active Agora Session
                                        </button>
                                      ) : null}
                                    </>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <EmptyState
                  eyebrow="Step 2"
                  title="Comparison unlocks after quote extraction"
                  body="Once a quote is scanned, Auto-Sourcing Pro will compare two suppliers and make a deterministic recommendation with explainable scoring."
                  bullets={[
                    "The OCR quote becomes Supplier 1 automatically.",
                    "A second supplier benchmark is added so market variance and negotiation leverage are visible immediately.",
                    "When comparison is ready, the recommended supplier is pushed to the top.",
                  ]}
                  actions={
                    activeRequest ? (
                      <button
                        type="button"
                        onClick={() => void runQuoteAnalysis("sample")}
                        disabled={isAnalyzing}
                        className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#10202d] px-4 text-sm font-semibold text-white hover:bg-[#163143] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Use Sample Document
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void createRequest("sample")}
                        disabled={isSubmittingRequest}
                        className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#10202d] px-4 text-sm font-semibold text-white hover:bg-[#163143] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Load Sample Request
                      </button>
                    )
                  }
                />
              )}
            </div>
          </Panel>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <Panel
            title="System Status"
            subtitle="Mock-safe adapters keep the experience complete even without external credentials."
          >
            <div className="grid gap-3">
              {(
                [
                  ["OCR adapter", snapshot.systemModes.ocr],
                  ["Supplier search", snapshot.systemModes.supplierSearch],
                  ["TinyFish execution", snapshot.systemModes.tinyFish],
                ] as Array<[string, SystemModes[keyof SystemModes]]>
              ).map(([label, mode]) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3"
                >
                  <span className="text-sm font-medium text-slate-800">{label}</span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                      mode === "live"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {mode}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              TinyFish powers the execution step. If live integrations are not
              configured, the deterministic mock adapters preserve the full
              request-to-draft story.
            </p>
          </Panel>

          <Panel
            title="Activity Run"
            subtitle="Visible action-taking so the user always knows what the system is doing."
          >
            {runState.kind === "idle" ? (
              <EmptyState
                eyebrow="Live operator view"
                title="No active task right now"
                body="Load the sample request and use the seeded document to watch the scan, recommendation, and draft-order steps unfold."
                bullets={[
                  "Quote scanning progress appears here as soon as analysis starts.",
                  "The TinyFish execution flow stays pinned here after draft creation.",
                  "This panel is designed for judges to follow the story without guessing.",
                ]}
                actions={
                  <button
                    type="button"
                    onClick={() => void startFreshSampleRun()}
                    disabled={isResetting || isSubmittingRequest}
                    className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#10202d] px-4 text-sm font-semibold text-white hover:bg-[#163143] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Start New Demo Run
                  </button>
                }
              />
            ) : (
              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {runState.kind === "scan" ? "Quote flow" : "Execution flow"}
                    </p>
                    <h3 className="mt-2 text-base font-semibold text-slate-900">
                      {runState.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {runStateStepDetail(runState)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                      runState.status === "success"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-sky-100 text-sky-800"
                    }`}
                  >
                    {runState.status === "success" ? "Complete" : "Running"}
                  </span>
                </div>
                {runState.kind === "order" ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Execution mode
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {(snapshot.draftOrder?.executionMode ??
                          snapshot.systemModes.tinyFish) === "live"
                          ? "TinyFish live connection"
                          : "TinyFish demo-safe simulator"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Supplier target
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {orderTargetSupplier?.supplierName ?? "--"}
                      </p>
                    </div>
                  </div>
                ) : null}
                <ol className="mt-4 space-y-3">
                  {runState.steps.map((step, index) => {
                    const isActive = index === runState.activeStep;
                    const isComplete = index < runState.activeStep;
                    const isFinalSuccess =
                      runState.status === "success" && index === runState.activeStep;

                    return (
                      <li
                        key={step}
                        className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm ${
                          isActive || isFinalSuccess
                            ? "bg-slate-900 text-white"
                            : isComplete
                              ? "bg-emerald-50 text-emerald-900"
                              : "bg-slate-50 text-slate-500"
                        }`}
                      >
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                            isActive || isFinalSuccess
                              ? "bg-white/15 text-white"
                              : isComplete
                                ? "bg-emerald-600 text-white"
                                : "bg-white text-slate-500"
                          }`}
                        >
                          {index + 1}
                        </span>
                        <div>
                          <p>{step}</p>
                          {runState.kind === "order" ? (
                            <p className="mt-1 text-xs leading-5 opacity-80">
                              {orderStepNarratives[index]}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {runState.kind === "order" &&
                runState.status === "success" &&
                snapshot.draftOrder ? (
                  <div className="mt-4 rounded-[22px] border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      Execution completed
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      Session {snapshot.draftOrder.portalSessionId} saved a draft in{" "}
                      {snapshot.draftOrder.portalName}.
                    </p>
                    <Link
                      href={snapshot.draftOrder.portalPath}
                      target="_blank"
                      className="mt-4 inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#10202d] px-4 text-sm font-semibold text-white hover:bg-[#163143]"
                    >
                      Open Portal Preview
                    </Link>
                  </div>
                ) : null}
              </div>
            )}
          </Panel>

          <Panel
            title="Draft Order Result"
            subtitle="This is the proof point: a supplier-ready draft order saved for review."
          >
            <div id="draft-result">
              {snapshot.draftOrder ? (
                <div className="rounded-[28px] border border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5,#ffffff,#f0fdf4)] p-5 shadow-[0_18px_46px_rgba(15,118,110,0.1)]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        Draft Order Created Successfully
                      </p>
                      <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900">
                        Supplier-ready draft saved for review
                      </h3>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
                        Auto-Sourcing Pro completed the handoff and returned a
                        supplier draft that is ready to present in the portal.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
                        Status: Draft saved
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
                        {snapshot.draftOrder.executionMode === "live"
                          ? "Live execution"
                          : "Mock execution"}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
                        {snapshot.draftOrder.portalSessionId}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white/85 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Supplier
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {snapshot.draftOrder.supplierName}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/85 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Reference ID
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {snapshot.draftOrder.referenceId}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/85 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Product
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {snapshot.draftOrder.productName}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/85 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Quantity
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {snapshot.draftOrder.quantity}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-700">
                    Created {formatDateTime(snapshot.draftOrder.createdAt)}.{" "}
                    {snapshot.draftOrder.notes}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white/85 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Portal
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {snapshot.draftOrder.portalName}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/85 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Submitted by
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {snapshot.draftOrder.submittedBy}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-[22px] border border-white/80 bg-white/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Execution summary
                    </p>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                      {snapshot.draftOrder.executionSummary.map((item) => (
                        <li key={item} className="rounded-2xl bg-white px-3 py-2">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link
                      href={snapshot.draftOrder.portalPath}
                      target="_blank"
                      className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#10202d] px-4 text-sm font-semibold text-white hover:bg-[#163143]"
                    >
                      Open Supplier Portal Preview
                    </Link>
                    <button
                      type="button"
                      onClick={() => void startFreshSampleRun()}
                      disabled={isResetting || isSubmittingRequest}
                      className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Start New Demo Run
                    </button>
                  </div>
                </div>
              ) : (
                <EmptyState
                  eyebrow="Final proof point"
                  title="No draft order yet"
                  body="Select a supplier and create a draft order to produce a visible result and open the local supplier portal preview."
                  bullets={[
                    "The recommended supplier is the fastest path for the main demo story.",
                    "The result panel will show a draft reference ID, portal session, and execution summary.",
                    "You can replay the seeded journey from here once a draft has been created.",
                  ]}
                  actions={
                    selectedSupplier ? (
                      <button
                        type="button"
                        onClick={() => void autoOrder(selectedSupplier.id)}
                        disabled={!snapshot.recommendation || Boolean(draftingSupplierId)}
                        className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#10202d] px-4 text-sm font-semibold text-white hover:bg-[#163143] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Create Draft Order via TinyFish
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void startFreshSampleRun()}
                        disabled={isResetting || isSubmittingRequest}
                        className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#10202d] px-4 text-sm font-semibold text-white hover:bg-[#163143] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Start New Demo Run
                      </button>
                    )
                  }
                />
              )}
            </div>
          </Panel>

          <Panel
            title="Activity Log"
            subtitle="Concise, human-readable events for the live demo."
            actions={
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                Most recent first
              </span>
            }
          >
            <ul>
              {snapshot.activityEvents.length > 0 ? (
                snapshot.activityEvents.map((event) => (
                  <ActivityItem key={event.id} event={event} />
                ))
              ) : (
                <li>
                  <EmptyState
                    eyebrow="Audit trail"
                    title="No activity logged yet"
                    body="The log will populate as soon as a request is created and the quote workflow begins."
                    bullets={[
                      "Request creation confirms the workflow has started.",
                      "Quote scan and recommendation events make the AI value visible.",
                      "Draft creation proves the TinyFish execution handoff worked.",
                    ]}
                  />
                </li>
              )}
            </ul>
          </Panel>
        </div>
      </div>
    </main>
  );
}
