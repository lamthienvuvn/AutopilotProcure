"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  IAgoraRTCClient,
  ILocalAudioTrack,
  IAgoraRTCRemoteUser,
} from "agora-rtc-sdk-ng";

type Props = {
  supplierName: string;
  channelName: string;
  appId: string;
  token: string;
  localUid: string;
  agentUid?: string;
  onStopAgent: () => Promise<void>;
  onClose: () => void;
};

type Status = "connecting" | "connected" | "error" | "ended";

type TranscriptSpeaker = "you" | "agent" | "system";

type TranscriptTurn = {
  id: number;
  speaker: TranscriptSpeaker;
  text: string;
};

type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

type SpeechRecognitionAlternativeLike = {
  transcript?: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionResultListLike = {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

function toUid(value: string) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) {
    return n;
  }

  return value;
}

function isHumanReadableTranscript(value: string) {
  const text = value.trim();

  if (!text) {
    return false;
  }

  const hasWhitespace = /\s/.test(text);
  const mostlyTokenChars = /^[A-Za-z0-9+/=_\-.:]+$/.test(text);
  const longTokenLike = mostlyTokenChars && !hasWhitespace && text.length > 40;

  if (longTokenLike) {
    return false;
  }

  const alphaChars = (text.match(/[A-Za-z]/g) ?? []).length;
  const alphaRatio = alphaChars / text.length;

  return alphaRatio >= 0.25 || hasWhitespace;
}

function parseAgentMessage(payload: Uint8Array) {
  const text = new TextDecoder().decode(payload);

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;

    let value: unknown =
      parsed.text ??
      parsed.transcript ??
      parsed.message ??
      parsed.content ??
      parsed.msg ??
      parsed.data ??
      parsed.response ??
      parsed.result ??
      parsed.output;

    if (typeof value === "object" && value !== null) {
      const obj = value as Record<string, unknown>;
      value =
        obj.text ??
        obj.transcript ??
        obj.message ??
        obj.content ??
        obj.msg ??
        obj.speech ??
        obj.audio_text ??
        obj.transcription;
    }

    if (Array.isArray(value)) {
      value = value.find((item): item is string => typeof item === "string");
    }

    if (typeof value === "string" && isHumanReadableTranscript(value)) {
      return value;
    }

    const stringified = JSON.stringify(parsed);
    if (isHumanReadableTranscript(stringified) && stringified.length < 500) {
      return stringified;
    }
  } catch {
    // Payload can be plain text; ignore JSON parse failures.
  }

  if (isHumanReadableTranscript(text)) {
    return text;
  }

  if (text.trim().length > 0 && text.length < 200) {
    console.debug("[Agora] Unparseable message:", text);
  }

  return "";
}

export function AgoraLiveCallModal({
  supplierName,
  channelName,
  appId,
  token,
  localUid,
  agentUid,
  onStopAgent,
  onClose,
}: Props) {
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTrackRef = useRef<ILocalAudioTrack | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [errorText, setErrorText] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [interimUserText, setInterimUserText] = useState("");
  const [isSpeechRecognitionSupported, setIsSpeechRecognitionSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptIdRef = useRef(1);
  const connectAttemptRef = useRef(0);
  const statusRef = useRef<Status>(status);
  const isMutedRef = useRef(isMuted);
  const isEndingRef = useRef(isEnding);

  // Agent conversation state
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  const [isAgentProcessing, setIsAgentProcessing] = useState(false);
  const conversationHistoryRef = useRef<ConversationTurn[]>(conversationHistory);
  const isAgentProcessingRef = useRef(isAgentProcessing);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const startRecognitionRef = useRef<() => void>(() => {});
  const stopRecognitionRef = useRef<() => void>(() => {});

  statusRef.current = status;
  isMutedRef.current = isMuted;
  isEndingRef.current = isEnding;
  conversationHistoryRef.current = conversationHistory;
  isAgentProcessingRef.current = isAgentProcessing;

  const appendTranscript = useCallback((speaker: TranscriptSpeaker, text: string) => {
    const clean = text.trim();
    if (!clean) {
      return;
    }

    setTranscript((previous) => [
      ...previous,
      {
        id: transcriptIdRef.current++,
        speaker,
        text: clean,
      },
    ]);
  }, []);

  function decodeBase64Audio(base64: string) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  }

  const cleanupCurrentAudio = useCallback(() => {
    if (!currentAudioRef.current) {
      return;
    }

    currentAudioRef.current.pause();
    URL.revokeObjectURL(currentAudioRef.current.src);
    currentAudioRef.current = null;
  }, []);

  const handleUserMessage = useCallback(async (userMessage: string) => {
    if (!userMessage.trim() || isAgentProcessingRef.current) {
      return;
    }

    isAgentProcessingRef.current = true;
    setIsAgentProcessing(true);

    try {
      // Add user message to transcript and history
      appendTranscript("you", userMessage);
      const updatedHistory = [
        ...conversationHistoryRef.current,
        { role: "user" as const, content: userMessage },
      ];

      // Call agent negotiation API
      console.debug("[Agent] Sending message:", userMessage);
      const response = await fetch("/api/agent/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage,
          supplierName,
          conversationHistory: conversationHistoryRef.current,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "Failed to get agent response");
      }

      const data = (await response.json()) as {
        agentMessage: string;
        audio: string;
        audioFormat: string;
      };

      // Add agent message to transcript and history
      appendTranscript("agent", data.agentMessage);
      const nextHistory = [
        ...updatedHistory,
        { role: "assistant" as const, content: data.agentMessage },
      ];
      conversationHistoryRef.current = nextHistory;
      setConversationHistory(nextHistory);

      // Play agent audio
      if (data.audio && data.audioFormat === "mp3") {
        stopRecognitionRef.current();
        cleanupCurrentAudio();

        const audioData = decodeBase64Audio(data.audio);
        const blob = new Blob([audioData], { type: "audio/mpeg" });
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        currentAudioRef.current = audio;

        audio.onended = () => {
          cleanupCurrentAudio();

          if (statusRef.current === "connected" && !isMutedRef.current && !isEndingRef.current) {
            startRecognitionRef.current();
          }
        };

        audio.onerror = () => {
          cleanupCurrentAudio();
          appendTranscript("system", "Unable to play agent audio");

          if (statusRef.current === "connected" && !isMutedRef.current && !isEndingRef.current) {
            startRecognitionRef.current();
          }
        };

        audio.play().catch((err) => {
          console.error("[Agent] Failed to play audio:", err);
          appendTranscript("system", "Unable to play agent audio");

          cleanupCurrentAudio();

          if (statusRef.current === "connected" && !isMutedRef.current && !isEndingRef.current) {
            startRecognitionRef.current();
          }
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[Agent] Error:", message);
      appendTranscript("system", `Agent error: ${message}`);
    } finally {
      isAgentProcessingRef.current = false;
      setIsAgentProcessing(false);
    }
  }, [appendTranscript, cleanupCurrentAudio, supplierName]);

  const stopRecognition = useCallback(() => {
    if (!recognitionRef.current) {
      return;
    }

    recognitionRef.current.onresult = null;
    recognitionRef.current.onerror = null;
    recognitionRef.current.onend = null;
    recognitionRef.current.stop();
    recognitionRef.current = null;
    setInterimUserText("");
  }, []);

  const startRecognition = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const speechWindow = window as SpeechWindow;
    const SpeechRecognitionCtor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setIsSpeechRecognitionSupported(false);
      appendTranscript(
        "system",
        "Live local transcript is unavailable in this browser. Use Chrome/Edge for microphone transcript."
      );
      return;
    }

    setIsSpeechRecognitionSupported(true);
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = "";
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result?.[0]?.transcript ?? "";

        if (result.isFinal) {
          finalText += text;
        } else {
          interim += text;
        }
      }

      setInterimUserText(interim.trim());

      // Send final transcribed text to agent
      if (finalText.trim()) {
        console.debug("[Agent] User said:", finalText);
        void handleUserMessage(finalText);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (event?.error === "no-speech") {
        return;
      }

      appendTranscript("system", `Transcript listener error: ${String(event?.error ?? "unknown")}`);
    };

    recognition.onend = () => {
      if (statusRef.current === "connected" && !isMutedRef.current && !isEndingRef.current) {
        try {
          recognition.start();
        } catch {
          // Ignore duplicate start races.
        }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [appendTranscript, handleUserMessage]);

  useEffect(() => {
    startRecognitionRef.current = startRecognition;
    stopRecognitionRef.current = stopRecognition;
  }, [startRecognition, stopRecognition]);

  useEffect(() => {
    let cancelled = false;
    const attemptId = ++connectAttemptRef.current;
    let sessionClient: IAgoraRTCClient | null = null;
    let sessionMic: ILocalAudioTrack | null = null;

    async function connect() {
      try {
        // If no RTC token, skip Agora and use OpenAI+ElevenLabs directly
        if (!token) {
          console.debug("[Agent] Using OpenAI+ElevenLabs mode (no Agora RTC)");
          setStatus("connected");
          appendTranscript("system", "Voice session connected. Start speaking to negotiate.");
          startRecognition();
          return;
        }

        const { default: AgoraRTC } = await import("agora-rtc-sdk-ng");
        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        sessionClient = client;

        // Log connection state changes
        client.on("connection-state-change", (curState, prevState) => {
          console.debug(`[Agora] Connection state changed: ${prevState} → ${curState}`);
          if (curState === "CONNECTED") {
            console.debug("[Agora] ✅ RTC connected and ready to receive media");
          } else if (curState === "DISCONNECTED") {
            console.warn("[Agora] ⚠️ RTC disconnected");
          }
        });

        const cleanupLocalResources = async (mic?: ILocalAudioTrack | null) => {
          if (mic) {
            mic.stop();
            mic.close();
          }

          try {
            await client.leave();
          } catch {
            // Ignore leave failures during teardown.
          }
        };

        client.on("user-published", async (user: IAgoraRTCRemoteUser, mediaType) => {
          console.debug(`[Agora] User ${user.uid} published ${mediaType}`, user);

          try {
            await client.subscribe(user, mediaType);
            console.debug(`[Agora] Successfully subscribed to ${user.uid} ${mediaType}`);

            if (mediaType === "audio") {
              if (user.audioTrack) {
                user.audioTrack.play();
                console.debug(`[Agora] ✅ Playing audio from user ${user.uid}`);
              } else {
                console.warn(`[Agora] ⚠️ Audio published but no audioTrack available for user ${user.uid}`);
              }
            }
          } catch (error) {
            console.error(`[Agora] ❌ Failed to subscribe to ${user.uid} ${mediaType}:`, error);
          }
        });

        client.on("user-unpublished", (user: IAgoraRTCRemoteUser, mediaType) => {
          console.debug(`[Agora] User ${user.uid} unpublished ${mediaType}`, user);

          if (mediaType === "audio") {
            try {
              user.audioTrack?.stop();
              console.debug(`[Agora] Stopped audio from user ${user.uid}`);
            } catch (error) {
              console.error(`[Agora] Error stopping audio from ${user.uid}:`, error);
            }
          }
        });

        client.on("stream-message", (_uid, payload) => {
          const rawText = new TextDecoder().decode(payload);
          console.debug("[Agora] Raw stream message:", rawText.slice(0, 500));
          const agentText = parseAgentMessage(payload);
          if (agentText) {
            console.debug("[Agora] Parsed agent message:", agentText);
            appendTranscript("agent", agentText);
          } else {
            console.debug("[Agora] Could not parse message, raw:", rawText);
          }
        });

        const joinUid = toUid(localUid);

        try {
          console.debug(`[Agora] Joining channel ${channelName} with UID ${joinUid}`);
          await client.join(appId, channelName, token, joinUid);
          console.debug(`[Agora] ✅ Joined channel ${channelName}`);
        } catch (joinError) {
          // When using token-based authentication, the UID is locked to the token.
          // We cannot retry with a different UID as it will cause "invalid token" errors.
          // If UID_CONFLICT occurs, it means the server needs to assign a different UID.
          console.error(`[Agora] ❌ Failed to join channel with UID ${joinUid}:`, joinError);
          throw joinError;
        }

        console.debug(`[Agora] Connection state after join: ${client.connectionState}`);
        console.debug(`[Agora] Remote users: ${client.remoteUsers.length}`);
        client.remoteUsers.forEach(u => {
          console.debug(`  - User ${u.uid}: has audio=${!!u.audioTrack}, has video=${!!u.videoTrack}`);
        });

        if (cancelled || attemptId !== connectAttemptRef.current) {
          await cleanupLocalResources();
          return;
        }

        const mic = await AgoraRTC.createMicrophoneAudioTrack();
        sessionMic = mic;
        localTrackRef.current = mic;
        console.debug(`[Agora] ✅ Created microphone track`);

        if (cancelled || attemptId !== connectAttemptRef.current) {
          await cleanupLocalResources(mic);
          localTrackRef.current = null;
          return;
        }

        if (client.connectionState !== "CONNECTED") {
          await cleanupLocalResources(mic);
          localTrackRef.current = null;
          throw new Error("RTC connection was interrupted before microphone publish.");
        }

        await client.publish([mic]);
        console.debug(`[Agora] ✅ Published microphone track`);
        clientRef.current = client;

        startRecognition();

        if (!cancelled) {
          setStatus("connected");
          console.debug(`[Agora] ✅ Status set to connected`);
          appendTranscript("system", "Voice session connected. Start speaking to generate transcript.");
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setStatus("error");
        setErrorText(error instanceof Error ? error.message : "Failed to connect Agora RTC");
      }
    }

    void connect();

    return () => {
      cancelled = true;
      connectAttemptRef.current += 1;
      void (async () => {
        try {
          stopRecognition();
          cleanupCurrentAudio();

          if (sessionMic) {
            sessionMic.stop();
            sessionMic.close();
            sessionMic = null;
          }

          if (localTrackRef.current) {
            localTrackRef.current = null;
          }

          if (sessionClient) {
            await sessionClient.leave();
            sessionClient.removeAllListeners();
            sessionClient = null;
          }

          if (clientRef.current) {
            clientRef.current.removeAllListeners();
            clientRef.current = null;
          }
        } catch {
          // Ignore cleanup failures during unmount.
        }
      })();
    };
  }, [appId, appendTranscript, channelName, cleanupCurrentAudio, localUid, startRecognition, stopRecognition, token]);

  async function toggleMute() {
    const track = localTrackRef.current;

    if (!track || status !== "connected") {
      return;
    }

    const nextMuted = !isMuted;
    await track.setMuted(nextMuted);
    setIsMuted(nextMuted);

    if (nextMuted) {
      stopRecognition();
    } else {
      startRecognition();
    }
  }

  async function endCall() {
    if (isEnding) {
      return;
    }

    setIsEnding(true);

    try {
      stopRecognition();

      if (localTrackRef.current) {
        localTrackRef.current.stop();
        localTrackRef.current.close();
        localTrackRef.current = null;
      }

      cleanupCurrentAudio();

      if (clientRef.current) {
        await clientRef.current.leave();
        clientRef.current.removeAllListeners();
        clientRef.current = null;
      }

      await onStopAgent();
      setStatus("ended");
    } catch (error) {
      setStatus("error");
      setErrorText(error instanceof Error ? error.message : "Failed to end call");
      return;
    } finally {
      setIsEnding(false);
    }

    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#09131d]/70 p-4 backdrop-blur-sm">
      <section className="w-full max-w-xl rounded-[28px] border border-white/20 bg-[#0f1b26] p-6 text-white shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
          Agora Live Voice Session
        </p>
        <h3 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">{supplierName}</h3>
        <p className="mt-2 text-sm text-slate-300">Channel: {channelName}</p>
        <p className="mt-1 text-sm text-slate-300">
          Agent UID: {agentUid ?? "unknown"} • Your UID: {localUid}
        </p>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold text-white">
            Status: {status === "connecting" ? "Connecting" : status === "connected" ? "Connected" : status === "ended" ? "Ended" : "Error"}
          </p>
          {status === "connected" ? (
            <p className="mt-2 text-xs text-emerald-200">
              Mic is live. Speak naturally; remote agent audio will play automatically. Transcript appears below.
            </p>
          ) : null}
          {status === "error" ? (
            <p className="mt-2 text-xs text-rose-200">{errorText}</p>
          ) : null}
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-[#0b1621] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Live Transcript</p>
          <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
            {transcript.length === 0 ? (
              <p className="text-xs text-slate-300">No transcript yet. Start speaking to see your words and agent text events.</p>
            ) : (
              transcript.map((item) => (
                <div key={item.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">
                  <p className="font-semibold text-white/80">
                    {item.speaker === "you" ? "You" : item.speaker === "agent" ? "Agent" : "System"}
                  </p>
                  <p className="mt-1 text-slate-100">{item.text}</p>
                </div>
              ))
            )}
            {interimUserText ? (
              <div className="rounded-lg border border-sky-300/30 bg-sky-500/10 px-3 py-2 text-xs">
                <p className="font-semibold text-sky-100">You (listening...)</p>
                <p className="mt-1 text-sky-50">{interimUserText}</p>
              </div>
            ) : null}
          </div>
          {!isSpeechRecognitionSupported && status === "connected" ? (
            <p className="mt-3 text-[11px] text-amber-200">
              This browser does not expose Web Speech Recognition, so only agent text events (if provided) can appear.
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void toggleMute()}
            disabled={status !== "connected" || isEnding}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-sky-300/40 bg-sky-500/20 px-4 text-sm font-semibold text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isMuted ? "Unmute Mic" : "Mute Mic"}
          </button>
          <button
            type="button"
            onClick={() => void endCall()}
            disabled={isEnding}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-rose-300/40 bg-rose-500/20 px-4 text-sm font-semibold text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEnding ? "Ending..." : "End Session"}
          </button>
        </div>
      </section>
    </div>
  );
}
