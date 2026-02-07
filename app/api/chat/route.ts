import {
  consumeStream,
  convertToModelMessages,
  streamText,
  type UIMessage,
} from "ai"

// import Dedalus from 'dedalus-labs';
// import { DedalusRunner } from 'dedalus-labs';

import { createOpenAI } from "@ai-sdk/openai";

export const maxDuration = 60
// const client = new Dedalus();
// const runner = new DedalusRunner(client);

const dedalus = createOpenAI({
  apiKey: process.env.DEDALUS_API_KEY,       
  baseURL: "https://api.dedaluslabs.ai/v1", 
});

const SYSTEM_PROMPT = 
`You are an eco-conscious AI assistant. You are knowledgeable, helpful, and thoughtful.
You have a warm, grounded personality inspired by nature and sustainability.
You provide clear, well-structured responses with practical advice.
You are capable of helping with coding, writing, analysis, brainstorming, and any general knowledge questions.
Always be concise yet thorough. Use markdown formatting when it helps clarity.`

const DEFAULT_MODEL = "openai/gpt-4o-mini";

const ALLOWED_MODELS = new Set<string>([
  "openai/gpt-4o-mini",
  "anthropic/claude-3-5-sonnet",
  "google/gemini-1.5-pro",
]);

export async function POST(req: Request) {
  const { messages, model }: { messages: UIMessage[]; model?: string} = 
  await req.json()

  const chosenModel = model && ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL;

  const result = streamText({
    model: dedalus(chosenModel),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    abortSignal: req.signal,
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    consumeSseStream: consumeStream,
  })
}
