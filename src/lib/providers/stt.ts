import { getEnv } from "@/lib/env";
import type { SttProvider } from "@/lib/types";

async function whisperTranscribe(audio: Buffer, mimeType: string) {
  const key = getEnv("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set for Whisper STT");

  const form = new FormData();
  const ext = mimeType.includes("webm")
    ? "webm"
    : mimeType.includes("mp4")
      ? "mp4"
      : mimeType.includes("wav")
        ? "wav"
        : "webm";
  form.append(
    "file",
    new Blob([new Uint8Array(audio)], { type: mimeType }),
    `audio.${ext}`,
  );
  form.append("model", getEnv("WHISPER_MODEL", "whisper-1"));

  const res = await fetch(
    `${getEnv("OPENAI_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, "")}/audio/transcriptions`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Whisper error ${res.status}: ${body.slice(0, 240)}`);
  }

  const data = (await res.json()) as { text?: string };
  const text = data.text?.trim();
  if (!text) throw new Error("Whisper returned empty transcript");
  return text;
}

async function deepgramTranscribe(audio: Buffer, mimeType: string) {
  const key = getEnv("DEEPGRAM_API_KEY");
  if (!key) throw new Error("DEEPGRAM_API_KEY is not set");

  const res = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": mimeType || "audio/webm",
      },
      body: new Uint8Array(audio),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Deepgram error ${res.status}: ${body.slice(0, 240)}`);
  }

  const data = (await res.json()) as {
    results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
  };
  const text =
    data.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || "";
  if (!text) throw new Error("Deepgram returned empty transcript");
  return text;
}

export async function transcribeAudio(opts: {
  provider: SttProvider;
  audio?: Buffer | null;
  mimeType?: string;
  clientTranscript?: string;
}): Promise<{ text: string; used: SttProvider; warning?: string }> {
  const client = opts.clientTranscript?.trim();

  if (opts.provider === "browser" || opts.provider === "mock") {
    if (client) return { text: client, used: opts.provider };
    return {
      text: "",
      used: opts.provider,
      warning: "No client transcript provided for browser/mock STT.",
    };
  }

  if (!opts.audio || opts.audio.length === 0) {
    if (client) {
      return {
        text: client,
        used: "browser",
        warning: "No audio bytes received; used browser transcript.",
      };
    }
    throw new Error("No audio provided for server STT");
  }

  try {
    if (opts.provider === "whisper") {
      return {
        text: await whisperTranscribe(
          opts.audio,
          opts.mimeType || "audio/webm",
        ),
        used: "whisper",
      };
    }
    if (opts.provider === "deepgram") {
      return {
        text: await deepgramTranscribe(
          opts.audio,
          opts.mimeType || "audio/webm",
        ),
        used: "deepgram",
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "STT failed";
    if (client) {
      return {
        text: client,
        used: "browser",
        warning: `${message}. Fell back to browser transcript.`,
      };
    }
    throw error;
  }

  if (client) return { text: client, used: "browser" };
  throw new Error("Unsupported STT provider");
}
