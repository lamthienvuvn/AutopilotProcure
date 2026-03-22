import { NextResponse } from "next/server";

type OpenAiCreditPayload = {
  total_granted?: number;
  total_used?: number;
  total_available?: number;
};

function isUnsupportedCreditEndpoint(endpoint: string) {
  return (
    endpoint.includes("/v1/billing/credit_grants") ||
    endpoint.includes("/dashboard/billing/credit_grants")
  );
}

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        mode: "unavailable",
        message: "OPENAI_API_KEY is missing. Using local fallback tracker.",
      },
      { status: 200 },
    );
  }

  const endpoint =
    process.env.OPENAI_CREDIT_API_URL ??
    "https://api.openai.com/dashboard/billing/credit_grants";

  if (isUnsupportedCreditEndpoint(endpoint)) {
    return NextResponse.json(
      {
        mode: "unavailable",
        message:
          "Project secret keys cannot read OpenAI credit grants from legacy billing endpoints. Showing the local tracker instead.",
      },
      { status: 200 },
    );
  }

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          mode: "unavailable",
          message: "Live credit totals are unavailable right now. Showing the local tracker instead.",
        },
        { status: 200 },
      );
    }

    const payload = (await response.json()) as OpenAiCreditPayload;
    const granted = Number(payload.total_granted ?? 0);
    const used = Number(payload.total_used ?? 0);
    const available = Number(payload.total_available ?? granted - used);

    return NextResponse.json({
      mode: "live",
      total: Math.max(granted, 0),
      used: Math.max(used, 0),
      remaining: Math.max(available, 0),
      currency: "USD",
    });
  } catch {
    return NextResponse.json(
      {
        mode: "unavailable",
        message: "Live credit totals are unavailable right now. Showing the local tracker instead.",
      },
      { status: 200 },
    );
  }
}
