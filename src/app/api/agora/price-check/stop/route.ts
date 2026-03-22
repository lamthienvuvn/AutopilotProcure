import { NextResponse } from "next/server";

type StopPriceCheckRequest = {
  agentId?: string;
};

function buildAgoraAuthHeader(customerId: string, customerSecret: string) {
  const token = Buffer.from(`${customerId}:${customerSecret}`).toString("base64");
  return `Basic ${token}`;
}

export async function POST(request: Request) {
  const body = (await request.json()) as StopPriceCheckRequest;
  const agentId = String(body.agentId ?? "").trim();

  if (!agentId) {
    return NextResponse.json({ error: "agentId is required." }, { status: 400 });
  }

  const appId = process.env.AGORA_APP_ID;
  const customerId = process.env.AGORA_CUSTOMER_ID;
  const customerSecret = process.env.AGORA_CUSTOMER_SECRET;

  if (!appId || !customerId || !customerSecret) {
    return NextResponse.json(
      { error: "Agora credentials are missing." },
      { status: 500 },
    );
  }

  const endpoint = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/agents/${agentId}/leave`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: buildAgoraAuthHeader(customerId, customerSecret),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `Agora leave request failed with HTTP ${response.status}.` },
      { status: 502 },
    );
  }

  return NextResponse.json({ status: "stopped", agentId });
}
