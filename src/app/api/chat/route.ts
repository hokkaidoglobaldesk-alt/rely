import { NextResponse } from "next/server";
import { generateReply } from "@/lib/providers/llm";
import type { AgentConfig, ChatMessage } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      text: string;
      messages?: ChatMessage[];
      config: Pick<AgentConfig, "llm" | "systemPrompt">;
    };

    const text = body.text?.trim();
    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const systemPrompt =
      body.config.systemPrompt?.trim() ||
      "You are a concise voice agent. Keep answers short and speakable.";

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...(body.messages || []).filter((m) => m.role !== "system"),
      { role: "user", content: text },
    ];

    const llm = await generateReply(body.config.llm, messages);
    const nextMessages: ChatMessage[] = [
      ...(body.messages || []).filter((m) => m.role !== "system"),
      { role: "user", content: text },
      { role: "assistant", content: llm.text },
    ];

    return NextResponse.json({
      reply: llm.text,
      messages: nextMessages,
      used: llm.used,
      warning: llm.warning || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
