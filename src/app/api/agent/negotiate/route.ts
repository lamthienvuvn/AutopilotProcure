import { NextResponse } from "next/server";

type NegotiateRequest = {
  userMessage: string;
  supplierName: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function buildOpenAIHeaders(apiKey: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const organization = process.env.OPENAI_ORGANIZATION_ID?.trim();
  const project = process.env.OPENAI_PROJECT_ID?.trim();

  if (organization) {
    headers["OpenAI-Organization"] = organization;
  }

  if (project) {
    headers["OpenAI-Project"] = project;
  }

  return headers;
}

async function callOpenAI(
  userMessage: string,
  supplierName: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
) {
  const openAiKey = requiredEnv("OPENAI_API_KEY");

  const systemPrompt = `You are a procurement agent negotiating with a supplier representative.
Your goal is to negotiate the best price, delivery terms, and payment conditions.
Always be professional, respectful, and focused on finding a win-win agreement.
Supplier: ${supplierName}

Keep responses concise (1-3 sentences max) for natural conversation flow.`;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...conversationHistory,
    { role: "user" as const, content: userMessage },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: buildOpenAIHeaders(openAiKey),
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: 150,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message.content ?? "";
}

async function callElevenLabs(text: string, voiceId: string) {
  const elevenLabsKey = requiredEnv("ELEVENLABS_API_KEY");

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": elevenLabsKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
  }

  return response;
}

function buildFallbackAgentMessage(
  userMessage: string,
  supplierName: string,
) {
  const text = userMessage.toLowerCase();

  if (/(deal|accept|agreed|confirmed|ok\b)/i.test(text)) {
    return `${supplierName} accepts the proposal. We can move to draft PO confirmation now.`;
  }

  if (/(delivery|lead|timeline|ship)/i.test(text)) {
    return `${supplierName} can support delivery in 4 to 6 days after PO confirmation, subject to stock reservation today.`;
  }

  if (/(moq|minimum|quantity|volume|bulk)/i.test(text)) {
    return `${supplierName} can support the requested volume, with the best commercial tier starting from 100 units.`;
  }

  if (/(payment|net\s?15|net\s?30|prepay|upfront)/i.test(text)) {
    return `${supplierName} can review improved commercial terms if the buyer can confirm faster payment timing.`;
  }

  if (/(price|discount|lower|better|quote|cost)/i.test(text)) {
    return `${supplierName} can review a modest price improvement if volume, payment timing, and delivery commitment are confirmed together.`;
  }

  return `${supplierName} confirms they are reviewing the request and can proceed once pricing, stock, and delivery terms are aligned.`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as NegotiateRequest;
    const { userMessage, supplierName, conversationHistory = [] } = body;

    if (!userMessage?.trim()) {
      return NextResponse.json(
        { error: "userMessage is required" },
        { status: 400 },
      );
    }

    if (!supplierName?.trim()) {
      return NextResponse.json(
        { error: "supplierName is required" },
        { status: 400 },
      );
    }

    let agentText = "";
    let mode: "live" | "fallback" = "live";
    let notice: string | undefined;

    try {
      console.debug("[Agent] Calling OpenAI with user message:", userMessage);
      agentText = await callOpenAI(
        userMessage,
        supplierName,
        conversationHistory,
      );
      console.debug("[Agent] OpenAI response:", agentText);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[Agent] Falling back to deterministic response:", message);
      agentText = buildFallbackAgentMessage(userMessage, supplierName);
      mode = "fallback";
      notice =
        "Live negotiation AI was unavailable, so a deterministic fallback reply was used.";
    }

    let base64Audio = "";
    let audioFormat = "none";

    try {
      const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

      console.debug("[Agent] Converting to speech via ElevenLabs");
      const audioResponse = await callElevenLabs(agentText, voiceId);
      const audioBuffer = await audioResponse.arrayBuffer();
      base64Audio = Buffer.from(audioBuffer).toString("base64");
      audioFormat = "mp3";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[Agent] ElevenLabs unavailable, returning text only:", message);
      notice =
        notice ??
        "Voice synthesis was unavailable, so the agent reply was returned as text only.";
    }

    return NextResponse.json({
      agentMessage: agentText,
      audio: base64Audio,
      audioFormat,
      mode,
      notice,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Agent] Error:", message);

    return NextResponse.json(
      {
        error: `Agent error: ${message}`,
      },
      { status: 500 },
    );
  }
}
