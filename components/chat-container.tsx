"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { ChatMessage } from "@/components/chat-message"
import { ChatInput } from "@/components/chat-input"
import { WelcomeScreen } from "@/components/welcome-screen"

const CONVERSATION_STORAGE_KEY = "daedalus-conversation-id"

interface ConversationResponse {
  conversationId: string
  messages: UIMessage[]
}

export function ChatContainer() {
  const [input, setInput] = useState("")
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isHydratingConversation, setIsHydratingConversation] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: conversationId
          ? `/api/chat?conversationId=${encodeURIComponent(conversationId)}`
          : "/api/chat",
      }),
    [conversationId],
  )

  const { messages, sendMessage, setMessages, status, error, clearError } = useChat({
    transport,
  })

  const isLoading =
    isHydratingConversation || status === "streaming" || status === "submitted"

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    let isMounted = true

    const loadConversationFromMasterCopy = async () => {
      try {
        const savedConversationId = window.localStorage.getItem(
          CONVERSATION_STORAGE_KEY,
        )
        const query = savedConversationId
          ? `?conversationId=${encodeURIComponent(savedConversationId)}`
          : ""

        const response = await fetch(`/api/conversation${query}`, {
          method: "GET",
          cache: "no-store",
        })
        if (!response.ok) {
          throw new Error(
            `Conversation load failed with status ${response.status}`,
          )
        }

        const data: ConversationResponse = await response.json()
        if (!isMounted) return

        setConversationId(data.conversationId)
        window.localStorage.setItem(
          CONVERSATION_STORAGE_KEY,
          data.conversationId,
        )
        setMessages(data.messages)
      } catch (error) {
        console.error("Failed to hydrate conversation from master copy.", error)
      } finally {
        if (isMounted) {
          setIsHydratingConversation(false)
        }
      }
    }

    loadConversationFromMasterCopy()

    return () => {
      isMounted = false
    }
  }, [setMessages])

  const handleSubmit = () => {
    if (!input.trim() || isLoading || !conversationId) return
    sendMessage({ text: input })
    setInput("")
  }

  const handleSuggestionClick = (prompt: string) => {
    if (isLoading || !conversationId) return
    sendMessage({ text: prompt })
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
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
      {error ? (
        <div className="mx-auto mb-2 w-full max-w-3xl px-4">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-700">
            <p>{error.message || "Chat request failed."}</p>
            <button
              type="button"
              onClick={clearError}
              className="shrink-0 text-xs font-medium underline underline-offset-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <ChatInput
        input={input}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </div>
  )
}
