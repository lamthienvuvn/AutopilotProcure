import { NextResponse } from "next/server";
import { buildDashboardSnapshot, resetStore } from "@/lib/demo-store";
import { ApiSnapshotResponse } from "@/lib/types";

export async function POST() {
  const store = resetStore();
  const response: ApiSnapshotResponse = {
    snapshot: buildDashboardSnapshot(store),
  };

  return NextResponse.json(response);
}
