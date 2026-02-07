"use client"

import { useState, useRef, useEffect } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { ChatMessage } from "@/components/chat-message"
import { ChatInput } from "@/components/chat-input"
import { WelcomeScreen } from "@/components/welcome-screen"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// Rough footprint estimation constants
// Assumes ~4 characters per token and ~0.5 milligrams CO2e per token
const CHARS_PER_TOKEN = 4
const KG_PER_TOKEN = 0.0000005

function formatFootprint(kg: number) {
  if (kg >= 0.001) {
    return `${kg.toFixed(3)} kg CO₂e`
  }
  return `${(kg * 1000).toFixed(2)} g CO₂e`
}

const transport = new DefaultChatTransport({ api: "/api/chat" })

export function ChatContainer() {
  const [input, setInput] = useState("")
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status } = useChat({
    transport,
  })

  const isLoading = status === "streaming" || status === "submitted"

  // Estimate carbon footprint based on total characters exchanged
  const charCount = messages.reduce((total, message) => {
    const chars = message.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text.length)
      .reduce((a, b) => a + b, 0) ?? 0

    return total + chars
  }, 0)
  const tokenEstimate = charCount / CHARS_PER_TOKEN
  const footprintKg = tokenEstimate * KG_PER_TOKEN

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return
    sendMessage({ text: input })
    setInput("")
  }

  const handleSuggestionClick = (prompt: string) => {
    sendMessage({ text: prompt })
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <button
        type="button"
        onClick={() => setDashboardOpen(true)}
        className="fixed right-3 top-3 z-50 flex items-center gap-2 rounded-full border border-border/70 bg-card/90 px-3 py-1.5 text-xs font-medium text-card-foreground shadow-sm backdrop-blur transition hover:border-primary/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
        aria-label="Open carbon footprint dashboard"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
          <span aria-hidden>🌿</span>
        </div>
        <span className="whitespace-nowrap" aria-label={`Estimated carbon footprint ${formatFootprint(footprintKg)}`}>
          Footprint: {formatFootprint(footprintKg)}
        </span>
      </button>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {messages.length === 0 ? (
          <WelcomeScreen onSuggestionClick={handleSuggestionClick} />
        ) : (
          <div className="mx-auto max-w-3xl py-6">
            {messages.map((message, index) => (
              <ChatMessage
                key={message.id}
                message={message}
                isStreaming={
                  isLoading &&
                  index === messages.length - 1 &&
                  message.role === "assistant"
                }
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      <ChatInput
        input={input}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />

      <Dialog open={dashboardOpen} onOpenChange={setDashboardOpen}>
        <DialogContent className="max-w-lg bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle>Carbon Dashboard</DialogTitle>
            <DialogDescription>
              Quick snapshot of the estimated footprint for this chat session.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border/70 bg-background p-4">
              <p className="text-xs text-muted-foreground">Session footprint</p>
              <p className="text-2xl font-semibold text-foreground mt-1">{formatFootprint(footprintKg)}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background p-4">
              <p className="text-xs text-muted-foreground">Estimated tokens</p>
              <p className="text-2xl font-semibold text-foreground mt-1">{Math.max(0, Math.round(tokenEstimate)).toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background p-4">
              <p className="text-xs text-muted-foreground">Characters processed</p>
              <p className="text-2xl font-semibold text-foreground mt-1">{charCount.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background p-4">
              <p className="text-xs text-muted-foreground">Messages exchanged</p>
              <p className="text-2xl font-semibold text-foreground mt-1">{messages.length}</p>
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-secondary/60 px-4 py-3 text-sm text-foreground">
            🌱 Tip: Shorter prompts and specific questions usually reduce token use and footprint.
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
