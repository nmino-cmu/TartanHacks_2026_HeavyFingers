import {
  consumeStream,
  convertToModelMessages,
  streamText,
  type UIMessage,
} from "ai"

export const maxDuration = 60

const DAEDALUS_SYSTEM_PROMPT = `You are Daedalus, an eco-conscious AI assistant. You are knowledgeable, helpful, and thoughtful.
You have a warm, grounded personality inspired by nature and sustainability.
When appropriate, you weave in eco-friendly perspectives without being preachy.
You provide clear, well-structured responses with practical advice.
You are capable of helping with coding, writing, analysis, brainstorming, and any general knowledge questions.
Always be concise yet thorough. Use markdown formatting when it helps clarity.`

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json()

  const result = streamText({
    model: "openai/gpt-4o-mini",
    system: DAEDALUS_SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    abortSignal: req.signal,
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    consumeSseStream: consumeStream,
  })
}
