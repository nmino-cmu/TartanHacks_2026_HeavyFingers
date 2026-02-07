"use client"

import React from "react"

import { useRef, useEffect } from "react"
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
  input, onInputChange, onSubmit, 
  isLoading, model, onModelChange }: ChatInputProps) {
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
    <div className="border-t border-border/60 bg-card/80 backdrop-blur-md p-4">
      <div className="mx-auto max-w-3xl">
        {/* model selection dropdown */}
        {/* <div className="mb-2">
          <div className="relative">
            <select
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={isLoading}
              className="
                w-full appearance-none
                rounded-full
                border border-border/70
                bg-muted/20
                px-4 py-3 pr-11 text-sm
                shadow-sm
                transition
                hover:bg-muted/30 hover:border-border
                focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              <option value="openai/gpt-4o-mini">OpenAI · GPT-4o mini</option>
              <option value="anthropic/claude-3-5-sonnet">Anthropic · Claude 3.5 Sonnet</option>
              <option value="google/gemini-1.5-pro">Google · Gemini 1.5 Pro</option>
            </select>

            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-background/70 border border-border/60">
                <svg className="h-4 w-4 text-muted-foreground" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div> */}

        <div className="mb-2">
          <Select value={model} onValueChange={onModelChange} disabled={isLoading}>
            <SelectTrigger className="w-full rounded-full bg-muted/20 px-4 py-6 shadow-sm">
              <SelectValue placeholder="Choose a model" />
            </SelectTrigger>

            <SelectContent className="rounded-2xl">
              <SelectItem value="openai/gpt-4o-mini">OpenAI · GPT-4o mini</SelectItem>
              <SelectItem value="anthropic/claude-3-5-sonnet">Anthropic · Claude 3.5 Sonnet</SelectItem>
              <SelectItem value="google/gemini-1.5-pro">Google · Gemini 1.5 Pro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end gap-3 rounded-2xl border border-border bg-background p-2 
        shadow-sm transition-shadow focus-within:shadow-md focus-within:border-primary/40">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            rows={1}
            disabled={isLoading}
            className="min-h-[40px] max-h-[160px] flex-1 resize-none border-0 bg-transparent px-2 py-2 
            text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
            aria-label="Chat message input"
          />
          <Button
            onClick={onSubmit}
            disabled={!input.trim() || isLoading}
            size="sm"
            className="h-9 w-9 shrink-0 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 
            disabled:opacity-40"
            aria-label="Send message"
          >
            {isLoading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground 
              border-t-transparent" />
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
