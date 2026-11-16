"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  LoaderCircle,
  Mic,
  MicOff,
  Settings2,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  browserSpeak,
  getSpeechRecognition,
  playBase64Audio,
} from "@/lib/browser-speech";
import { cn } from "@/lib/utils";
import type {
  AgentConfig,
  ChatMessage,
  LlmProvider,
  ProviderStatus,
  SttProvider,
  TtsProvider,
  TurnResponse,
} from "@/lib/types";

type StatusPayload = {
  status: ProviderStatus;
  defaults: {
    llm: LlmProvider;
    stt: SttProvider;
    tts: TtsProvider;
  };
};

const DEFAULT_PROMPT =
  "You are Relay, a helpful phone-style voice agent. Keep replies short, clear, and natural when spoken aloud.";

function badge(ok: boolean) {
  return ok ? "ready" : "mock / browser";
}

export function VoiceStudio() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [used, setUsed] = useState<TurnResponse["used"] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [interim, setInterim] = useState("");
  const [textDraft, setTextDraft] = useState("");
  const [pending, startTransition] = useTransition();

  const [config, setConfig] = useState<AgentConfig>({
    systemPrompt: DEFAULT_PROMPT,
    llm: "mock",
    stt: "browser",
    tts: "browser",
    voiceId: "",
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<ReturnType<typeof getSpeechRecognition> | null>(
    null,
  );
  const transcriptRef = useRef("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((data: StatusPayload) => {
        setStatus(data.status);
        setConfig((prev) => ({
          ...prev,
          llm: data.defaults.llm,
          stt: data.defaults.stt,
          tts: data.defaults.tts,
        }));
      })
      .catch(() => {
        setStatus({
          gemini: false,
          openai: false,
          deepseek: false,
          whisper: false,
          deepgram: false,
          elevenlabs: false,
          minimax: false,
        });
      });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, interim, busy]);

  const pipelineLabel = useMemo(() => {
    const u = used || {
      stt: config.stt,
      llm: config.llm,
      tts: config.tts,
    };
    return `${u.stt} → ${u.llm} → ${u.tts}`;
  }, [config, used]);

  async function runTurnWithPayload(opts: {
    blob?: Blob | null;
    transcript?: string;
  }) {
    setBusy(true);
    setError(null);
    setWarnings([]);

    try {
      const form = new FormData();
      form.set("config", JSON.stringify(config));
      form.set("messages", JSON.stringify(messages));
      form.set("transcript", opts.transcript || "");
      if (opts.blob) form.set("audio", opts.blob, "utterance.webm");

      const res = await fetch("/api/turn", { method: "POST", body: form });
      const data = (await res.json()) as TurnResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || "Turn failed");

      startTransition(() => {
        setMessages(data.messages);
        setUsed(data.used);
        setWarnings(data.warnings || []);
      });

      if (data.audioBase64) {
        await playBase64Audio(data.audioBase64, data.audioMime || "audio/mpeg");
      } else {
        await browserSpeak(data.reply);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
      setInterim("");
      transcriptRef.current = "";
    }
  }

  async function startListening() {
    if (busy || listening) return;
    setError(null);
    setInterim("");
    transcriptRef.current = "";

    const useBrowserStt = config.stt === "browser" || config.stt === "mock";

    if (useBrowserStt) {
      const recognition = getSpeechRecognition();
      if (!recognition) {
        setError(
          "This browser has no SpeechRecognition API. Switch STT to Whisper/Deepgram and provide a key, or use Chrome.",
        );
        return;
      }

      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        let finalText = "";
        let interimText = "";
        for (let i = 0; i < event.results.length; i += 1) {
          const piece = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalText += piece;
          else interimText += piece;
        }
        if (finalText) transcriptRef.current = finalText.trim();
        setInterim((finalText || interimText).trim());
      };
      recognition.onerror = (event) => {
        setError(event.error || "Speech recognition failed");
        setListening(false);
      };
      recognition.onend = () => {
        setListening(false);
        const text = transcriptRef.current.trim() || interim.trim();
        if (text) void runTurnWithPayload({ transcript: text });
      };

      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        void runTurnWithPayload({ blob, transcript: transcriptRef.current });
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setListening(true);

      // Optional parallel browser transcript as fallback
      const recognition = getSpeechRecognition();
      if (recognition) {
        recognition.lang = "en-US";
        recognition.interimResults = true;
        recognition.continuous = true;
        recognition.onresult = (event) => {
          let text = "";
          for (let i = 0; i < event.results.length; i += 1) {
            text += event.results[i][0].transcript;
          }
          transcriptRef.current = text.trim();
          setInterim(text.trim());
        };
        recognition.onerror = () => undefined;
        recognition.onend = () => undefined;
        recognitionRef.current = recognition;
        try {
          recognition.start();
        } catch {
          // ignore if recognition cannot start alongside recorder
        }
      }
    } catch {
      setError("Microphone permission denied.");
    }
  }

  function stopListening() {
    if (!listening) return;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    setListening(false);
  }

  function clearChat() {
    setMessages([]);
    setUsed(null);
    setWarnings([]);
    setError(null);
    setInterim("");
  }

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 pb-16 pt-8 sm:px-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="aurora aurora-a" />
        <div className="aurora aurora-b" />
      </div>

      <header className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-5xl tracking-tight text-[var(--ink)] sm:text-6xl">
            Relay
          </p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--muted)] sm:text-base">
            Speak, get a model reply, hear it back — STT → LLM → TTS with
            swappable providers.
          </p>
        </div>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Open settings"
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </header>

      <main className="relative z-10 mt-10 grid flex-1 gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="flex flex-col">
          <div
            ref={scrollRef}
            className="min-h-[280px] flex-1 space-y-4 overflow-y-auto pr-1"
          >
            {messages.length === 0 && !interim && !busy ? (
              <div className="animate-fade-up rounded-3xl border border-[var(--line)] bg-white/55 p-6 backdrop-blur">
                <p className="font-display text-2xl text-[var(--ink)]">
                  Hold the mic and talk.
                </p>
                <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">
                  Without API keys, Relay uses browser speech recognition, a
                  mock LLM, and browser TTS so you can exercise the loop
                  immediately.
                </p>
              </div>
            ) : null}

            {messages.map((m, idx) => (
              <div
                key={`${m.role}-${idx}-${m.content.slice(0, 12)}`}
                className={cn(
                  "animate-fade-up max-w-[92%] rounded-3xl px-4 py-3 text-sm leading-relaxed",
                  m.role === "user"
                    ? "ml-auto bg-[var(--ink)] text-[var(--paper)]"
                    : "bg-white/70 text-[var(--ink)] border border-[var(--line)]",
                )}
              >
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] opacity-60">
                  {m.role === "user" ? "You" : "Agent"}
                </p>
                <p>{m.content}</p>
              </div>
            ))}

            {interim ? (
              <div className="animate-fade-up max-w-[92%] ml-auto rounded-3xl bg-[var(--ink)]/80 px-4 py-3 text-sm text-[var(--paper)]">
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] opacity-60">
                  Listening
                </p>
                <p>{interim}</p>
              </div>
            ) : null}

            {busy ? (
              <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Thinking and speaking…
              </div>
            ) : null}
          </div>

          <div className="mt-8 flex flex-col items-center gap-4">
            <button
              type="button"
              aria-label={listening ? "Stop listening" : "Start listening"}
              disabled={busy}
              onMouseDown={() => void startListening()}
              onMouseUp={stopListening}
              onMouseLeave={() => {
                if (listening) stopListening();
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                void startListening();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                stopListening();
              }}
              className={cn(
                "mic-button relative flex h-28 w-28 items-center justify-center rounded-full transition-transform",
                listening && "is-listening scale-105",
                busy && "opacity-60",
              )}
            >
              {listening ? (
                <Square className="h-8 w-8 fill-current" />
              ) : busy ? (
                <LoaderCircle className="h-8 w-8 animate-spin" />
              ) : (
                <Mic className="h-8 w-8" />
              )}
            </button>
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
              {listening ? "Release to send" : "Press & hold to talk"}
            </p>
            <form
              className="flex w-full max-w-md gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (busy || listening) return;
                const form = e.currentTarget;
                const data = new FormData(form);
                const text = String(data.get("turn") || textDraft).trim();
                if (!text) return;
                setTextDraft("");
                form.reset();
                void runTurnWithPayload({ transcript: text });
              }}
            >
              <input
                name="turn"
                defaultValue=""
                onChange={(e) => setTextDraft(e.target.value)}
                placeholder="Or type a turn…"
                disabled={busy || listening}
                className="h-11 flex-1 rounded-2xl border border-[var(--line)] bg-white/80 px-3 text-sm outline-none focus:ring-2 focus:ring-teal-700/30"
              />
              <Button type="submit" disabled={busy || listening}>
                Send
              </Button>
            </form>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full border border-[var(--line)] bg-white/60 px-3 py-1 text-xs text-[var(--muted)]">
                {pipelineLabel}
                {pending ? " · syncing" : ""}
              </span>
              <Button variant="ghost" size="sm" onClick={clearChat}>
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </Button>
            </div>
            {error ? (
              <p className="max-w-md text-center text-sm text-rose-700">
                {error}
              </p>
            ) : null}
            {warnings.length > 0 ? (
              <ul className="max-w-md space-y-1 text-center text-xs text-amber-800">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        <aside
          className={cn(
            "rounded-[28px] border border-[var(--line)] bg-white/65 p-5 backdrop-blur transition-all lg:block",
            settingsOpen ? "block" : "hidden lg:block",
          )}
        >
          <div className="mb-5 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-teal-800" />
            <h2 className="font-display text-2xl text-[var(--ink)]">Agent</h2>
          </div>

          <label className="block text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
            System prompt
            <textarea
              value={config.systemPrompt}
              onChange={(e) =>
                setConfig((c) => ({ ...c, systemPrompt: e.target.value }))
              }
              rows={5}
              className="mt-2 w-full resize-y rounded-2xl border border-[var(--line)] bg-white/80 px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-teal-700/30"
            />
          </label>

          <div className="mt-4 grid gap-3">
            <Field
              label="LLM"
              value={config.llm}
              onChange={(v) =>
                setConfig((c) => ({ ...c, llm: v as LlmProvider }))
              }
              options={[
                ["gemini", `Gemini (${badge(!!status?.gemini)})`],
                ["deepseek", `DeepSeek (${badge(!!status?.deepseek)})`],
                ["openai", `ChatGPT / OpenAI (${badge(!!status?.openai)})`],
                ["mock", "Mock (no key)"],
              ]}
            />
            <Field
              label="STT"
              value={config.stt}
              onChange={(v) =>
                setConfig((c) => ({ ...c, stt: v as SttProvider }))
              }
              options={[
                ["browser", "Browser SpeechRecognition"],
                ["whisper", `Whisper (${badge(!!status?.whisper)})`],
                ["deepgram", `Deepgram (${badge(!!status?.deepgram)})`],
                ["mock", "Pass-through transcript"],
              ]}
            />
            <Field
              label="TTS"
              value={config.tts}
              onChange={(v) =>
                setConfig((c) => ({ ...c, tts: v as TtsProvider }))
              }
              options={[
                ["browser", "Browser speechSynthesis"],
                ["elevenlabs", `ElevenLabs (${badge(!!status?.elevenlabs)})`],
                ["minimax", `MiniMax (${badge(!!status?.minimax)})`],
                ["openai", `OpenAI TTS (${badge(!!status?.openai)})`],
                ["mock", "Silent / browser fallback"],
              ]}
            />
            <label className="block text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              Voice ID (optional)
              <input
                value={config.voiceId || ""}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, voiceId: e.target.value }))
                }
                placeholder="ElevenLabs / MiniMax / OpenAI voice"
                className="mt-2 h-11 w-full rounded-2xl border border-[var(--line)] bg-white/80 px-3 text-sm outline-none focus:ring-2 focus:ring-teal-700/30"
              />
            </label>
          </div>

          <div className="mt-6 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--wash)]/70 p-4 text-xs leading-relaxed text-[var(--muted)] break-words">
            <p className="mb-2 flex items-center gap-1 font-medium text-[var(--ink)]">
              <MicOff className="h-3.5 w-3.5" />
              Keys stay on the server
            </p>
            <p>
              Set env vars like <code>GEMINI_API_KEY</code>,{" "}
              <code>DEEPSEEK_API_KEY</code>, <code>ELEVENLABS_API_KEY</code>,{" "}
              <code>MINIMAX_API_KEY</code>.
            </p>
            <p className="mt-2">
              Missing keys fall back to mock / browser so the loop still runs.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 h-11 w-full rounded-2xl border border-[var(--line)] bg-white/80 px-3 text-sm normal-case tracking-normal text-[var(--ink)] outline-none focus:ring-2 focus:ring-teal-700/30"
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
