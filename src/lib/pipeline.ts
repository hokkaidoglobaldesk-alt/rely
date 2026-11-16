import { generateReply } from "@/lib/providers/llm";
import { transcribeAudio } from "@/lib/providers/stt";
import { synthesizeSpeech } from "@/lib/providers/tts";
import type {
  AgentConfig,
  ChatMessage,
  TurnResponse,
} from "@/lib/types";

const DEFAULT_PROMPT =
  "You are a concise voice agent. Keep answers under 3 short sentences unless asked for detail. Sound natural when spoken aloud.";

export async function runTurn(opts: {
  config: AgentConfig;
  messages: ChatMessage[];
  audio?: Buffer | null;
  mimeType?: string;
  clientTranscript?: string;
}): Promise<TurnResponse> {
  const warnings: string[] = [];
  const systemPrompt = opts.config.systemPrompt?.trim() || DEFAULT_PROMPT;

  const stt = await transcribeAudio({
    provider: opts.config.stt,
    audio: opts.audio,
    mimeType: opts.mimeType,
    clientTranscript: opts.clientTranscript,
  });
  if (stt.warning) warnings.push(stt.warning);
  if (!stt.text) {
    throw new Error("Could not get a transcript from speech");
  }

  const baseMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...opts.messages.filter((m) => m.role !== "system"),
    { role: "user", content: stt.text },
  ];

  const llm = await generateReply(opts.config.llm, baseMessages);
  if (llm.warning) warnings.push(llm.warning);

  const nextMessages: ChatMessage[] = [
    ...opts.messages.filter((m) => m.role !== "system"),
    { role: "user", content: stt.text },
    { role: "assistant", content: llm.text },
  ];

  const tts = await synthesizeSpeech({
    provider: opts.config.tts,
    text: llm.text,
    voiceId: opts.config.voiceId,
  });
  if (tts.warning) warnings.push(tts.warning);

  return {
    transcript: stt.text,
    reply: llm.text,
    messages: nextMessages,
    audioBase64: tts.audioBase64,
    audioMime: tts.audioMime,
    used: {
      stt: stt.used,
      llm: llm.used,
      tts: tts.used,
    },
    warnings,
  };
}
