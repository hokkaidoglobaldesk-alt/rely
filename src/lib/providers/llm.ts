import { getEnv } from "@/lib/env";
import type { ChatMessage, LlmProvider } from "@/lib/types";

function mockReply(messages: ChatMessage[]) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const heard = lastUser?.content?.trim() || "that";
  return `Got it — you said “${heard}”. I’m running in mock mode with no LLM API key. Add a Gemini, DeepSeek, or OpenAI key to swap this for a real model.`;
}

async function callGemini(messages: ChatMessage[]) {
  const key = getEnv("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const system = messages.find((m) => m.role === "system")?.content;
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const model = getEnv("GEMINI_MODEL", "gemini-2.0-flash");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: system
        ? { parts: [{ text: system }] }
        : undefined,
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 512,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini error ${res.status}: ${body.slice(0, 240)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned an empty reply");
  return text;
}

async function callOpenAiCompatible(
  messages: ChatMessage[],
  opts: { apiKey: string; baseUrl: string; model: string; label: string },
) {
  const res = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      messages,
      temperature: 0.7,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${opts.label} error ${res.status}: ${body.slice(0, 240)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${opts.label} returned an empty reply`);
  return text;
}

export async function generateReply(
  provider: LlmProvider,
  messages: ChatMessage[],
): Promise<{ text: string; used: LlmProvider; warning?: string }> {
  if (provider === "mock") {
    return { text: mockReply(messages), used: "mock" };
  }

  try {
    if (provider === "gemini") {
      return { text: await callGemini(messages), used: "gemini" };
    }

    if (provider === "deepseek") {
      const key = getEnv("DEEPSEEK_API_KEY");
      if (!key) throw new Error("DEEPSEEK_API_KEY is not set");
      return {
        text: await callOpenAiCompatible(messages, {
          apiKey: key,
          baseUrl: getEnv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
          model: getEnv("DEEPSEEK_MODEL", "deepseek-chat"),
          label: "DeepSeek",
        }),
        used: "deepseek",
      };
    }

    if (provider === "openai") {
      const key = getEnv("OPENAI_API_KEY");
      if (!key) throw new Error("OPENAI_API_KEY is not set");
      return {
        text: await callOpenAiCompatible(messages, {
          apiKey: key,
          baseUrl: getEnv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
          model: getEnv("OPENAI_MODEL", "gpt-4o-mini"),
          label: "OpenAI",
        }),
        used: "openai",
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "LLM failed";
    return {
      text: mockReply(messages),
      used: "mock",
      warning: `${message}. Fell back to mock LLM.`,
    };
  }

  return { text: mockReply(messages), used: "mock" };
}
