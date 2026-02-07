import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai"
import {
  appendAssistantCompletion,
  persistPromptSnapshot,
} from "@/lib/conversation-store"

export const maxDuration = 60

const DAEDALUS_SYSTEM_PROMPT = `You are Daedalus, an eco-conscious AI assistant. You are knowledgeable, helpful, and thoughtful.
You have a warm, grounded personality inspired by nature and sustainability.
When appropriate, you weave in eco-friendly perspectives without being preachy.
You provide clear, well-structured responses with practical advice.
You are capable of helping with coding, writing, analysis, brainstorming, and any general knowledge questions.
Always be concise yet thorough. Use markdown formatting when it helps clarity.`

const DAEDALUS_API_BASE_URL = "https://api.dedaluslabs.ai/v1"
const DEFAULT_DEDALUS_MODEL = "anthropic/claude-opus-4-5"
type StreamFinishReason = "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other"

type DedalusRole = "system" | "user" | "assistant"

interface DedalusChatMessage {
  role: DedalusRole
  content: string
}

interface DedalusSseChoice {
  delta?: {
    content?: unknown
  }
  finish_reason?: unknown
}

interface DedalusErrorPayload {
  error?: {
    message?: unknown
  }
}

function getDedalusApiKeyError(): string | null {
  const dedalusApiKey = process.env.DEDALUS_API_KEY?.trim()
  if (!dedalusApiKey || dedalusApiKey === "your_key_here") {
    return "Missing or invalid DEDALUS_API_KEY. Update your local environment variables and restart the server."
  }

  return null
}

function extractTextFromUIMessage(message: UIMessage): string {
  const fromParts = message.parts
    ?.filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("")

  if (typeof fromParts === "string" && fromParts.length > 0) {
    return fromParts
  }

  const messageWithContent = message as UIMessage & { content?: unknown }
  if (typeof messageWithContent.content === "string") {
    return messageWithContent.content
  }

  return ""
}

function toDedalusMessages(messages: UIMessage[]): DedalusChatMessage[] {
  const dedalusMessages: DedalusChatMessage[] = [
    { role: "system", content: DAEDALUS_SYSTEM_PROMPT },
  ]

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant" && message.role !== "system") {
      continue
    }

    const text = extractTextFromUIMessage(message).trim()
    if (!text) {
      continue
    }

    dedalusMessages.push({ role: message.role, content: text })
  }

  return dedalusMessages
}

function mapDedalusFinishReason(rawFinishReason: string): StreamFinishReason {
  switch (rawFinishReason) {
    case "stop":
      return "stop"
    case "length":
      return "length"
    case "content_filter":
      return "content-filter"
    case "tool_calls":
      return "tool-calls"
    case "error":
      return "error"
    default:
      return "other"
  }
}

async function readDedalusErrorResponse(response: Response): Promise<string> {
  let errorBody: unknown = null

  try {
    errorBody = await response.json()
  } catch (error) {
    errorBody = null
  }

  const message =
    errorBody &&
    typeof errorBody === "object" &&
    typeof (errorBody as DedalusErrorPayload).error?.message === "string"
      ? ((errorBody as DedalusErrorPayload).error!.message as string)
      : null

  return message || `Dedalus request failed with status ${response.status}.`
}

function extractSseDataLines(rawEvent: string): string {
  return rawEvent
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
}

function processDedalusSseEvent(
  rawEvent: string,
  onToken: (token: string) => void,
  onFinishReason: (reason: StreamFinishReason) => void,
): { isDone: boolean } {
  const data = extractSseDataLines(rawEvent)
  const normalizedData = data.trim()
  if (!normalizedData) {
    return { isDone: false }
  }

  if (normalizedData === "[DONE]") {
    return { isDone: true }
  }

  let payload: unknown
  try {
    payload = JSON.parse(normalizedData)
  } catch (error) {
    return { isDone: false }
  }

  const errorMessage =
    payload &&
    typeof payload === "object" &&
    typeof (payload as DedalusErrorPayload).error?.message === "string"
      ? ((payload as DedalusErrorPayload).error!.message as string)
      : null

  if (errorMessage) {
    throw new Error(errorMessage)
  }

  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices)) {
    return { isDone: false }
  }

  for (const rawChoice of choices) {
    if (!rawChoice || typeof rawChoice !== "object") {
      continue
    }

    const choice = rawChoice as DedalusSseChoice
    const deltaToken = choice.delta?.content
    if (typeof deltaToken === "string" && deltaToken.length > 0) {
      onToken(deltaToken)
    }

    const finishReason = choice.finish_reason
    if (typeof finishReason === "string" && finishReason.length > 0) {
      onFinishReason(mapDedalusFinishReason(finishReason))
    }
  }

  return { isDone: false }
}

async function streamDedalusCompletion(
  messages: UIMessage[],
  abortSignal: AbortSignal,
  onToken: (token: string) => void,
  onFinishReason: (reason: StreamFinishReason) => void,
): Promise<void> {
  const dedalusApiKey = process.env.DEDALUS_API_KEY?.trim()
  if (!dedalusApiKey) {
    throw new Error("Missing DEDALUS_API_KEY.")
  }

  const model = process.env.DEDALUS_MODEL?.trim() || DEFAULT_DEDALUS_MODEL
  const response = await fetch(`${DAEDALUS_API_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${dedalusApiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model,
      messages: toDedalusMessages(messages),
      stream: true,
    }),
    signal: abortSignal,
  })

  if (!response.ok) {
    throw new Error(await readDedalusErrorResponse(response))
  }

  if (!response.body) {
    throw new Error("Dedalus stream response did not include a body.")
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }

    buffer += value.replace(/\r\n/g, "\n")

    let eventDelimiter = buffer.indexOf("\n\n")
    while (eventDelimiter !== -1) {
      const rawEvent = buffer.slice(0, eventDelimiter)
      buffer = buffer.slice(eventDelimiter + 2)
      const { isDone } = processDedalusSseEvent(rawEvent, onToken, onFinishReason)
      if (isDone) {
        return
      }

      eventDelimiter = buffer.indexOf("\n\n")
    }
  }

  const trailingEvent = buffer.trim()
  if (trailingEvent) {
    processDedalusSseEvent(trailingEvent, onToken, onFinishReason)
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === "string") {
    return error
  }

  return "Unknown error."
}

function toClientError(error: unknown): string {
  const message = getErrorMessage(error)

  if (message.includes("DEDALUS_API_KEY")) {
    return "Missing or invalid DEDALUS_API_KEY. Set a valid key and restart the server."
  }

  if (message.includes("Dedalus")) {
    return message
  }

  return "Chat request failed. Check server logs for details."
}

export async function POST(req: Request) {
  try {
    const dedalusApiKeyError = getDedalusApiKeyError()
    if (dedalusApiKeyError) {
      return Response.json({ error: dedalusApiKeyError }, { status: 500 })
    }

    const url = new URL(req.url)
    const requestedConversationId = url.searchParams.get("conversationId") ?? undefined
    const { messages }: { messages: UIMessage[] } = await req.json()
    const conversationId = await persistPromptSnapshot(requestedConversationId, messages)

    const stream = createUIMessageStream({
      originalMessages: messages,
      onError: (error) => {
        console.error("Dedalus stream failed.", error)
        return toClientError(error)
      },
      onFinish: async (event) => {
        const { responseMessage, isAborted } = event as {
          responseMessage?: UIMessage
          isAborted?: boolean
        }

        if (isAborted || responseMessage?.role !== "assistant") {
          return
        }

        const assistantText = extractTextFromUIMessage(responseMessage)
        if (!assistantText.trim()) {
          return
        }

        try {
          await appendAssistantCompletion(conversationId, assistantText)
        } catch (error) {
          console.error("Failed to append assistant completion to master copy.", error)
        }
      },
      execute: async ({ writer }) => {
        const textPartId = `text-${Date.now()}`
        let finishReason: StreamFinishReason = "stop"

        writer.write({ type: "start" })
        writer.write({ type: "text-start", id: textPartId })

        await streamDedalusCompletion(
          messages,
          req.signal,
          (token) => {
            writer.write({ type: "text-delta", id: textPartId, delta: token })
          },
          (nextFinishReason) => {
            finishReason = nextFinishReason
          },
        )

        writer.write({ type: "text-end", id: textPartId })
        writer.write({ type: "finish", finishReason })
      },
    })

    return createUIMessageStreamResponse({ stream })
  } catch (error) {
    console.error("Failed to process chat request.", error)
    return Response.json({ error: toClientError(error) }, { status: 500 })
  }
}
