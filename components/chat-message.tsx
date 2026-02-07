"use client"

import type { UIMessage } from "ai"
import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

function BotIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  )
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m5 12 5 5L20 7" />
    </svg>
  )
}

function SpeakerIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 6a9 9 0 0 1 0 12" />
    </svg>
  )
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  )
}

async function copyText(value: string): Promise<boolean> {
  if (!value) {
    return false
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // fall through to execCommand fallback
  }

  if (typeof document === "undefined") {
    return false
  }

  const element = document.createElement("textarea")
  element.value = value
  element.setAttribute("readonly", "")
  element.style.position = "fixed"
  element.style.left = "-9999px"
  document.body.appendChild(element)
  element.select()

  try {
    const success = document.execCommand("copy")
    document.body.removeChild(element)
    return success
  } catch {
    document.body.removeChild(element)
    return false
  }
}

function toSpeakableText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, "").trim())
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/[_~]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

interface ChatMessageProps {
  message: UIMessage
  isStreaming?: boolean
  attachments?: Array<{
    id: string
    name: string
    size: number
    type: string
  }>
}

function formatAttachmentSize(bytes: number, type?: string): string {
  if (type === "text/uri-list" || bytes <= 0) {
    return "URL"
  }
  if (!Number.isFinite(bytes) || bytes < 1024) {
    return `${Math.max(0, Math.round(bytes || 0))} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  )
}

export function ChatMessage({ message, isStreaming, attachments = [] }: ChatMessageProps) {
  const isUser = message.role === "user"
  const isStreamingAssistant = Boolean(isStreaming && !isUser)
  const [copied, setCopied] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isHoveringMessage, setIsHoveringMessage] = useState(false)
  const copyTimerRef = useRef<number | null>(null)
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  const textFromParts = message.parts
    ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("") || ""
  const messageWithContent = message as UIMessage & { content?: unknown }
  const text =
    textFromParts ||
    (typeof messageWithContent.content === "string" ? messageWithContent.content : "")

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current)
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  const handleCopy = async () => {
    const copiedSuccessfully = await copyText(text)
    if (!copiedSuccessfully) {
      return
    }

    setCopied(true)
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current)
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopied(false)
    }, 1200)
  }

  const handleToggleReadAloud = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      return
    }

    const synth = window.speechSynthesis
    if (isSpeaking) {
      synth.cancel()
      speechUtteranceRef.current = null
      setIsSpeaking(false)
      return
    }

    const speakableText = toSpeakableText(text)
    if (!speakableText) {
      return
    }

    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(speakableText)
    speechUtteranceRef.current = utterance

    utterance.onend = () => {
      speechUtteranceRef.current = null
      setIsSpeaking(false)
    }
    utterance.onerror = () => {
      speechUtteranceRef.current = null
      setIsSpeaking(false)
    }

    setIsSpeaking(true)
    synth.speak(utterance)
  }

  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-4",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
          <BotIcon className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
      <div
        className={cn(
          "flex max-w-[75%] flex-col px-1 -mx-1 pb-8 -mb-8",
          isUser ? "items-end" : "items-start",
        )}
        onMouseEnter={() => setIsHoveringMessage(true)}
        onMouseLeave={() => setIsHoveringMessage(false)}
      >
        <div className="relative">
          <div
            className={cn(
              "rounded-2xl px-4 py-3 text-sm leading-relaxed",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-card text-card-foreground border border-border/60 shadow-sm",
            )}
          >
            {attachments.length > 0 ? (
              <div className="mb-2 space-y-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className={cn(
                      "flex max-w-full items-center gap-2 rounded-lg border px-2 py-1.5",
                      isUser
                        ? "border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground"
                        : "border-border/70 bg-muted/50 text-foreground",
                    )}
                  >
                    <FileIcon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                    <span className="truncate text-xs font-medium">{attachment.name}</span>
                    <span
                      className={cn(
                        "shrink-0 text-[10px]",
                        isUser ? "text-primary-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      {formatAttachmentSize(attachment.size, attachment.type)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="space-y-2 break-words [&_*]:max-w-full [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_img]:max-h-[420px] [&_img]:w-auto [&_img]:rounded-lg [&_img]:border [&_img]:border-border/60 [&_img]:shadow-sm">
              {isStreamingAssistant ? (
                <div className="whitespace-pre-wrap">{text || ""}</div>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {text || ""}
                </ReactMarkdown>
              )}
            </div>
            {isStreamingAssistant && (
              <span className="typing-cursor" />
            )}
          </div>

          {text.trim() && isHoveringMessage && !isStreamingAssistant ? (
            <div
              className={cn(
                "absolute top-[calc(100%+0.375rem)] z-10 inline-flex items-center gap-1",
                isUser ? "right-0" : "left-0",
              )}
            >
              {!isUser ? (
                <button
                  type="button"
                  onClick={(event) => {
                    handleToggleReadAloud()
                    event.currentTarget.blur()
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-background/55 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                  aria-label={isSpeaking ? "Stop reading response" : "Read response aloud"}
                  title={isSpeaking ? "Stop" : "Read aloud"}
                >
                  {isSpeaking ? <StopIcon className="h-3 w-3" /> : <SpeakerIcon className="h-3 w-3" />}
                  <span>{isSpeaking ? "Stop" : "Read"}</span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={(event) => {
                  void handleCopy()
                  event.currentTarget.blur()
                }}
                className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-background/55 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                aria-label={isUser ? "Copy user prompt" : "Copy assistant response"}
                title={copied ? "Copied" : "Copy"}
              >
                {copied ? <CheckIcon className="h-3 w-3" /> : <CopyIcon className="h-3 w-3" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-seafoam/40">
          <UserIcon className="h-4 w-4 text-pine" />
        </div>
      )}
    </div>
  )
}
