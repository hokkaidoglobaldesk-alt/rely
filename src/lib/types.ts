export type LlmProvider = "gemini" | "openai" | "deepseek" | "mock";
export type SttProvider = "whisper" | "deepgram" | "browser" | "mock";
export type TtsProvider =
  | "elevenlabs"
  | "minimax"
  | "openai"
  | "browser"
  | "mock";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AgentConfig = {
  systemPrompt: string;
  llm: LlmProvider;
  stt: SttProvider;
  tts: TtsProvider;
  voiceId?: string;
};

export type TurnRequest = {
  transcript?: string;
  messages: ChatMessage[];
  config: AgentConfig;
};

export type TurnResponse = {
  transcript: string;
  reply: string;
  messages: ChatMessage[];
  audioBase64?: string | null;
  audioMime?: string | null;
  used: {
    stt: SttProvider;
    llm: LlmProvider;
    tts: TtsProvider;
  };
  warnings: string[];
};

export type ProviderStatus = {
  gemini: boolean;
  openai: boolean;
  deepseek: boolean;
  whisper: boolean;
  deepgram: boolean;
  elevenlabs: boolean;
  minimax: boolean;
};
