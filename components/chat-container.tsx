"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { ChatMessage } from "@/components/chat-message"
import { ChatInput } from "@/components/chat-input"
import { WelcomeScreen } from "@/components/welcome-screen"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"

const CONVERSATION_STORAGE_KEY = "daedalus-conversation-id"

interface ConversationResponse {
  conversationId: string
  messages: UIMessage[]
}

interface ConversationSummary {
  conversationId: string
  title: string
  updatedAt: string
  messageCount: number
}

interface ConversationsResponse {
  conversations: ConversationSummary[]
}

function MenuIcon({ className }: { className?: string }) {
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
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
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

function PencilIcon({ className }: { className?: string }) {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
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
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
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

function formatConversationDate(isoValue: string): string {
  const parsed = new Date(isoValue)
  if (Number.isNaN(parsed.getTime())) {
    return "unknown"
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

export function ChatContainer() {
  const [input, setInput] = useState("")
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [isHydratingConversation, setIsHydratingConversation] = useState(true)
  const [isMutatingConversation, setIsMutatingConversation] = useState(false)
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null)
  const [editingConversationName, setEditingConversationName] = useState("")
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
      }),
    [],
  )

  const { messages, sendMessage, setMessages, status, error, clearError } = useChat({
    transport,
  })

  const isLoading =
    isHydratingConversation ||
    isMutatingConversation ||
    status === "streaming" ||
    status === "submitted"

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.conversationId === conversationId),
    [conversations, conversationId],
  )

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (!isMobile) {
      setIsSidebarOpen(true)
    }
  }, [isMobile])

  const refreshConversations = useCallback(async () => {
    try {
      const response = await fetch("/api/conversations", {
        method: "GET",
        cache: "no-store",
      })

      if (!response.ok) {
        throw new Error(`Conversation list failed with status ${response.status}`)
      }

      const data: ConversationsResponse = await response.json()
      setConversations(data.conversations)
    } catch (error) {
      console.error("Failed to load conversation list.", error)
    }
  }, [])

  const loadConversation = useCallback(
    async (targetConversationId?: string | null): Promise<ConversationResponse> => {
      const query = targetConversationId
        ? `?conversationId=${encodeURIComponent(targetConversationId)}`
        : ""

      const response = await fetch(`/api/conversation${query}`, {
        method: "GET",
        cache: "no-store",
      })

      if (!response.ok) {
        throw new Error(`Conversation load failed with status ${response.status}`)
      }

      const data: ConversationResponse = await response.json()
      setConversationId(data.conversationId)
      window.localStorage.setItem(CONVERSATION_STORAGE_KEY, data.conversationId)
      setMessages(data.messages)
      return data
    },
    [setMessages],
  )

  useEffect(() => {
    let isMounted = true

    const hydrateConversation = async () => {
      try {
        const savedConversationId = window.localStorage.getItem(
          CONVERSATION_STORAGE_KEY,
        )
        const data = await loadConversation(savedConversationId)
        if (!isMounted) return

        await refreshConversations()
        if (!isMounted) return

        setConversationId(data.conversationId)
      } catch (error) {
        console.error("Failed to hydrate conversation from master copy.", error)
      } finally {
        if (isMounted) {
          setIsHydratingConversation(false)
        }
      }
    }

    hydrateConversation()

    return () => {
      isMounted = false
    }
  }, [loadConversation, refreshConversations])

  useEffect(() => {
    if (status === "ready") {
      void refreshConversations()
    }
  }, [status, refreshConversations])

  const handleSubmit = () => {
    if (!input.trim() || isLoading || !conversationId) return
    sendMessage(
      { text: input },
      {
        body: { conversationId },
      },
    )
    setInput("")
  }

  const handleSuggestionClick = (prompt: string) => {
    if (isLoading || !conversationId) return
    sendMessage(
      { text: prompt },
      {
        body: { conversationId },
      },
    )
  }

  const handleSelectConversation = async (targetConversationId: string) => {
    if (!targetConversationId || targetConversationId === conversationId || isLoading) {
      return
    }

    setEditingConversationId(null)
    setEditingConversationName("")
    setIsHydratingConversation(true)
    try {
      await loadConversation(targetConversationId)
      if (isMobile) {
        setIsSidebarOpen(false)
      }
    } catch (error) {
      console.error("Failed to switch conversations.", error)
    } finally {
      setIsHydratingConversation(false)
    }
  }

  const handleCreateConversation = async () => {
    if (isLoading) return

    setEditingConversationId(null)
    setEditingConversationName("")
    setIsHydratingConversation(true)
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        cache: "no-store",
      })

      if (!response.ok) {
        throw new Error(`Conversation create failed with status ${response.status}`)
      }

      const data: ConversationResponse = await response.json()
      setConversationId(data.conversationId)
      window.localStorage.setItem(CONVERSATION_STORAGE_KEY, data.conversationId)
      setMessages(data.messages)
      setInput("")
      await refreshConversations()

      if (isMobile) {
        setIsSidebarOpen(false)
      }
    } catch (error) {
      console.error("Failed to create a new conversation.", error)
    } finally {
      setIsHydratingConversation(false)
    }
  }

  const handleStartRenameConversation = (conversation: ConversationSummary) => {
    if (isLoading) return
    setEditingConversationId(conversation.conversationId)
    setEditingConversationName(conversation.title || "")
  }

  const handleCancelRenameConversation = () => {
    setEditingConversationId(null)
    setEditingConversationName("")
  }

  const handleSaveRenameConversation = async () => {
    if (isLoading || !editingConversationId) return

    const nextName = editingConversationName.trim()
    if (!nextName) return

    setIsMutatingConversation(true)
    try {
      const response = await fetch("/api/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          conversationId: editingConversationId,
          name: nextName,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || `Conversation rename failed with status ${response.status}`)
      }

      await refreshConversations()
      handleCancelRenameConversation()
    } catch (error) {
      console.error("Failed to rename conversation.", error)
      const message = error instanceof Error ? error.message : "Failed to rename conversation."
      window.alert(message)
    } finally {
      setIsMutatingConversation(false)
    }
  }

  const handleDeleteConversation = async (targetConversationId: string) => {
    if (isLoading) return

    const targetConversation = conversations.find(
      (conversation) => conversation.conversationId === targetConversationId,
    )
    const targetLabel = targetConversation?.title || targetConversationId

    if (!window.confirm(`Delete "${targetLabel}"? This cannot be undone.`)) {
      return
    }

    setIsMutatingConversation(true)
    try {
      const query = new URLSearchParams({
        conversationId: targetConversationId,
      })
      if (conversationId) {
        query.set("activeConversationId", conversationId)
      }

      const response = await fetch(`/api/conversations?${query.toString()}`, {
        method: "DELETE",
        cache: "no-store",
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || `Conversation delete failed with status ${response.status}`)
      }

      const data: ConversationResponse = await response.json()
      const deletedActiveConversation = targetConversationId === conversationId

      if (deletedActiveConversation) {
        setConversationId(data.conversationId)
        window.localStorage.setItem(CONVERSATION_STORAGE_KEY, data.conversationId)
        setMessages(data.messages)
      }

      if (editingConversationId === targetConversationId) {
        handleCancelRenameConversation()
      }

      await refreshConversations()
    } catch (error) {
      console.error("Failed to delete conversation.", error)
      const message = error instanceof Error ? error.message : "Failed to delete conversation."
      window.alert(message)
    } finally {
      setIsMutatingConversation(false)
    }
  }

  return (
    <div className="relative flex flex-1 overflow-hidden">
      {isMobile && isSidebarOpen ? (
        <button
          type="button"
          className="absolute inset-0 z-30 bg-black/20"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Close conversation sidebar"
        />
      ) : null}

      <aside
        className={cn(
          "absolute inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border/70 bg-card/95 backdrop-blur-md transition-transform duration-300",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-border/70 px-3 py-3">
          <p className="text-sm font-semibold text-foreground">Conversations</p>
          <button
            type="button"
            onClick={handleCreateConversation}
            disabled={isLoading}
            className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            New
          </button>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-2">
          {conversations.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No conversations yet.
            </p>
          ) : (
            conversations.map((conversation) => {
              const isActive = conversation.conversationId === conversationId
              const isEditing = editingConversationId === conversation.conversationId

              return (
                <div key={conversation.conversationId} className="mb-1">
                  {isEditing ? (
                    <div className="rounded-lg border border-primary/40 bg-primary/10 p-2">
                      <input
                        type="text"
                        value={editingConversationName}
                        onChange={(event) => setEditingConversationName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault()
                            void handleSaveRenameConversation()
                          }
                          if (event.key === "Escape") {
                            event.preventDefault()
                            handleCancelRenameConversation()
                          }
                        }}
                        autoFocus
                        disabled={isLoading}
                        className="w-full rounded-md border border-border/70 bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                      />
                      <div className="mt-2 flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={handleCancelRenameConversation}
                          disabled={isLoading}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                          aria-label="Cancel rename conversation"
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSaveRenameConversation()}
                          disabled={isLoading || !editingConversationName.trim()}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-background text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                          aria-label="Save conversation name"
                        >
                          <CheckIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "group relative rounded-lg border transition-colors",
                        isActive
                          ? "border-primary/50 bg-primary/10"
                          : "border-transparent bg-transparent hover:border-border/70 hover:bg-muted/70",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => void handleSelectConversation(conversation.conversationId)}
                        className="w-full rounded-lg px-3 py-2 pr-16 text-left"
                      >
                        <p className="truncate text-sm font-medium text-foreground">
                          {conversation.title || conversation.conversationId}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {conversation.messageCount} messages • {formatConversationDate(conversation.updatedAt)}
                        </p>
                      </button>

                      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-90 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => handleStartRenameConversation(conversation)}
                          disabled={isLoading}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-background/90 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                          aria-label="Rename conversation"
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteConversation(conversation.conversationId)}
                          disabled={isLoading}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-background/90 text-muted-foreground transition-colors hover:text-red-600 disabled:opacity-50"
                          aria-label="Delete conversation"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </aside>

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col overflow-hidden transition-[margin-left] duration-300",
          isSidebarOpen ? "md:ml-72" : "md:ml-0",
        )}
      >
        <div className="flex items-center gap-3 border-b border-border/60 bg-card/70 px-3 py-2 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/70 bg-background text-foreground transition-colors hover:bg-muted"
            aria-label="Toggle conversation sidebar"
          >
            <MenuIcon className="h-4 w-4" />
          </button>
          <p className="truncate text-sm font-medium text-foreground">
            {activeConversation?.title || conversationId || "conversation"}
          </p>
        </div>

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
    </div>
  )
}
