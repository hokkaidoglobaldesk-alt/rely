import { getEnv } from "@/lib/env";
import type { TtsProvider } from "@/lib/types";

async function elevenLabsSpeak(text: string, voiceId?: string) {
  const key = getEnv("ELEVENLABS_API_KEY");
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  const voice =
    voiceId || getEnv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM");

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: getEnv("ELEVENLABS_MODEL", "eleven_multilingual_v2"),
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8,
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs error ${res.status}: ${body.slice(0, 240)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return { audioBase64: buf.toString("base64"), audioMime: "audio/mpeg" };
}

async function miniMaxSpeak(text: string, voiceId?: string) {
  const key = getEnv("MINIMAX_API_KEY");
  const groupId = getEnv("MINIMAX_GROUP_ID");
  if (!key || !groupId) {
    throw new Error("MINIMAX_API_KEY and MINIMAX_GROUP_ID are required");
  }

  const voice = voiceId || getEnv("MINIMAX_VOICE_ID", "female-chengshu");
  const res = await fetch(
    `https://api.minimax.chat/v1/t2a_v2?GroupId=${groupId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getEnv("MINIMAX_TTS_MODEL", "speech-02-hd"),
        text,
        stream: false,
        voice_setting: {
          voice_id: voice,
          speed: 1,
          vol: 1,
          pitch: 0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: "mp3",
          channel: 1,
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MiniMax error ${res.status}: ${body.slice(0, 240)}`);
  }

  const data = (await res.json()) as {
    data?: { audio?: string };
    base_resp?: { status_code?: number; status_msg?: string };
  };

  if (data.base_resp?.status_code && data.base_resp.status_code !== 0) {
    throw new Error(
      `MiniMax TTS failed: ${data.base_resp.status_msg || "unknown error"}`,
    );
  }

  const hexOrB64 = data.data?.audio;
  if (!hexOrB64) throw new Error("MiniMax returned no audio");

  // MiniMax often returns hex-encoded audio.
  const looksHex = /^[0-9a-fA-F]+$/.test(hexOrB64) && hexOrB64.length % 2 === 0;
  const audioBase64 = looksHex
    ? Buffer.from(hexOrB64, "hex").toString("base64")
    : hexOrB64;

  return { audioBase64, audioMime: "audio/mpeg" };
}

async function openAiSpeak(text: string, voiceId?: string) {
  const key = getEnv("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set for OpenAI TTS");

  const res = await fetch(
    `${getEnv("OPENAI_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, "")}/audio/speech`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getEnv("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
        voice: voiceId || getEnv("OPENAI_TTS_VOICE", "coral"),
        input: text,
        format: "mp3",
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI TTS error ${res.status}: ${body.slice(0, 240)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return { audioBase64: buf.toString("base64"), audioMime: "audio/mpeg" };
}

export async function synthesizeSpeech(opts: {
  provider: TtsProvider;
  text: string;
  voiceId?: string;
}): Promise<{
  audioBase64: string | null;
  audioMime: string | null;
  used: TtsProvider;
  warning?: string;
}> {
  if (opts.provider === "browser" || opts.provider === "mock") {
    return {
      audioBase64: null,
      audioMime: null,
      used: opts.provider,
    };
  }

  try {
    if (opts.provider === "elevenlabs") {
      const audio = await elevenLabsSpeak(opts.text, opts.voiceId);
      return { ...audio, used: "elevenlabs" };
    }
    if (opts.provider === "minimax") {
      const audio = await miniMaxSpeak(opts.text, opts.voiceId);
      return { ...audio, used: "minimax" };
    }
    if (opts.provider === "openai") {
      const audio = await openAiSpeak(opts.text, opts.voiceId);
      return { ...audio, used: "openai" };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "TTS failed";
    return {
      audioBase64: null,
      audioMime: null,
      used: "browser",
      warning: `${message}. Fell back to browser TTS.`,
    };
  }

  return {
    audioBase64: null,
    audioMime: null,
    used: "browser",
    warning: "Unsupported TTS provider; using browser TTS.",
  };
}
