import { NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/providers/tts";
import type { TtsProvider } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      text: string;
      provider: TtsProvider;
      voiceId?: string;
    };

    const text = body.text?.trim();
    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const result = await synthesizeSpeech({
      provider: body.provider || "browser",
      text,
      voiceId: body.voiceId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "TTS failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
