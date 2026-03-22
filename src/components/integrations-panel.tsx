"use client";

import { useEffect, useMemo, useState } from "react";

interface Props {
  runStateStatus: string;
}

export function IntegrationsPanel({ runStateStatus }: Props) {
  const [creditState, setCreditState] = useState<{
    mode: "loading" | "live" | "unavailable";
    total: number;
    remaining: number;
    message?: string;
  }>({
    mode: "loading",
    total: 50,
    remaining: runStateStatus === "working" ? 12.45 : 12.5,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadCredits() {
      try {
        const response = await fetch("/api/openai/credits", { cache: "no-store" });
        const payload = (await response.json()) as {
          mode?: "live" | "unavailable";
          total?: number;
          remaining?: number;
          message?: string;
        };

        if (!isMounted) {
          return;
        }

        if (payload.mode === "live") {
          setCreditState({
            mode: "live",
            total: Number(payload.total ?? 0),
            remaining: Number(payload.remaining ?? 0),
          });
          return;
        }

        setCreditState((current) => ({
          ...current,
          mode: "unavailable",
          message: payload.message ?? "Credit API unavailable",
        }));
      } catch {
        if (!isMounted) {
          return;
        }

        setCreditState((current) => ({
          ...current,
          mode: "unavailable",
          message: "Credit API unavailable",
        }));
      }
    }

    void loadCredits();

    return () => {
      isMounted = false;
    };
  }, []);

  const creditPercentage = useMemo(() => {
    const safeTotal = Math.max(creditState.total, 1);
    return Math.max(0, Math.min(100, (creditState.remaining / safeTotal) * 100));
  }, [creditState.remaining, creditState.total]);

  const stack = [
    { name: "OpenAI", color: "bg-emerald-100 text-emerald-800" },
    { name: "Exa", color: "bg-purple-100 text-purple-800" },
    { name: "Manus", color: "bg-blue-100 text-blue-800" },
    { name: "BrightData", color: "bg-amber-100 text-amber-800" },
    { name: "Interfaze (Jigsawstack)", color: "bg-indigo-100 text-indigo-800" },
    { name: "fRACTAL", color: "bg-rose-100 text-rose-800" },
    { name: "TinyFish", color: "bg-sky-100 text-sky-800" },
    { name: "Dify", color: "bg-slate-100 text-slate-800" },
    { name: "ByteRover", color: "bg-teal-100 text-teal-800" },
  ];

  return (
    <section className="rounded-[28px] border border-white/70 bg-[var(--panel)] p-6 shadow-[0_18px_55px_rgba(16,32,45,0.08)] backdrop-blur">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#10202d]">Intelligence Hub</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Active Orchestration & API Metrics</p>
        </div>
        <span className="flex h-3 w-3 relative">
          {runStateStatus === "working" && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          )}
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
        </span>
      </div>

      <div className="mb-6 rounded-[24px] border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">OpenAI API Tracker</p>
          <p className="text-sm font-semibold text-slate-900">
            ${creditState.remaining.toFixed(2)} / ${creditState.total.toFixed(2)}
          </p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all duration-500"
            style={{ width: `${creditPercentage}%` }}
          />
        </div>
        {creditState.mode === "unavailable" ? (
          <p className="mt-2 text-xs text-amber-700">
            {creditState.message ?? "Using fallback credit indicator"}
          </p>
        ) : null}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-3">Powered By Orchestration</p>
        <div className="flex flex-wrap gap-2">
          {stack.map((tool) => (
            <span
              key={tool.name}
              className={`inline-flex items-center rounded-xl px-2.5 py-1 text-xs font-semibold ${tool.color}`}
            >
              {tool.name}
            </span>
          ))}
        </div>
      </div>
      
      <div className="mt-6 border-t border-slate-100 pt-5">
         <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-3">Dev Stack</p>
         <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-xl px-2.5 py-1 text-xs font-semibold border border-slate-200 bg-white text-slate-700">Notion</span>
            <span className="inline-flex items-center rounded-xl px-2.5 py-1 text-xs font-semibold border border-slate-200 bg-white text-slate-700">Lovable / Sleek.design / Yboard</span>
            <span className="inline-flex items-center rounded-xl px-2.5 py-1 text-xs font-semibold border border-slate-200 bg-white text-slate-700">GitHub Copilot</span>
            <span className="inline-flex items-center rounded-xl px-2.5 py-1 text-xs font-semibold border border-slate-200 bg-slate-900 text-white shadow-sm">Antigravity Pro</span>
         </div>
      </div>
    </section>
  );
}
