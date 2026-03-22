import Link from "next/link";
import { notFound } from "next/navigation";
import { getDraftOrderById } from "@/lib/demo-store";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SupplierPortalPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const draftOrder = getDraftOrderById(orderId);

  if (!draftOrder) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eef3ef_0%,#f7f4ec_100%)] px-4 py-8 text-[#10202d] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[32px] border border-[#10202d]/10 bg-white shadow-[0_24px_80px_rgba(16,32,45,0.08)]">
          <div className="rounded-t-[32px] bg-[#10202d] px-6 py-5 text-white sm:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/65">
                  Supplier Portal Demo
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                  Draft Order Saved
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                  This local portal simulates the supplier-facing destination that
                  TinyFish drafted on the user&apos;s behalf.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-white/14 bg-white/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/75">
                  Session active
                </span>
                <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                  Draft saved
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="space-y-6">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Draft reference
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                      {draftOrder.referenceId}
                    </h2>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
                    Auto-filled
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Drafted for {draftOrder.supplierName} on {formatDateTime(draftOrder.createdAt)}.
                </p>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Supplier login
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Portal
                    </label>
                    <input
                      readOnly
                      value={draftOrder.portalName}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Supplier account
                    </label>
                    <input
                      readOnly
                      value={draftOrder.submittedBy}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Session status
                    </label>
                    <input
                      readOnly
                      value="Authenticated and ready"
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Session ID
                    </label>
                    <input
                      readOnly
                      value={draftOrder.portalSessionId}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Draft form
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Product name
                    </label>
                    <input
                      readOnly
                      value={draftOrder.productName}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Quantity
                    </label>
                    <input
                      readOnly
                      value={String(draftOrder.quantity)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Contact
                    </label>
                    <input
                      readOnly
                      value={draftOrder.contactName}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Shipping address
                    </label>
                    <textarea
                      readOnly
                      value={draftOrder.shippingAddress}
                      className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Order notes
                    </label>
                    <textarea
                      readOnly
                      value={draftOrder.notes}
                      className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                    />
                  </div>
                </div>
                <div className="mt-5 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
                  Draft Saved. Ready for supplier review and final confirmation.
                </div>
              </div>
            </section>

            <aside className="space-y-6">
              <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Execution summary
                </p>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                  {draftOrder.executionSummary.map((item) => (
                    <li key={item} className="rounded-2xl bg-slate-50 px-4 py-3">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Next action
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-700">
                  Return to the dashboard to replay the run, test the other supplier,
                  or reset the seeded journey for another judge walkthrough.
                </p>
                <Link
                  href="/"
                  className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#10202d] px-4 text-sm font-semibold text-white hover:bg-[#163143]"
                >
                  Back to Dashboard
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
