import { spawn } from "node:child_process"
import path from "node:path"
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai"
import {
  appendAssistantCompletion,
  persistPromptSnapshot,
} from "@/lib/conversation-store"

export const maxDuration = 60

type StreamFinishReason = "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other"

interface AskQuestionEvent {
  type?: unknown
  token?: unknown
  text?: unknown
  message?: unknown
  finish_reason?: unknown
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

async function streamFromAskQuestionScript(
  userMessage: string,
  abortSignal: AbortSignal,
  onToken: (token: string) => void,
): Promise<{ assistantText: string; finishReason: StreamFinishReason }> {
  const scriptPath = path.join(process.cwd(), "dedalus_stuff", "scripts", "askQuestion.py")
  const jsonPath =
    process.env.GLOBAL_CONVERSATION_JSON?.trim() ||
    path.join(process.cwd(), "dedalus_stuff", "test_chat_info.json")

  const args = [scriptPath, "--message", userMessage, "--json-path", jsonPath, "--stream"]
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
  try {
    const dedalusApiKey = process.env.DEDALUS_API_KEY?.trim()
    if (!dedalusApiKey || dedalusApiKey === "your_key_here") {
      return Response.json(
        { error: "Missing or invalid DEDALUS_API_KEY. Set a valid key and restart the server." },
        { status: 500 },
      )
    }

    const url = new URL(req.url)
    const requestedConversationId = url.searchParams.get("conversationId") ?? undefined
    const { messages }: { messages: UIMessage[] } = await req.json()
    const conversationId = await persistPromptSnapshot(requestedConversationId, messages)

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
        const textPartId = `text-${Date.now()}`
        let finishReason: StreamFinishReason = "stop"

        writer.write({ type: "start" })
        writer.write({ type: "text-start", id: textPartId })

        const pythonResult = await streamFromAskQuestionScript(
          latestUserMessage,
          req.signal,
          (token) => {
            writer.write({ type: "text-delta", id: textPartId, delta: token })
          },
        )
        finishReason = pythonResult.finishReason

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
