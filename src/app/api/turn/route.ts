import { NextResponse } from "next/server";
import { runTurn } from "@/lib/pipeline";
import type { AgentConfig, ChatMessage } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    let config: AgentConfig;
    let messages: ChatMessage[] = [];
    let clientTranscript = "";
    let audio: Buffer | null = null;
    let mimeType = "audio/webm";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const configRaw = String(form.get("config") || "{}");
      const messagesRaw = String(form.get("messages") || "[]");
      clientTranscript = String(form.get("transcript") || "");
      config = JSON.parse(configRaw) as AgentConfig;
      messages = JSON.parse(messagesRaw) as ChatMessage[];
      const file = form.get("audio");
      if (file && typeof file !== "string") {
        const blob = file as File;
        mimeType = blob.type || mimeType;
        audio = Buffer.from(await blob.arrayBuffer());
      }
    } else {
      const body = (await request.json()) as {
        config: AgentConfig;
        messages?: ChatMessage[];
        transcript?: string;
      };
      config = body.config;
      messages = body.messages || [];
      clientTranscript = body.transcript || "";
    }

    if (!config?.llm || !config?.stt || !config?.tts) {
      return NextResponse.json(
        { error: "Missing agent config (llm, stt, tts)." },
        { status: 400 },
      );
    }

    const result = await runTurn({
      config,
      messages,
      audio,
      mimeType,
      clientTranscript,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Turn failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
