import { spawn } from "node:child_process"
import path from "node:path"
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai"
import {
  appendAssistantCompletion,
  getActiveConversationIdForUi,
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

const DEFAULT_MODEL = "anthropic/claude-opus-4-5"
const RELIABLE_FALLBACK_MODEL = "openai/gpt-4o-mini"
const ENABLE_MODEL_FAILOVER = process.env.CHAT_ENABLE_MODEL_FAILOVER?.trim() === "1"
const ENABLE_RECOVERY_LOGS = process.env.CHAT_RECOVERY_LOGS?.trim() === "1"
const ALLOWED_MODELS = new Set<string>([
  "anthropic/claude-opus-4-5",
  "openai/gpt-4o-mini",
  "google/gemini-1.5-pro",
])

const STREAM_DELTA_DELAY_MS = Math.max(
  0,
  Math.min(
    40,
    Number.parseInt(process.env.CHAT_STREAM_DELTA_DELAY_MS?.trim() || "0", 10) || 0,
  ),
)
const STREAM_TOKENS_PER_FLUSH = Math.max(
  1,
  Math.min(
    8,
    Number.parseInt(process.env.CHAT_STREAM_TOKENS_PER_FLUSH?.trim() || "2", 10) || 2,
  ),
)

function sanitizeConversationId(value?: string | null): string | null {
  if (!value) return null
  const sanitized = value.trim().replace(/[^a-zA-Z0-9_-]/g, "")
  return sanitized.length > 0 ? sanitized : null
}

function sanitizeRequestedModel(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return ALLOWED_MODELS.has(trimmed) ? trimmed : null
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
  const normalized = message.toLowerCase()
  if (message.includes("DEDALUS_API_KEY")) {
    return "Missing or invalid DEDALUS_API_KEY. Set a valid key and restart the server."
  }

  if (normalized.includes("dedalus request failed with status 500")) {
    return "The selected model is temporarily unavailable on Dedalus right now. Switch models and try again."
  }

  if (normalized.includes("dedalus request failed with status 403")) {
    return "Dedalus rejected the request (403). Verify API key permissions and allowed origins, then retry."
  }

  if (normalized.includes("cloudflare")) {
    return "Dedalus request was blocked upstream (Cloudflare). Please retry in a moment."
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

    if (conversationLockQueues.get(conversationId) === queue && queue.tail === nextTail) {
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
  selectedModel: string,
  useStreaming: boolean,
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
    "--no-update-global-info",
    useStreaming ? "--stream" : "--no-stream",
    "--model",
    selectedModel,
  ]

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
      } catch {
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
        reject(new Error(stderrText || `askQuestion.py exited with code ${code ?? "unknown"}.`))
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

function shouldRetryWithoutScriptStreaming(error: unknown): boolean {
  const normalized = getErrorMessage(error).toLowerCase()
  if (!normalized) {
    return false
  }

  return (
    normalized.includes("empty assistant response") ||
    normalized.includes("returned no completion choices")
  )
}

function isRetryableDedalusServerError(error: unknown): boolean {
  const normalized = getErrorMessage(error).toLowerCase()
  if (!normalized) {
    return false
  }

  return (
    normalized.includes("dedalus request failed with status 500") ||
    normalized.includes("failed to reach dedalus api")
  )
}

function getModelFailoverChain(preferredModel: string): string[] {
  if (!ENABLE_MODEL_FAILOVER) {
    if (ALLOWED_MODELS.has(preferredModel)) {
      return [preferredModel]
    }
    return [DEFAULT_MODEL]
  }

  const candidates = [preferredModel, RELIABLE_FALLBACK_MODEL, DEFAULT_MODEL]
  const deduped: string[] = []

  for (const candidate of candidates) {
    if (!ALLOWED_MODELS.has(candidate)) {
      continue
    }
    if (!deduped.includes(candidate)) {
      deduped.push(candidate)
    }
  }

  return deduped
}

function logRecovery(message: string, payload: Record<string, unknown>): void {
  if (!ENABLE_RECOVERY_LOGS) {
    return
  }
  console.warn(message, payload)
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
      model?: unknown
    }
    const messages = Array.isArray(requestBody.messages) ? requestBody.messages : []
    const requestedConversationIdFromBody =
      typeof requestBody.conversationId === "string" ? requestBody.conversationId : undefined
    const requestedConversationId =
      requestedConversationIdFromBody ?? url.searchParams.get("conversationId")

    let sanitizedRequestedConversationId = sanitizeConversationId(requestedConversationId)
    if (!sanitizedRequestedConversationId) {
      sanitizedRequestedConversationId = sanitizeConversationId(await getActiveConversationIdForUi())
    }

    if (!sanitizedRequestedConversationId) {
      return Response.json(
        {
          error:
            "No active conversation selected. Create or select a conversation before sending a message.",
        },
        { status: 400 },
      )
    }

    const requestedModel = sanitizeRequestedModel(requestBody.model)
    const selectedModel =
      requestedModel || process.env.DEDALUS_MODEL?.trim() || DEFAULT_MODEL

    releaseConversationLock = await acquireConversationLock(sanitizedRequestedConversationId)

    let conversationId: string
    try {
      conversationId = await persistPromptSnapshot(sanitizedRequestedConversationId, messages, {
        allowCreate: false,
        modelName: selectedModel,
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
            if (!streamClosed && pendingTokens.length < STREAM_TOKENS_PER_FLUSH) {
              await new Promise<void>((resolve) => {
                wakeDrain = resolve
              })
              continue
            }

            if (pendingTokens.length === 0) {
              continue
            }

            const chunkSize = streamClosed
              ? Math.min(STREAM_TOKENS_PER_FLUSH, pendingTokens.length)
              : STREAM_TOKENS_PER_FLUSH
            const delta = pendingTokens.splice(0, chunkSize).join("")
            if (!delta) {
              continue
            }

            writer.write({ type: "text-delta", id: textPartId, delta })
            if (STREAM_DELTA_DELAY_MS > 0 && pendingTokens.length > 0) {
              await waitFor(STREAM_DELTA_DELAY_MS, req.signal)
            }
          }
        }

        const drainPromise = drainTokens()
        let assistantText = ""
        let streamCompleted = false
        let modelUsedForResponse = selectedModel

        writer.write({ type: "start", messageId })
        writer.write({ type: "start-step" })
        writer.write({ type: "text-start", id: textPartId })
        try {
          let pythonResult: { assistantText: string; finishReason: StreamFinishReason } | null = null
          let lastModelError: unknown = null
          const modelCandidates = getModelFailoverChain(selectedModel)

          for (const candidateModel of modelCandidates) {
            const maxAttempts = ENABLE_MODEL_FAILOVER ? 2 : 1

            for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
              try {
                try {
                  pythonResult = await streamFromAskQuestionScript(
                    latestUserMessage,
                    conversationId,
                    req.signal,
                    (token) => {
                      sawTokenEvent = true
                      enqueueToken(token)
                    },
                    candidateModel,
                    true,
                  )
                } catch (error) {
                  if (!shouldRetryWithoutScriptStreaming(error)) {
                    throw error
                  }

                  logRecovery("Retrying askQuestion.py without upstream token streaming.", {
                    conversationId,
                    selectedModel: candidateModel,
                    reason: getErrorMessage(error),
                  })

                  pythonResult = await streamFromAskQuestionScript(
                    latestUserMessage,
                    conversationId,
                    req.signal,
                    (token) => {
                      sawTokenEvent = true
                      enqueueToken(token)
                    },
                    candidateModel,
                    false,
                  )
                }

                modelUsedForResponse = candidateModel
                break
              } catch (error) {
                lastModelError = error
                const retryable = isRetryableDedalusServerError(error)
                const hasAttemptsLeft = attempt < maxAttempts

                if (retryable && hasAttemptsLeft) {
                  await waitFor(300 * attempt, req.signal)
                  continue
                }

                break
              }
            }

            if (pythonResult) {
              break
            }

            if (
              lastModelError &&
              isRetryableDedalusServerError(lastModelError) &&
              candidateModel !== modelCandidates.at(-1)
            ) {
              logRecovery("Falling back to another model after Dedalus upstream failure.", {
                conversationId,
                failedModel: candidateModel,
                nextModel: modelCandidates[modelCandidates.indexOf(candidateModel) + 1],
                reason: getErrorMessage(lastModelError),
              })
            }
          }

          if (!pythonResult) {
            throw (lastModelError ?? new Error("Dedalus did not return a response."))
          }

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
              if (modelUsedForResponse !== selectedModel) {
                await persistPromptSnapshot(conversationId, messages, {
                  allowCreate: false,
                  modelName: modelUsedForResponse,
                })
              }
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
