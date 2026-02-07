"use client"

import React, { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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

interface ChatInputProps {
  input: string
  onInputChange: (value: string) => void
  onSubmit: () => void
  isLoading: boolean
  model: string
  onModelChange: (value: string) => void
}

export function ChatInput({
  input,
  onInputChange,
  onSubmit,
  isLoading,
  model,
  onModelChange,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
    }
  }, [input])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !isLoading) {
        onSubmit()
      }
    }
  }

  return (
    <div className="border-t border-border/60 bg-card/80 p-4 backdrop-blur-md">
      <div className="mx-auto max-w-3xl">
        <div className="mb-2">
          <Select value={model} onValueChange={onModelChange} disabled={isLoading}>
            <SelectTrigger className="w-full rounded-full bg-muted/20 px-4 py-6 shadow-sm">
              <SelectValue placeholder="Choose a model" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              <SelectItem value="anthropic/claude-opus-4-5">Anthropic · Claude Opus 4.5</SelectItem>
              <SelectItem value="openai/gpt-4o-mini">OpenAI · GPT-4o mini</SelectItem>
              <SelectItem value="google/gemini-1.5-pro">Google · Gemini 1.5 Pro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end gap-3 rounded-2xl border border-border bg-background p-2 shadow-sm transition-shadow focus-within:border-primary/40 focus-within:shadow-md">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Verdant anything..."
            rows={1}
            disabled={isLoading}
            className="min-h-[40px] max-h-[160px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
            aria-label="Chat message input"
          />
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

        <p className="mt-2 text-center text-xs text-muted-foreground">
          Models may produce inaccurate information. Verify important facts.
        </p>
      </div>
    </div>
  )
}
