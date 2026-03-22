import { DashboardClient } from "@/components/dashboard-client";
import { getDashboardSnapshot } from "@/lib/demo-store";

export const dynamic = "force-dynamic";

export default function Home() {
  const snapshot = getDashboardSnapshot();

  return <DashboardClient initialSnapshot={snapshot} />;
}
