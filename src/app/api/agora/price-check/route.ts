import { NextResponse } from "next/server";
import { RtcRole, RtcTokenBuilder } from "agora-token";
import { readStore } from "@/lib/demo-store";

type StartPriceCheckRequest = {
  supplierName?: string;
  phoneNumber?: string;
  systemPrompt?: string;
  source?: "official" | "laptop-demo";
};

function normalizePhone(value: string) {
  return value.replace(/\s+/g, "").trim();
}

function buildAgoraAuthHeader(customerId: string, customerSecret: string) {
  const token = Buffer.from(`${customerId}:${customerSecret}`).toString("base64");
  return `Basic ${token}`;
}

function getTokenAuthHeader() {
  const agoraToken = process.env.AGORA_AUTH_TOKEN;

  if (agoraToken) {
    return `agora token=${agoraToken}`;
  }

  return null;
}

function getBasicAuthHeader() {
  const customerId = process.env.AGORA_CUSTOMER_ID;
  const customerSecret = process.env.AGORA_CUSTOMER_SECRET;

  if (!customerId || !customerSecret) {
    return null;
  }

  return buildAgoraAuthHeader(customerId, customerSecret);
}

async function callAgoraJoin(endpoint: string, authHeader: string, payload: unknown) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const rawBody = await response.text();
  return { response, rawBody };
}

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }

  return value;
}

function buildOpenAILlmConfig(openAiKey: string) {
  const llm: Record<string, unknown> = {
    url: process.env.AGORA_LLM_URL ?? "https://api.openai.com/v1/chat/completions",
    api_key: openAiKey,
    params: {
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    },
  };

  const headers: Record<string, string> = {};
  const organization = process.env.OPENAI_ORGANIZATION_ID?.trim();
  const project = process.env.OPENAI_PROJECT_ID?.trim();

  if (organization) {
    headers["OpenAI-Organization"] = organization;
  }

  if (project) {
    headers["OpenAI-Project"] = project;
  }

  if (Object.keys(headers).length > 0) {
    llm.headers = headers;
  }

  return llm;
}

function buildRtcTokenWithUid(params: {
  appId: string;
  appCertificate: string;
  channelName: string;
  rtcUid: string;
}) {
  const privilegeExpiredTs = Math.floor(Date.now() / 1000) + 60 * 60;
  const uid = Number(params.rtcUid);

  if (!Number.isFinite(uid) || uid < 0) {
    throw new Error("AGORA RTC UID must be numeric for dynamic token generation.");
  }

  const token = RtcTokenBuilder.buildTokenWithUid(
    params.appId,
    params.appCertificate,
    params.channelName,
    uid,
    RtcRole.PUBLISHER,
    privilegeExpiredTs,
    privilegeExpiredTs,
  );

  return { token, tokenExpiresAt: privilegeExpiredTs };
}

export async function POST(request: Request) {
  const body = (await request.json()) as StartPriceCheckRequest;
  const supplierName = String(body.supplierName ?? "Unknown supplier").trim();
  const requestedPhone = normalizePhone(String(body.phoneNumber ?? ""));
  const customPrompt = String(body.systemPrompt ?? "").trim();
  const persistedPrompt = readStore().agoraSystemPrompt?.trim();
  const source = body.source ?? "official";
  const allowedPhone = normalizePhone(
    process.env.AGORA_ALLOWED_TEST_PHONE ?? "+84832787977",
  );

  if (source === "official" && !requestedPhone) {
    return NextResponse.json(
      { error: "Phone number is required for official Agora price check." },
      { status: 400 },
    );
  }

  if (source === "official" && requestedPhone !== allowedPhone) {
    return NextResponse.json(
      {
        error: `Test calls are restricted to ${allowedPhone}.`,
      },
      { status: 403 },
    );
  }

  try {
    // For laptop-demo, skip Agora negotiation and use OpenAI+ElevenLabs pipeline
    if (source === "laptop-demo") {
      return NextResponse.json({
        mode: "live",
        supplierName,
        source: "laptop-demo",
        agentId: `demo-${Date.now()}`,
        status: "READY",
        // No RTC section - will use OpenAI+ElevenLabs instead
      });
    }

    // For official calls, set up Agora negotiation session
    const appId = requiredEnv("AGORA_APP_ID");
    const openAiKey = requiredEnv("OPENAI_API_KEY");
    const ttsKey = requiredEnv("AGORA_TTS_KEY");
    const ttsRegion = requiredEnv("AGORA_TTS_REGION");

    const channelName = `price-check-${Date.now()}`;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE?.trim();
    // Use larger numeric UIDs to avoid conflicts with channel initialization
    const agentRtcUid = "65534"; // Agent uses a high UID
    const clientRtcUid = "65533"; // Client uses a different high UID

    let agentRtcToken = "";
    let clientRtcToken = "";
    let rtcTokenSource = "static-env";
    let rtcTokenExpiresAt: number | null = null;

    if (appCertificate) {
      const agentTokenInfo = buildRtcTokenWithUid({
        appId,
        appCertificate,
        channelName,
        rtcUid: agentRtcUid,
      });
      const clientTokenInfo = buildRtcTokenWithUid({
        appId,
        appCertificate,
        channelName,
        rtcUid: clientRtcUid,
      });

      agentRtcToken = agentTokenInfo.token;
      clientRtcToken = clientTokenInfo.token;
      rtcTokenSource = "dynamic-cert";
      rtcTokenExpiresAt = clientTokenInfo.tokenExpiresAt;
    } else {
      agentRtcToken = requiredEnv("AGORA_RTC_TOKEN");
      clientRtcToken = process.env.AGORA_CLIENT_RTC_TOKEN?.trim() ?? "";

      if (!clientRtcToken) {
        return NextResponse.json(
          {
            error:
              "Missing client RTC token. Set AGORA_APP_CERTIFICATE for dynamic token generation, or set AGORA_CLIENT_RTC_TOKEN for browser join.",
          },
          { status: 500 },
        );
      }
    }

    const endpoint = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`;

    const fallbackPrompt = `You are a procurement assistant. Call only ${allowedPhone} to verify supplier price and availability. Supplier: ${supplierName}.`;
    const promptSource = customPrompt
      ? "request"
      : persistedPrompt
        ? "store"
        : process.env.AGORA_LLM_SYSTEM_PROMPT
          ? "env"
          : "fallback";
    const selectedPrompt =
      customPrompt ||
      persistedPrompt ||
      process.env.AGORA_LLM_SYSTEM_PROMPT ||
      fallbackPrompt;

    const payload = {
      name: `price-check-${Date.now()}`,
      properties: {
        channel: channelName,
        token: agentRtcToken,
        agent_rtc_uid: agentRtcUid,
        remote_rtc_uids: [clientRtcUid],
        enable_string_uid: false,
        idle_timeout: 120,
        llm: {
          ...buildOpenAILlmConfig(openAiKey),
          system_messages: [
            {
              role: "system",
              content: selectedPrompt,
            },
          ],
          greeting_message:
            "Hello, this is an automated procurement assistant. We are validating the latest unit price.",
          failure_message:
            "Sorry, I cannot complete the price validation right now.",
          max_history: 10,
        },
        asr: {
          language: process.env.AGORA_ASR_LANGUAGE ?? "en-US",
        },
        tts: {
          vendor: "microsoft",
          params: {
            key: ttsKey,
            region: ttsRegion,
            voice_name:
              process.env.AGORA_TTS_VOICE ?? "en-US-AndrewMultilingualNeural",
          },
        },
      },
    };

    const tokenAuth = getTokenAuthHeader();
    const basicAuth = getBasicAuthHeader();

    if (!tokenAuth && !basicAuth) {
      throw new Error(
        "Missing Agora auth credentials. Set AGORA_AUTH_TOKEN or AGORA_CUSTOMER_ID/AGORA_CUSTOMER_SECRET.",
      );
    }

    let authModeUsed = tokenAuth ? "token" : "basic";
    let joinResult = await callAgoraJoin(endpoint, tokenAuth ?? basicAuth!, payload);

    if (
      joinResult.response.status === 401 &&
      authModeUsed === "token" &&
      basicAuth
    ) {
      authModeUsed = "basic";
      joinResult = await callAgoraJoin(endpoint, basicAuth, payload);
    }

    if (!joinResult.response.ok) {
      return NextResponse.json(
        {
          error: `Agora join request failed with HTTP ${joinResult.response.status}.`,
          authModeUsed,
          upstream: joinResult.rawBody,
        },
        { status: 502 },
      );
    }

    const result = (JSON.parse(joinResult.rawBody || "{}") ?? {}) as {
      agent_id?: string;
      status?: string;
    };

    return NextResponse.json({
      mode: "live",
      allowedPhone,
      supplierName,
      authModeUsed,
      promptSource,
      promptLength: selectedPrompt.length,
      channelName,
      agentId: result.agent_id,
      status: result.status ?? "RUNNING",
      rtc: {
        appId,
        channelName,
        token: clientRtcToken,
        tokenSource: rtcTokenSource,
        tokenExpiresAt: rtcTokenExpiresAt,
        localUid: clientRtcUid,
        agentUid: agentRtcUid,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: `Agora price check is not configured: ${message}`,
      },
      { status: 500 },
    );
  }
}
