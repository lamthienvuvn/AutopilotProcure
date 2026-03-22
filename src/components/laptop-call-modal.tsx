"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type CallStatus = "ringing" | "connected" | "ended";

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type NegotiationState = {
  currentOffer: number;
  floorPrice: number;
  reasonsUsed: string[];
  accepted: boolean;
};

type SpeechRecognitionAlternativeLike = {
  transcript?: string;
};

type SpeechRecognitionResultLike = {
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

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

function detectLeverageReasons(input: string) {
  const normalized = input.toLowerCase();
  const reasons: string[] = [];

  if (
    /(quantity|bulk|volume|số lượng|250|200|300|100\+)/i.test(normalized)
  ) {
    reasons.push("bulk_volume");
  }

  if (/(net\s?15|net\s?30|prepay|upfront|fast payment|thanh toán nhanh)/i.test(normalized)) {
    reasons.push("payment_terms");
  }

  if (/(long term|quarterly|annual|repeat order|partnership|lâu dài)/i.test(normalized)) {
    reasons.push("long_term_commitment");
  }

  if (/(bundle|cross-sell|multi sku|add-on)/i.test(normalized)) {
    reasons.push("bundle_commitment");
  }

  if (/(competitor|other supplier|better offer|market)/i.test(normalized)) {
    reasons.push("competitive_pressure");
  }

  if (/(urgent|today|close now|sign now|chốt ngay)/i.test(normalized)) {
    reasons.push("fast_close");
  }

  return reasons;
}

function isAcceptance(input: string) {
  return /(ok|deal|accept|agreed|chốt|đồng ý|confirmed)/i.test(input);
}

function buildNegotiationReply(
  input: string,
  supplierName: string,
  state: NegotiationState,
) {
  const detectedReasons = detectLeverageReasons(input);
  const uniqueReasons = detectedReasons.filter((reason) => !state.reasonsUsed.includes(reason));
  const accepted = isAcceptance(input);

  let nextOffer = state.currentOffer;

  for (const reason of uniqueReasons) {
    if (reason === "bulk_volume") {
      nextOffer -= 2.2;
    } else if (reason === "payment_terms") {
      nextOffer -= 1.6;
    } else if (reason === "long_term_commitment") {
      nextOffer -= 1.4;
    } else if (reason === "bundle_commitment") {
      nextOffer -= 1.2;
    } else if (reason === "competitive_pressure") {
      nextOffer -= 1.8;
    } else if (reason === "fast_close") {
      nextOffer -= 1;
    }
  }

  nextOffer = Math.max(state.floorPrice, Math.round(nextOffer * 100) / 100);

  const couldMove = nextOffer < state.currentOffer;
  const reasonsText = uniqueReasons
    .map((reason) => {
      if (reason === "bulk_volume") {
        return "larger committed volume";
      }

      if (reason === "payment_terms") {
        return "faster payment terms";
      }

      if (reason === "long_term_commitment") {
        return "repeat order potential";
      }

      if (reason === "bundle_commitment") {
        return "bundle opportunity";
      }

      if (reason === "competitive_pressure") {
        return "competitive market pressure";
      }

      return "quick closing timeline";
    })
    .join(", ");

  let reply = `${supplierName} confirms current working quote at USD ${nextOffer.toFixed(2)} per unit.`;

  if (accepted) {
    reply = `${supplierName} accepts. Final confirmed price is USD ${nextOffer.toFixed(2)} per unit. We can proceed with draft PO now.`;
  } else if (couldMove && reasonsText) {
    reply = `${supplierName} can improve to USD ${nextOffer.toFixed(2)} per unit due to ${reasonsText}.`;
  } else if (!couldMove && uniqueReasons.length > 0) {
    reply = `${supplierName} cannot reduce below USD ${state.floorPrice.toFixed(2)} per unit right now. They cite margin floor, logistics, and current demand.`;
  } else if (/(moq|minimum)/i.test(input)) {
    reply = `${supplierName} can support MOQ at 80 units, and gives best tier from 100 units and above.`;
  } else if (/(delivery|lead|timeline)/i.test(input)) {
    reply = `${supplierName} confirms lead time 4 to 6 days after PO confirmation.`;
  }

  return {
    reply,
    nextState: {
      currentOffer: nextOffer,
      floorPrice: state.floorPrice,
      reasonsUsed: [...state.reasonsUsed, ...uniqueReasons],
      accepted,
    } satisfies NegotiationState,
  };
}

export function LaptopCallModal({
  supplierName,
  phoneNumber,
  estimatedPrice,
  requestedQuantity,
  onFinalize,
  onClose,
}: {
  supplierName: string;
  phoneNumber: string;
  estimatedPrice: number;
  requestedQuantity: number;
  onFinalize: (payload: {
    finalPrice: number;
    summary: string;
    accepted: boolean;
  }) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<CallStatus>("ringing");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [lastHeardText, setLastHeardText] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const processUserUtteranceRef = useRef<(text: string) => void>(() => {});
  const finalizedRef = useRef(false);
  const [negotiation, setNegotiation] = useState<NegotiationState>(() => {
    const floorRatio = requestedQuantity >= 250 ? 0.9 : requestedQuantity >= 120 ? 0.93 : 0.95;

    return {
      currentOffer: Math.round(estimatedPrice * 100) / 100,
      floorPrice: Math.round(estimatedPrice * floorRatio * 100) / 100,
      reasonsUsed: [],
      accepted: false,
    };
  });

  const statusLabel = status === "ringing" ? "Ringing" : status === "connected" ? "Connected" : "Ended";

  const speakText = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }, []);

  const processUserUtterance = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || status !== "connected") {
      return;
    }

    const userMessage: Message = {
      id: nextId(),
      role: "user",
      text: trimmed,
    };
    const { reply, nextState } = buildNegotiationReply(trimmed, supplierName, negotiation);
    const assistantMessage: Message = {
      id: nextId(),
      role: "assistant",
      text: reply,
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setNegotiation(nextState);
    speakText(reply);
  }, [negotiation, speakText, status, supplierName]);

  useEffect(() => {
    processUserUtteranceRef.current = processUserUtterance;
  }, [processUserUtterance]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const speechWindow = window as SpeechWindow;
    const WebSpeechRecognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!WebSpeechRecognition) {
      queueMicrotask(() => {
        setVoiceSupported(false);
      });
      return;
    }

    queueMicrotask(() => {
      setVoiceSupported(true);
    });

    const recognition = new WebSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let transcript = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i]?.[0]?.transcript ?? "";
        if (i < event.results.length - 1) {
          transcript += " ";
        }
      }

      transcript = transcript.trim();

      if (!transcript) {
        return;
      }

      setLastHeardText(transcript);
      processUserUtteranceRef.current(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  function answerCall() {
    setStatus("connected");
    const greeting = `Hello, this is ${supplierName}. We are ready to confirm pricing. Current estimate is USD ${estimatedPrice.toFixed(2)} per unit.`;

    setMessages([
      {
        id: nextId(),
        role: "assistant",
        text: greeting,
      },
    ]);
    speakText(greeting);
  }

  function finalizeIfNeeded() {
    if (finalizedRef.current || messages.length === 0) {
      return;
    }

    finalizedRef.current = true;
    const lastAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");

    onFinalize({
      finalPrice: negotiation.currentOffer,
      summary:
        lastAssistantMessage?.text ??
        `${supplierName} final confirmed quote at USD ${negotiation.currentOffer.toFixed(2)} per unit.`,
      accepted: negotiation.accepted,
    });
  }

  function endCall() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsListening(false);
    setStatus("ended");
    finalizeIfNeeded();
  }

  function toggleListening() {
    if (!recognitionRef.current || status !== "connected") {
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    recognitionRef.current.start();
    setIsListening(true);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#09131d]/62 p-4 backdrop-blur-sm">
      <section className="w-full max-w-2xl rounded-[28px] border border-white/20 bg-[#0f1b26] p-5 text-white shadow-[0_30px_120px_rgba(0,0,0,0.45)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
              Laptop Demo Call
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">
              {supplierName}
            </h3>
            <p className="mt-1 text-sm text-slate-300">Dial target: {phoneNumber}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              finalizeIfNeeded();
              onClose();
            }}
            className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/80 hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-sm font-semibold text-white">Call status: {statusLabel}</p>
          {status === "ringing" ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={endCall}
                className="rounded-xl border border-rose-300/40 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-100"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={answerCall}
                className="rounded-xl border border-emerald-300/40 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100"
              >
                Answer
              </button>
            </div>
          ) : status === "connected" ? (
            <button
              type="button"
              onClick={endCall}
              className="rounded-xl border border-amber-300/40 bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-100"
            >
              End Call
            </button>
          ) : null}
        </div>

        <div className="mt-4 h-72 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-3">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-300">
              Answer the call to start supplier price conversation on this laptop.
            </p>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-2xl px-3 py-2 text-sm leading-6 ${
                    message.role === "assistant"
                      ? "bg-sky-500/20 text-sky-50"
                      : "bg-white/10 text-white"
                  }`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
                    {message.role === "assistant" ? supplierName : "You"}
                  </p>
                  <p>{message.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={toggleListening}
              disabled={status !== "connected" || !voiceSupported}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-sky-500 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isListening ? "Stop Listening" : "Start Voice Talk"}
            </button>
            {!voiceSupported ? (
              <p className="text-xs text-amber-200">
                Browser voice recognition is unavailable. Use Chrome/Edge for live voice demo.
              </p>
            ) : (
              <p className="text-xs text-slate-300">
                {isListening
                  ? "Listening... speak naturally about price, MOQ, delivery."
                  : "Press Start Voice Talk then speak to negotiate live."}
              </p>
            )}
          </div>
          {lastHeardText ? (
            <p className="mt-2 text-xs text-slate-300">
              Last heard: {lastHeardText}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-emerald-200">
            Live offer now: USD {negotiation.currentOffer.toFixed(2)} • Floor: USD {negotiation.floorPrice.toFixed(2)}
          </p>
        </div>
      </section>
    </div>
  );
}
