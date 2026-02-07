import { spawn } from "node:child_process"
import path from "node:path"
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai"
import {
  appendAssistantCompletion,
  persistPromptSnapshot,
} from "@/lib/conversation-store"

export const maxDuration = 600

type StreamFinishReason = "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other"

interface AskQuestionEvent {
  type?: unknown
  token?: unknown
  text?: unknown
  message?: unknown
  finish_reason?: unknown
}

function sanitizeConversationId(value?: string | null): string | null {
  if (!value) return null
  const sanitized = value.trim().replace(/[^a-zA-Z0-9_-]/g, "")
  return sanitized.length > 0 ? sanitized : null
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

function getLatestUserMessage(messages: UIMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== "user") {
      continue
    }

    const text = extractTextFromUIMessage(message).trim()
    if (text) {
      return text
    }
  }

  return null
}

function normalizeFinishReason(rawReason: string): StreamFinishReason {
  switch (rawReason) {
    case "stop":
      return "stop"
    case "length":
      return "length"
    case "content_filter":
    case "content-filter":
      return "content-filter"
    case "tool_calls":
    case "tool-calls":
      return "tool-calls"
    case "error":
      return "error"
    default:
      return "other"
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
  return message || "Chat request failed."
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function emitTextAsDeltas(
  text: string,
  onToken: (token: string) => void,
  options?: { chunkSize?: number; tokenDelayMs?: number },
): Promise<void> {
  if (!text) return

  const chunkSize = options?.chunkSize ?? 24
  const tokenDelayMs = options?.tokenDelayMs ?? 0

  for (let index = 0; index < text.length; index += chunkSize) {
    const chunk = text.slice(index, index + chunkSize)
    onToken(chunk)

    if (tokenDelayMs > 0 && index + chunkSize < text.length) {
      await delay(tokenDelayMs)
    }
  }
}

async function streamFromAskQuestionScript(
  userMessage: string,
  conversationId: string,
  abortSignal: AbortSignal,
  onToken: (token: string) => void,
): Promise<{ assistantText: string; finishReason: StreamFinishReason; sawTokenEvent: boolean }> {
  const scriptPath = path.join(process.cwd(), "dedalus_stuff", "scripts", "askQuestion.py")
  const globalJsonPath = path.join(process.cwd(), "dedalus_stuff", "globalInfo.json")
  const conversationJsonPath = path.join(
    process.cwd(),
    "dedalus_stuff",
    "conversations",
    `${conversationId}.json`,
  )

  const args = [
    scriptPath,
    "--message",
    userMessage,
    "--conversation-id",
    conversationId,
    "--conversation-json-path",
    conversationJsonPath,
    "--global-json-path",
    globalJsonPath,
    "--stream",
  ]
  const modelOverride = process.env.DEDALUS_MODEL?.trim()
  if (modelOverride) {
    args.push("--model", modelOverride)
  }

  return await new Promise((resolve, reject) => {
    const child = spawn("python3", args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdoutBuffer = ""
    let stderrBuffer = ""
    let assistantText = ""
    let finishReason: StreamFinishReason = "stop"
    let reportedError: string | null = null
    let sawTokenEvent = false

    const onAbort = () => {
      child.kill("SIGTERM")
    }
    abortSignal.addEventListener("abort", onAbort, { once: true })

    const consumeEventLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed) {
        return
      }

      let event: AskQuestionEvent
      try {
        event = JSON.parse(trimmed) as AskQuestionEvent
      } catch (error) {
        return
      }

      if (event.type === "token" && typeof event.token === "string") {
        const hadTokenEvent = sawTokenEvent
        sawTokenEvent = true

        if (!hadTokenEvent && event.token.length > 64) {
          void emitTextAsDeltas(event.token, onToken, { chunkSize: 18 })
        } else {
          onToken(event.token)
        }
        assistantText += event.token
        return
      }

      if (event.type === "final") {
        if (typeof event.text === "string" && event.text.length > 0) {
          assistantText = event.text
        }
        if (typeof event.finish_reason === "string") {
          finishReason = normalizeFinishReason(event.finish_reason)
        }
        return
      }

      if (event.type === "error" && typeof event.message === "string" && event.message.trim()) {
        reportedError = event.message
      }
    }

    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk
      let newlineIndex = stdoutBuffer.indexOf("\n")

      while (newlineIndex !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex)
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
        consumeEventLine(line)
        newlineIndex = stdoutBuffer.indexOf("\n")
      }
    })

    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk: string) => {
      stderrBuffer += chunk
    })

    child.on("error", (error) => {
      abortSignal.removeEventListener("abort", onAbort)
      reject(error)
    })

    child.on("close", (code) => {
      abortSignal.removeEventListener("abort", onAbort)

      if (stdoutBuffer.trim()) {
        consumeEventLine(stdoutBuffer)
      }

      if (reportedError) {
        reject(new Error(reportedError))
        return
      }

      if (code !== 0) {
        const stderrText = stderrBuffer.trim()
        reject(
          new Error(
            stderrText || `askQuestion.py exited with code ${code ?? "unknown"}.`,
          ),
        )
        return
      }

      if (!assistantText.trim()) {
        reject(new Error("askQuestion.py returned an empty assistant response."))
        return
      }

      resolve({ assistantText, finishReason, sawTokenEvent })
    })
  })
}

export async function POST(req: Request) {
  try {
    const dedalusApiKey = process.env.DEDALUS_API_KEY?.trim()
    if (!dedalusApiKey || dedalusApiKey === "your_key_here") {
      return Response.json(
        { error: "Missing or invalid DEDALUS_API_KEY. Set a valid key and restart the server." },
        { status: 500 },
      )
    }

    const url = new URL(req.url)
    const requestBody = (await req.json()) as {
      messages?: UIMessage[]
      conversationId?: unknown
    }
    const messages = Array.isArray(requestBody.messages) ? requestBody.messages : []
    const requestedConversationIdFromBody =
      typeof requestBody.conversationId === "string"
        ? requestBody.conversationId
        : undefined
    const requestedConversationId =
      requestedConversationIdFromBody ?? url.searchParams.get("conversationId")

    const sanitizedRequestedConversationId = sanitizeConversationId(requestedConversationId)
    if (!sanitizedRequestedConversationId) {
      return Response.json(
        {
          error:
            "No active conversation selected. Create or select a conversation before sending a message.",
        },
        { status: 400 },
      )
    }

    let conversationId: string
    try {
      conversationId = await persistPromptSnapshot(sanitizedRequestedConversationId, messages, {
        allowCreate: false,
      })
    } catch (error) {
      const fileError = error as NodeJS.ErrnoException
      if (fileError.code === "ENOENT") {
        return Response.json(
          { error: `Conversation "${sanitizedRequestedConversationId}" was not found.` },
          { status: 404 },
        )
      }
      throw error
    }

    const latestUserMessage = getLatestUserMessage(messages)
    if (!latestUserMessage) {
      return Response.json({ error: "No user message found in chat payload." }, { status: 400 })
    }

    const stream = createUIMessageStream({
      originalMessages: messages,
      onError: (error) => {
        console.error("askQuestion.py stream failed.", error)
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
        const responseMessageId = `assistant-${Date.now()}`
        const textPartId = `text-${Date.now()}`
        let finishReason: StreamFinishReason = "stop"

        writer.write({ type: "start", messageId: responseMessageId })
        writer.write({ type: "text-start", id: textPartId })

        const pythonResult = await streamFromAskQuestionScript(
          latestUserMessage,
          conversationId,
          req.signal,
          (token) => {
            writer.write({ type: "text-delta", id: textPartId, delta: token })
          },
        )
        finishReason = pythonResult.finishReason
        if (!pythonResult.sawTokenEvent) {
          await emitTextAsDeltas(
            pythonResult.assistantText,
            (token) => {
              writer.write({ type: "text-delta", id: textPartId, delta: token })
            },
            {
              chunkSize: 18,
              tokenDelayMs: 14,
            },
          )
        }

        writer.write({ type: "text-end", id: textPartId })
        writer.write({ type: "finish", finishReason })
      },
    })

    return createUIMessageStreamResponse({
      stream,
      headers: {
        "Content-Encoding": "none",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    console.error("Failed to process chat request.", error)
    return Response.json({ error: toClientError(error) }, { status: 500 })
  }
}
