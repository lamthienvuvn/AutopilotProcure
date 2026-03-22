"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type StartResponse = {
  mode?: string;
  allowedPhone?: string;
  supplierName?: string;
  channelName?: string;
  agentId?: string;
  status?: string;
  error?: string;
};

type StopResponse = {
  status?: string;
  agentId?: string;
  error?: string;
};

export default function AgoraTestPage() {
  const [supplierName, setSupplierName] = useState("Summit Pixel Supply");
  const [phoneNumber, setPhoneNumber] = useState("+84832787977");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a procurement voice agent. Negotiate professionally, ask one question at a time, and always confirm final unit price in USD before ending.",
  );
  const [agentId, setAgentId] = useState("");
  const [requestLog, setRequestLog] = useState("Ready");
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const canStart = useMemo(
    () => !isStarting && supplierName.trim().length > 0 && phoneNumber.trim().length > 0,
    [isStarting, supplierName, phoneNumber],
  );

  const canStop = useMemo(() => !isStopping && agentId.trim().length > 0, [isStopping, agentId]);

  async function startCall() {
    setIsStarting(true);

    try {
      const response = await fetch("/api/agora/price-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          supplierName: supplierName.trim(),
          phoneNumber: phoneNumber.trim(),
          systemPrompt: systemPrompt.trim(),
        }),
      });

      const payload = (await response.json()) as StartResponse;

      if (!response.ok) {
        setRequestLog(
          JSON.stringify(
            {
              type: "start",
              ok: false,
              status: response.status,
              payload,
            },
            null,
            2,
          ),
        );
        return;
      }

      setAgentId(payload.agentId ?? "");
      setRequestLog(
        JSON.stringify(
          {
            type: "start",
            ok: true,
            status: response.status,
            payload,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      setRequestLog(
        JSON.stringify(
          {
            type: "start",
            ok: false,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          null,
          2,
        ),
      );
    } finally {
      setIsStarting(false);
    }
  }

  async function stopCall() {
    setIsStopping(true);

    try {
      const response = await fetch("/api/agora/price-check/stop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ agentId: agentId.trim() }),
      });

      const payload = (await response.json()) as StopResponse;

      setRequestLog(
        JSON.stringify(
          {
            type: "stop",
            ok: response.ok,
            status: response.status,
            payload,
          },
          null,
          2,
        ),
      );

      if (response.ok) {
        setAgentId("");
      }
    } catch (error) {
      setRequestLog(
        JSON.stringify(
          {
            type: "stop",
            ok: false,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          null,
          2,
        ),
      );
    } finally {
      setIsStopping(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Agora Voice Test</p>
          <h1 className="text-3xl font-semibold tracking-tight">Temporary UI For Real-Time Call Test</h1>
          <p className="text-sm text-slate-300">
            Use this screen to test Start/Stop against your live Agora REST routes.
          </p>
          <Link href="/" className="inline-flex rounded-lg border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800">
            Back to Dashboard
          </Link>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 sm:col-span-1">
              <span className="text-sm font-medium text-slate-200">Supplier name</span>
              <input
                value={supplierName}
                onChange={(event) => setSupplierName(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-400 transition focus:ring-2"
                placeholder="Summit Pixel Supply"
              />
            </label>

            <label className="space-y-2 sm:col-span-1">
              <span className="text-sm font-medium text-slate-200">Phone number</span>
              <input
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-400 transition focus:ring-2"
                placeholder="+84832787977"
              />
            </label>

            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm font-medium text-slate-200">Active agent ID (auto-filled after start)</span>
              <input
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-400 transition focus:ring-2"
                placeholder="A42A..."
              />
            </label>

            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm font-medium text-slate-200">Agent system prompt</span>
              <textarea
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                className="min-h-28 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-400 transition focus:ring-2"
                placeholder="Enter the behavior prompt for Agora LLM agent"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void startCall()}
              disabled={!canStart}
              className="inline-flex min-h-10 items-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStarting ? "Starting..." : "Start Agora Call"}
            </button>
            <button
              type="button"
              onClick={() => void stopCall()}
              disabled={!canStop}
              className="inline-flex min-h-10 items-center rounded-xl bg-amber-500 px-4 text-sm font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStopping ? "Stopping..." : "Stop Agora Call"}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-black/40 p-5">
          <p className="text-sm font-semibold text-slate-200">Request/Response Log</p>
          <pre className="mt-3 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs leading-6 text-emerald-200">
            {requestLog}
          </pre>
        </section>
      </div>
    </main>
  );
}
