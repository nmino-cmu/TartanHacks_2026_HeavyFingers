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

interface ConversationLockQueue {
  tail: Promise<void>
}

const conversationLockQueues = new Map<string, ConversationLockQueue>()

const STREAM_DELTA_DELAY_MS = Math.max(
  0,
  Math.min(
    20,
    Number.parseInt(process.env.CHAT_STREAM_DELTA_DELAY_MS?.trim() || "4", 10) || 0,
  ),
)

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

async function acquireConversationLock(conversationId: string): Promise<() => void> {
  const queue = conversationLockQueues.get(conversationId) ?? { tail: Promise.resolve() }
  const previousTail = queue.tail

  let releaseGate!: () => void
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve
  })

  const nextTail = previousTail.then(
    () => gate,
    () => gate,
  )

  queue.tail = nextTail
  conversationLockQueues.set(conversationId, queue)

  await previousTail.catch(() => undefined)

  let released = false
  return () => {
    if (released) {
      return
    }
    released = true
    releaseGate()

    if (
      conversationLockQueues.get(conversationId) === queue &&
      queue.tail === nextTail
    ) {
      conversationLockQueues.delete(conversationId)
    }
  }
}

async function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) {
    return
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
      resolve()
    }

    signal.addEventListener("abort", onAbort, { once: true })
  })
}

async function streamFromAskQuestionScript(
  userMessage: string,
  conversationId: string,
  abortSignal: AbortSignal,
  onToken: (token: string) => void,
): Promise<{ assistantText: string; finishReason: StreamFinishReason }> {
  const scriptPath = path.join(process.cwd(), "dedalus_stuff", "scripts", "askQuestion.py")
  const globalJsonPath = path.join(process.cwd(), "dedalus_stuff", "globalInfo.json")
  const conversationJsonPath = path.join(
    process.cwd(),
    "dedalus_stuff",
    "conversations",
    `${conversationId}.json`,
  )

  const args = [
    "-u",
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
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdoutBuffer = ""
    let stderrBuffer = ""
    let assistantText = ""
    let finishReason: StreamFinishReason = "stop"
    let reportedError: string | null = null

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
        onToken(event.token)
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

      resolve({ assistantText, finishReason })
    })
  })
}

export async function POST(req: Request) {
  let releaseConversationLock: (() => void) | null = null

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

    releaseConversationLock = await acquireConversationLock(
      sanitizedRequestedConversationId,
    )

    let conversationId: string
    try {
      conversationId = await persistPromptSnapshot(sanitizedRequestedConversationId, messages, {
        allowCreate: false,
      })
    } catch (error) {
      releaseConversationLock()
      releaseConversationLock = null

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
      if (releaseConversationLock) {
        releaseConversationLock()
        releaseConversationLock = null
      }
      return Response.json({ error: "No user message found in chat payload." }, { status: 400 })
    }

    const stream = createUIMessageStream({
      originalMessages: messages,
      onError: (error) => {
        console.error("askQuestion.py stream failed.", error)
        return toClientError(error)
      },
      execute: async ({ writer }) => {
        const textPartId = `text-${Date.now()}`
        const messageId = `assistant-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
        let finishReason: StreamFinishReason = "stop"
        let sawTokenEvent = false
        let streamClosed = false
        let wakeDrain: (() => void) | null = null
        const pendingTokens: string[] = []

        const notifyDrain = () => {
          if (!wakeDrain) {
            return
          }

          const resolve = wakeDrain
          wakeDrain = null
          resolve()
        }

        const enqueueToken = (token: string) => {
          if (!token) {
            return
          }
          pendingTokens.push(token)
          notifyDrain()
        }

        const drainTokens = async () => {
          while (!streamClosed || pendingTokens.length > 0) {
            if (pendingTokens.length === 0) {
              await new Promise<void>((resolve) => {
                wakeDrain = resolve
              })
              continue
            }

            const nextToken = pendingTokens.shift() || ""
            if (!nextToken) {
              continue
            }

            for (const character of Array.from(nextToken)) {
              writer.write({ type: "text-delta", id: textPartId, delta: character })
              await waitFor(STREAM_DELTA_DELAY_MS, req.signal)
            }
          }
        }

        const drainPromise = drainTokens()
        let assistantText = ""
        let streamCompleted = false

        writer.write({ type: "start", messageId })
        writer.write({ type: "start-step" })
        writer.write({ type: "text-start", id: textPartId })
        try {
          const pythonResult = await streamFromAskQuestionScript(
            latestUserMessage,
            conversationId,
            req.signal,
            (token) => {
              sawTokenEvent = true
              enqueueToken(token)
            },
          )
          finishReason = pythonResult.finishReason
          assistantText = pythonResult.assistantText

          if (!sawTokenEvent && pythonResult.assistantText) {
            enqueueToken(pythonResult.assistantText)
          }
          streamCompleted = true
        } finally {
          streamClosed = true
          notifyDrain()
          await drainPromise

          if (streamCompleted && assistantText.trim()) {
            try {
              await appendAssistantCompletion(conversationId, assistantText)
            } catch (error) {
              console.error("Failed to append assistant completion to master copy.", error)
            }
          }

          if (releaseConversationLock) {
            releaseConversationLock()
            releaseConversationLock = null
          }
        }

        if (streamCompleted) {
          writer.write({ type: "text-end", id: textPartId })
          writer.write({ type: "finish-step" })
          writer.write({ type: "finish", finishReason })
        }
      },
    })

    return createUIMessageStreamResponse({ stream })
  } catch (error) {
    if (releaseConversationLock) {
      releaseConversationLock()
      releaseConversationLock = null
    }

    console.error("Failed to process chat request.", error)
    return Response.json({ error: toClientError(error) }, { status: 500 })
  }
}
