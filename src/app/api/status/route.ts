import { NextResponse } from "next/server";
import { hasEnv } from "@/lib/env";
import type { ProviderStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const status: ProviderStatus = {
    gemini: hasEnv("GEMINI_API_KEY"),
    openai: hasEnv("OPENAI_API_KEY"),
    deepseek: hasEnv("DEEPSEEK_API_KEY"),
    whisper: hasEnv("OPENAI_API_KEY"),
    deepgram: hasEnv("DEEPGRAM_API_KEY"),
    elevenlabs: hasEnv("ELEVENLABS_API_KEY"),
    minimax: hasEnv("MINIMAX_API_KEY", "MINIMAX_GROUP_ID"),
  };

  return NextResponse.json({
    status,
    defaults: {
      llm: status.gemini
        ? "gemini"
        : status.deepseek
          ? "deepseek"
          : status.openai
            ? "openai"
            : "mock",
      stt: status.whisper
        ? "whisper"
        : status.deepgram
          ? "deepgram"
          : "browser",
      tts: status.elevenlabs
        ? "elevenlabs"
        : status.minimax
          ? "minimax"
          : status.openai
            ? "openai"
            : "browser",
    },
  });
}
