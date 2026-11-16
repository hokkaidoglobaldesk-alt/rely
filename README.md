# Relay

A simple Retell-style voice agent loop:

**STT → LLM → TTS**

Press and hold the mic, speak, get a model reply, hear it spoken back. Swap providers without changing the app shape.

## What you get

| Stage | Options |
| --- | --- |
| STT | Browser SpeechRecognition, OpenAI Whisper, Deepgram |
| LLM | Gemini, DeepSeek, OpenAI/ChatGPT, mock |
| TTS | Browser speechSynthesis, ElevenLabs, MiniMax, OpenAI TTS |

Without API keys the app still runs using browser speech + a mock LLM, so you can validate the turn loop immediately.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional keys
npm run dev
```

Open [http://localhost:3847](http://localhost:3847).

## Configure providers

Put keys in `.env.local` (see `.env.example`). The UI `/api/status` endpoint reports which providers are ready. Missing keys fall back to mock / browser instead of hard-failing.

Useful combinations:

- **More control over the brain:** DeepSeek or OpenAI as LLM, keep ElevenLabs/MiniMax for voice
- **Lowest friction demo:** browser STT + Gemini + browser TTS
- **Closer to production voice quality:** Whisper/Deepgram + Gemini/DeepSeek + ElevenLabs or MiniMax

## Architecture

```
Browser mic
   ↓
/api/turn   (or browser STT → same route with transcript)
   ↓
STT provider → LLM provider → TTS provider
   ↓
audio + transcript rendered in the studio UI
```

Core files:

- `src/lib/pipeline.ts` — one turn orchestration
- `src/lib/providers/*` — STT / LLM / TTS adapters
- `src/components/VoiceStudio.tsx` — conversation UI

## Scope note

This is the core loop Retell-style products are built around. Production telephony (SIP/WebRTC trunks, barge-in, endpointing, streaming partial TTS, call recording, concurrency) is a separate layer on top of this same pipeline.
