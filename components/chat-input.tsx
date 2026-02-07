"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"

export interface PendingAttachment {
  id: string
  name: string
  size: number
  type: string
  kind?: "file" | "url"
}

type ModelProvider = "anthropic" | "openai" | "google"
type ModelTier = "large" | "medium" | "small"

interface ChatModelOption {
  value: string
  provider: ModelProvider
  tier: ModelTier
  name: string
}

interface ImageModelOption {
  value: string
  label: string
}

const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  {
    value: "anthropic/claude-opus-4-5",
    provider: "anthropic",
    tier: "large",
    name: "Claude Opus 4.5",
  },
  {
    value: "anthropic/claude-sonnet-4-5",
    provider: "anthropic",
    tier: "medium",
    name: "Claude Sonnet 4.5",
  },
  {
    value: "anthropic/claude-haiku-4-5",
    provider: "anthropic",
    tier: "small",
    name: "Claude Haiku 4.5",
  },
  { value: "openai/gpt-5", provider: "openai", tier: "large", name: "GPT-5" },
  { value: "openai/gpt-5-mini", provider: "openai", tier: "medium", name: "GPT-5 Mini" },
  { value: "openai/gpt-5-nano", provider: "openai", tier: "small", name: "GPT-5 Nano" },
  {
    value: "google/gemini-2.5-pro",
    provider: "google",
    tier: "large",
    name: "Gemini 2.5 Pro",
  },
  {
    value: "google/gemini-2.5-flash",
    provider: "google",
    tier: "medium",
    name: "Gemini 2.5 Flash",
  },
  {
    value: "google/gemini-2.5-flash-lite",
    provider: "google",
    tier: "small",
    name: "Gemini 2.5 Flash Lite",
  },
]

const IMAGE_MODEL_OPTIONS: ImageModelOption[] = [
  { value: "openai/gpt-image-1", label: "OpenAI · GPT Image 1" },
  { value: "openai/dall-e-3", label: "OpenAI · DALL·E 3" },
]

const PROVIDERS: ModelProvider[] = ["anthropic", "openai", "google"]
const TIERS: ModelTier[] = ["large", "medium", "small"]

const PROVIDER_LABEL: Record<ModelProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
}

const TIER_LABEL: Record<ModelTier, string> = {
  large: "Large",
  medium: "Medium",
  small: "Small",
}

function SendIcon({ className }: { className?: string }) {
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
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
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
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function LinkIcon({ className }: { className?: string }) {
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
      <path d="M10 13a5 5 0 0 0 7.54.54l2.92-2.92a5 5 0 0 0-7.07-7.07L11 5" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-2.92 2.92a5 5 0 0 0 7.07 7.07L13 19" />
    </svg>
  )
}

function GlobeIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15 15 0 0 1 0 20" />
      <path d="M12 2a15 15 0 0 0 0 20" />
    </svg>
  )
}

function MicIcon({ className }: { className?: string }) {
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
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  )
}

function ImageIcon({ className }: { className?: string }) {
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
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m21 16-5-5L7 20" />
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
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
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
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
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

function getChatModelDisplayLabel(model: string): string {
  const match = CHAT_MODEL_OPTIONS.find((entry) => entry.value === model)
  if (!match) {
    return "Choose model"
  }
  return `${PROVIDER_LABEL[match.provider]} · ${match.name}`
}

function getImageModelDisplayLabel(model: string): string {
  return IMAGE_MODEL_OPTIONS.find((entry) => entry.value === model)?.label ?? "Image model"
}

interface ChatInputProps {
  input: string
  onInputChange: (value: string) => void
  onSubmit: () => void
  isLoading: boolean
  model: string
  onModelChange: (value: string) => void
  imageGenerationEnabled: boolean
  onToggleImageGeneration: () => void
  imageModel: string
  onImageModelChange: (value: string) => void
  webSearchEnabled: boolean
  onToggleWebSearch: () => void
  attachments: PendingAttachment[]
  onAddFiles: (files: FileList | null) => void
  onAddAttachmentUrl: (url: string) => void
  onRemoveAttachment: (attachmentId: string) => void
}

export function ChatInput({
  input,
  onInputChange,
  onSubmit,
  isLoading,
  model,
  onModelChange,
  imageGenerationEnabled,
  onToggleImageGeneration,
  imageModel,
  onImageModelChange,
  webSearchEnabled,
  onToggleWebSearch,
  attachments,
  onAddFiles,
  onAddAttachmentUrl,
  onRemoveAttachment,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const latestInputRef = useRef(input)
  const recognitionRef = useRef<any>(null)
  const lastSpeechTranscriptRef = useRef("")
  const [isListening, setIsListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [urlInputOpen, setUrlInputOpen] = useState(false)
  const [urlDraft, setUrlDraft] = useState("")

  const chatModelsByProvider = useMemo(() => {
    return PROVIDERS.map((provider) => {
      const providerModels = CHAT_MODEL_OPTIONS.filter((entry) => entry.provider === provider)
      return { provider, providerModels }
    })
  }, [])

  const activeModelLabel = imageGenerationEnabled
    ? getImageModelDisplayLabel(imageModel)
    : getChatModelDisplayLabel(model)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
    }
  }, [input])

  useEffect(() => {
    latestInputRef.current = input
  }, [input])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const speechWindow = window as unknown as {
      SpeechRecognition?: new () => any
      webkitSpeechRecognition?: new () => any
    }
    const SpeechRecognitionCtor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition

    if (!SpeechRecognitionCtor) {
      setSpeechSupported(false)
      return
    }

    setSpeechSupported(true)
    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = "en-US"

    recognition.onstart = () => {
      setIsListening(true)
      lastSpeechTranscriptRef.current = ""
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.onresult = (event: any) => {
      const resultIndex = typeof event?.resultIndex === "number" ? event.resultIndex : 0
      const result = event?.results?.[resultIndex]
      if (!result || result.isFinal === false) {
        return
      }

      const transcript = typeof result?.[0]?.transcript === "string" ? result[0].transcript.trim() : ""
      if (!transcript) {
        return
      }

      if (transcript === lastSpeechTranscriptRef.current) {
        return
      }
      lastSpeechTranscriptRef.current = transcript

      const existingInput = latestInputRef.current
      const prefix = existingInput.trim().length > 0 ? `${existingInput.trimEnd()} ` : ""
      onInputChange(`${prefix}${transcript}`)
    }

    recognition.onerror = () => {
      setIsListening(false)
      toast({
        title: "Microphone input failed",
        description: "Please check browser mic permissions and try again.",
        variant: "destructive",
      })
    }

    recognitionRef.current = recognition

    return () => {
      try {
        recognition.stop()
      } catch {
        // no-op
      }
      recognitionRef.current = null
    }
  }, [onInputChange])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      if (input.trim() && !isLoading) {
        onSubmit()
      }
    }
  }

  const handleToggleSpeech = () => {
    const recognition = recognitionRef.current
    if (!recognition || isLoading) {
      return
    }

    try {
      if (isListening) {
        recognition.stop()
      } else {
        recognition.start()
      }
    } catch {
      setIsListening(false)
    }
  }

  const handleAddUrl = () => {
    const normalized = urlDraft.trim()
    if (!normalized) {
      return
    }

    try {
      const parsed = new URL(normalized)
      if (parsed.protocol !== "https:") {
        throw new Error("Only https URLs are supported.")
      }
    } catch {
      toast({
        title: "Invalid URL",
        description: "Enter a valid https URL for OCR parsing.",
        variant: "destructive",
      })
      return
    }

    onAddAttachmentUrl(normalized)
    setUrlDraft("")
    setUrlInputOpen(false)
  }

  return (
    <div className="border-t border-border/60 bg-card/80 p-4 backdrop-blur-md">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-border bg-background p-2 shadow-sm transition-shadow focus-within:border-primary/40 focus-within:shadow-md">
          {attachments.length > 0 ? (
            <div className="mb-2 flex flex-wrap items-center gap-2 px-1 pb-1">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-2 py-1 text-xs text-foreground"
                >
                  <span className="truncate font-medium">{attachment.name}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatAttachmentSize(attachment.size, attachment.type)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(attachment.id)}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${attachment.name}`}
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                imageGenerationEnabled
                  ? "Describe the image you want to generate..."
                  : "Ask Verdant anything..."
              }
              rows={1}
              disabled={isLoading}
              className="min-h-[40px] max-h-[160px] w-full resize-none border-0 bg-transparent px-1 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
              aria-label="Chat message input"
            />

            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept=".pdf,application/pdf,image/png,image/jpeg,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={(event) => {
                    onAddFiles(event.target.files)
                    event.currentTarget.value = ""
                  }}
                />

                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  size="sm"
                  variant="ghost"
                  className="h-9 w-9 shrink-0 rounded-full border border-border/60 bg-muted/20 text-foreground hover:bg-muted/40 disabled:opacity-40"
                  aria-label="Add files"
                  title="Add files"
                >
                  <PlusIcon className="h-4 w-4" />
                </Button>

                <Button
                  onClick={() => setUrlInputOpen((current) => !current)}
                  disabled={isLoading}
                  size="sm"
                  variant="ghost"
                  className="h-9 w-9 shrink-0 rounded-full border border-border/60 bg-muted/20 text-foreground hover:bg-muted/40 disabled:opacity-40"
                  aria-label="Add URL"
                  title="Add URL"
                >
                  <LinkIcon className="h-4 w-4" />
                </Button>

                <Button
                  onClick={onToggleWebSearch}
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "h-9 w-9 shrink-0 rounded-full border border-border/60 bg-muted/20 text-foreground hover:bg-muted/40",
                    webSearchEnabled ? "border-primary/50 bg-primary/10 text-primary" : "",
                    isLoading ? "opacity-40" : "",
                  )}
                  aria-label={webSearchEnabled ? "Disable web search" : "Enable web search"}
                  title={webSearchEnabled ? "Web search on" : "Web search off"}
                >
                  <GlobeIcon className="h-4 w-4" />
                </Button>

                <Button
                  onClick={onToggleImageGeneration}
                  disabled={isLoading}
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "h-9 w-9 shrink-0 rounded-full border border-border/60 bg-muted/20 text-foreground hover:bg-muted/40 disabled:opacity-40",
                    imageGenerationEnabled ? "border-primary/60 bg-primary/10 text-primary" : "",
                  )}
                  aria-label={imageGenerationEnabled ? "Switch to text models" : "Switch to image models"}
                  title={imageGenerationEnabled ? "Image mode" : "Text mode"}
                >
                  <ImageIcon className="h-4 w-4" />
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={isLoading}
                      className="inline-flex h-9 max-w-[230px] items-center gap-2 rounded-full border border-border/60 bg-muted/20 px-3 text-xs text-foreground shadow-none transition-colors hover:bg-muted/40 disabled:opacity-40"
                      aria-label={imageGenerationEnabled ? "Choose image model" : "Choose text model"}
                    >
                      <span className="truncate">{activeModelLabel}</span>
                      <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="top"
                    align="start"
                    className="w-[300px] rounded-xl border-border/70 bg-background/95"
                  >
                    {imageGenerationEnabled ? (
                      <>
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Image Models</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {IMAGE_MODEL_OPTIONS.map((entry) => (
                          <DropdownMenuItem
                            key={entry.value}
                            onSelect={() => onImageModelChange(entry.value)}
                            className="text-sm"
                          >
                            <span>{entry.label}</span>
                            {imageModel === entry.value ? <span className="ml-auto text-xs text-primary">Selected</span> : null}
                          </DropdownMenuItem>
                        ))}
                      </>
                    ) : (
                      <>
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Text Models</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {chatModelsByProvider.map(({ provider, providerModels }) => (
                          <DropdownMenuSub key={provider}>
                            <DropdownMenuSubTrigger className="text-sm">
                              {PROVIDER_LABEL[provider]}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="w-[280px] rounded-xl border-border/70 bg-background/95">
                              {TIERS.map((tier) => {
                                const tierEntries = providerModels.filter((entry) => entry.tier === tier)
                                if (tierEntries.length === 0) {
                                  return null
                                }

                                return (
                                  <div key={tier}>
                                    <DropdownMenuLabel className="py-1 text-[11px] font-medium text-muted-foreground">
                                      {TIER_LABEL[tier]}
                                    </DropdownMenuLabel>
                                    {tierEntries.map((entry) => (
                                      <DropdownMenuItem
                                        key={entry.value}
                                        onSelect={() => onModelChange(entry.value)}
                                        className="text-sm"
                                      >
                                        <span>{entry.name}</span>
                                        {model === entry.value ? (
                                          <span className="ml-auto text-xs text-primary">Selected</span>
                                        ) : null}
                                      </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                  </div>
                                )
                              })}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        ))}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleToggleSpeech}
                  disabled={!speechSupported || isLoading}
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "h-9 w-9 shrink-0 rounded-xl border border-border/60 bg-muted/20 text-foreground hover:bg-muted/40 disabled:opacity-40",
                    isListening ? "border-primary/50 text-primary" : "",
                  )}
                  aria-label={isListening ? "Stop speech input" : "Start speech input"}
                  title={
                    speechSupported ? (isListening ? "Stop listening" : "Speak") : "Speech input not supported"
                  }
                >
                  {isListening ? <StopIcon className="h-4 w-4" /> : <MicIcon className="h-4 w-4" />}
                </Button>

                <Button
                  onClick={onSubmit}
                  disabled={!input.trim() || isLoading}
                  size="sm"
                  className="h-9 w-9 shrink-0 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                  aria-label="Send message"
                >
                  {isLoading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  ) : (
                    <SendIcon className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {urlInputOpen ? (
              <div className="mt-1 flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-2 py-1.5">
                <input
                  value={urlDraft}
                  onChange={(event) => setUrlDraft(event.target.value)}
                  placeholder="https://example.com/document.pdf"
                  className="h-7 w-full border-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                  aria-label="Document URL"
                />
                <Button
                  onClick={handleAddUrl}
                  disabled={!urlDraft.trim() || isLoading}
                  size="sm"
                  variant="ghost"
                  className="h-7 rounded-lg border border-border/60 px-2 text-xs"
                >
                  Add
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <p className="mt-2 text-center text-xs text-muted-foreground">
          Models may produce inaccurate information. Verify important facts.
        </p>
      </div>
    </div>
  )
}
