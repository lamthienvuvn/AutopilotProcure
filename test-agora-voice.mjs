#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalIndex = line.indexOf("=");
    if (equalIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var ${name}`);
  }

  return value;
}

function normalizePhone(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  if (!found) {
    return fallback;
  }

  return found.slice(prefix.length);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function mask(value, left = 4, right = 4) {
  if (!value) {
    return "";
  }

  if (value.length <= left + right) {
    return "*".repeat(value.length);
  }

  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

function buildAgoraAuthHeader(preferredMode = "auto") {
  const token = process.env.AGORA_AUTH_TOKEN;

  if (preferredMode === "token" && !token) {
    throw new Error("--auth=token requested but AGORA_AUTH_TOKEN is missing");
  }

  if (preferredMode !== "basic" && token) {
    return {
      value: `agora token=${token}`,
      mode: "token",
      preview: `agora token=${mask(token, 6, 4)}`,
    };
  }

  const customerId = requiredEnv("AGORA_CUSTOMER_ID");
  const customerSecret = requiredEnv("AGORA_CUSTOMER_SECRET");
  const basic = Buffer.from(`${customerId}:${customerSecret}`).toString("base64");

  return {
    value: `Basic ${basic}`,
    mode: "basic",
    preview: `Basic ${mask(basic, 8, 4)}`,
  };
}

function buildAsrConfig() {
  const asrVendor = (process.env.AGORA_ASR_VENDOR ?? "").trim().toLowerCase();

  if (asrVendor === "deepgram") {
    return {
      vendor: "deepgram",
      params: {
        url: process.env.AGORA_DEEPGRAM_URL ?? "wss://api.deepgram.com/v1/listen",
        model: process.env.AGORA_DEEPGRAM_MODEL ?? "nova-3",
        keyterm: process.env.AGORA_DEEPGRAM_KEYTERM ?? "",
        language: process.env.AGORA_DEEPGRAM_LANGUAGE ?? "en",
      },
    };
  }

  return {
    language: process.env.AGORA_ASR_LANGUAGE ?? "en-US",
  };
}

function buildJoinPayload(channelName, supplierName, phoneNumber) {
  const openAiKey = process.env.OPENAI_API_KEY;
  const ttsKey = process.env.AGORA_TTS_KEY;
  const ttsRegion = process.env.AGORA_TTS_REGION;

  const llm = openAiKey
    ? {
        url: process.env.AGORA_LLM_URL ?? "https://api.openai.com/v1/chat/completions",
        api_key: openAiKey,
        system_messages: [
          {
            role: "system",
            content:
              `You are a procurement voice agent. Verify real-time supplier pricing and terms. Supplier: ${supplierName}. Allowed phone: ${phoneNumber}. Keep the conversation short and confirm final unit price clearly.`,
          },
        ],
        greeting_message:
          "Hello, this is procurement AI. We are confirming your latest unit price and delivery terms.",
        failure_message: "I cannot complete verification right now.",
        max_history: 10,
        params: {
          model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        },
      }
    : undefined;

  const tts = ttsKey && ttsRegion
    ? {
        vendor: "microsoft",
        params: {
          key: ttsKey,
          region: ttsRegion,
          voice_name: process.env.AGORA_TTS_VOICE ?? "en-US-AndrewMultilingualNeural",
        },
      }
    : undefined;

  const payload = {
    name: channelName,
    ...(process.env.AGORA_PIPELINE_ID ? { pipeline_id: process.env.AGORA_PIPELINE_ID } : {}),
    properties: {
      channel: channelName,
      ...(process.env.AGORA_RTC_TOKEN ? { token: process.env.AGORA_RTC_TOKEN } : {}),
      agent_rtc_uid: process.env.AGORA_AGENT_RTC_UID ?? "0",
      remote_rtc_uids: [process.env.AGORA_REMOTE_RTC_UID ?? "1002"],
      enable_string_uid: false,
      idle_timeout: Number(process.env.AGORA_IDLE_TIMEOUT ?? 120),
      asr: buildAsrConfig(),
      ...(llm ? { llm } : {}),
      ...(tts ? { tts } : {}),
    },
  };

  return payload;
}

async function postJson(url, headers, body) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let data;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  return { response, data };
}

async function main() {
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));

  const appId = requiredEnv("AGORA_APP_ID");
  const authModeArg = (getArg("auth", "auto") || "auto").toLowerCase();
  const auth = buildAgoraAuthHeader(authModeArg);
  const supplierName = getArg("supplier", "Summit Pixel Supply");
  const phoneNumber = normalizePhone(
    getArg("phone", process.env.AGORA_ALLOWED_TEST_PHONE ?? "+84832787977"),
  );
  const now = new Date();
  const channelName = getArg(
    "channel",
    `voice-test-${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`,
  );

  const joinUrl = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`;
  const joinPayload = buildJoinPayload(channelName, supplierName, phoneNumber);

  console.log("[agora-test] Starting join request...");
  console.log(
    JSON.stringify(
      {
        appId,
        channelName,
        supplierName,
        phoneNumber,
        authMode: auth.mode,
        requestedAuthMode: authModeArg,
        authPreview: auth.preview,
        pipelineId: process.env.AGORA_PIPELINE_ID ?? null,
        hasRtcToken: Boolean(process.env.AGORA_RTC_TOKEN),
        hasLlm: Boolean(process.env.OPENAI_API_KEY),
        asrMode: joinPayload.properties.asr?.vendor ?? "native_language",
        ttsVoice: process.env.AGORA_TTS_VOICE ?? null,
      },
      null,
      2,
    ),
  );

  const join = await postJson(
    joinUrl,
    {
      Authorization: auth.value,
      "Content-Type": "application/json",
    },
    joinPayload,
  );

  console.log(`[agora-test] JOIN HTTP ${join.response.status}`);
  console.log(JSON.stringify(join.data, null, 2));

  if (!join.response.ok) {
    process.exitCode = 1;
    return;
  }

  const agentId =
    join.data?.agent_id ?? join.data?.agentId ?? join.data?.data?.agent_id ?? "";

  if (!agentId) {
    console.log("[agora-test] Joined but no agent_id found in response; skip leave.");
    return;
  }

  if (hasFlag("leave")) {
    const leaveUrl = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/agents/${agentId}/leave`;
    const waitMs = Number(getArg("waitMs", "2500"));

    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    console.log(`[agora-test] Sending leave for agent ${agentId}...`);
    const leave = await postJson(
      leaveUrl,
      {
        Authorization: auth.value,
        "Content-Type": "application/json",
      },
      {},
    );

    console.log(`[agora-test] LEAVE HTTP ${leave.response.status}`);
    console.log(JSON.stringify(leave.data, null, 2));

    const taskNotFound =
      leave.response.status === 404 &&
      (leave.data?.reason === "TaskNotFound" ||
        String(leave.data?.detail ?? "").toLowerCase().includes("task not found"));

    if (!leave.response.ok && !taskNotFound) {
      process.exitCode = 1;
    }

    if (taskNotFound) {
      console.log(
        "[agora-test] Leave returned TaskNotFound. Agent session may already be auto-closed by Agora.",
      );
    }
  }
}

main().catch((error) => {
  console.error("[agora-test] Fatal error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
