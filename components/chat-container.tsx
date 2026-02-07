"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { ChatMessage } from "@/components/chat-message"
import { ChatInput, type PendingAttachment } from "@/components/chat-input"
import { WelcomeScreen } from "@/components/welcome-screen"
<<<<<<< HEAD
<<<<<<< HEAD
import { toast } from "@/hooks/use-toast"
=======
>>>>>>> add_library
=======
import { toast } from "@/hooks/use-toast"
>>>>>>> mcericola
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
<<<<<<< HEAD
<<<<<<< HEAD
import { useTheme } from "next-themes"

const CONVERSATION_STORAGE_KEY = "daedalus-conversation-id"
const DEFAULT_MODEL = "anthropic/claude-opus-4-5"
const DEFAULT_IMAGE_MODEL = "openai/gpt-image-1"
const CHAT_MODELS = new Set<string>([
  "anthropic/claude-opus-4-5",
  "anthropic/claude-sonnet-4-5",
  "anthropic/claude-haiku-4-5",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
])
const IMAGE_MODELS = new Set<string>(["openai/gpt-image-1", "openai/dall-e-3"])

const CHARS_PER_TOKEN = 4
const KG_PER_TOKEN = 0.0000005
const MAX_OCR_ATTACHMENT_BYTES = 50 * 1024 * 1024
const MAX_OCR_ATTACHMENT_LABEL = "50 MB"
const SUPPORTED_OCR_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
])
=======
=======
import { useTheme } from "next-themes"
>>>>>>> mcericola

const CONVERSATION_STORAGE_KEY = "daedalus-conversation-id"
const DEFAULT_MODEL = "anthropic/claude-opus-4-5"
const DEFAULT_IMAGE_MODEL = "openai/gpt-image-1"
const CHAT_MODELS = new Set<string>([
  "anthropic/claude-opus-4-5",
  "anthropic/claude-sonnet-4-5",
  "anthropic/claude-haiku-4-5",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
])
const IMAGE_MODELS = new Set<string>(["openai/gpt-image-1", "openai/dall-e-3"])

const CHARS_PER_TOKEN = 4
const KG_PER_TOKEN = 0.0000005
<<<<<<< HEAD
>>>>>>> add_library

function extractMessageText(message: UIMessage): string {
  const partsText =
    message.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("") || ""

  if (partsText) return partsText

  const withContent = message as UIMessage & { content?: unknown }
  const { content } = withContent

  if (typeof content === "string") {
    return content
  }

  if (Array.isArray(content)) {
    const textBlocks = content
      .map((item) => {
        if (typeof item === "string") return item
        if (item && typeof item === "object" && "type" in item && "text" in (item as { type: unknown; text?: unknown })) {
          const maybeText = (item as { text?: unknown }).text
          if (typeof maybeText === "string") return maybeText
        }
        return ""
      })
      .filter(Boolean)
      .join("")

    if (textBlocks) {
      return textBlocks
    }
  }

  return ""
}
=======
const MAX_OCR_ATTACHMENT_BYTES = 50 * 1024 * 1024
const MAX_OCR_ATTACHMENT_LABEL = "50 MB"
const SUPPORTED_OCR_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
])
>>>>>>> mcericola

interface ConversationResponse {
  conversationId: string
  messages: UIMessage[]
  model?: string
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

<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> mcericola
interface MessageAttachment {
  id: string
  name: string
  size: number
  type: string
}

interface PendingOcrAttachment extends PendingAttachment {
  contentBase64?: string
  documentUrl?: string
  kind: "file" | "url"
}

interface ChatRequestAttachment {
  name: string
  size: number
  type: string
  kind: "file" | "url"
  contentBase64?: string
  documentUrl?: string
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ""

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

function normalizeAttachmentMime(file: File): string | null {
  const normalizedType = file.type.toLowerCase()
  if (SUPPORTED_OCR_MIME_TYPES.has(normalizedType)) {
    return normalizedType
  }

  const loweredName = file.name.toLowerCase()
  if (loweredName.endsWith(".pdf")) return "application/pdf"
  if (loweredName.endsWith(".png")) return "image/png"
  if (loweredName.endsWith(".jpg") || loweredName.endsWith(".jpeg")) return "image/jpeg"
  if (loweredName.endsWith(".webp")) return "image/webp"
  return null
}

function getAttachmentNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const pathname = parsed.pathname || ""
    const candidate = pathname.split("/").pop() || ""
    if (candidate.trim()) {
      return decodeURIComponent(candidate).slice(0, 200)
    }
  } catch {
    // fall through
  }

  return "linked-document"
}

<<<<<<< HEAD
=======
>>>>>>> add_library
=======
>>>>>>> mcericola
function sanitizeModel(value?: string | null): string {
  if (!value) {
    return DEFAULT_MODEL
  }

  const trimmed = value.trim()
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> mcericola
  return CHAT_MODELS.has(trimmed) ? trimmed : DEFAULT_MODEL
}

function sanitizeImageModel(value?: string | null): string {
  if (!value) {
    return DEFAULT_IMAGE_MODEL
  }

  const trimmed = value.trim()
  return IMAGE_MODELS.has(trimmed) ? trimmed : DEFAULT_IMAGE_MODEL
<<<<<<< HEAD
=======
  return ALLOWED_MODELS.has(trimmed) ? trimmed : DEFAULT_MODEL
>>>>>>> add_library
=======
>>>>>>> mcericola
}

function formatFootprint(kg: number): string {
  if (kg >= 0.001) {
    return `${kg.toFixed(3)} kg CO₂e`
  }
  return `${(kg * 1000).toFixed(2)} g CO₂e`
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

<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> mcericola
function LeafIcon({ className }: { className?: string }) {
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

<<<<<<< HEAD
=======
>>>>>>> add_library
=======
>>>>>>> mcericola
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
  const [model, setModel] = useState(DEFAULT_MODEL)
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> mcericola
  const [imageGenerationEnabled, setImageGenerationEnabled] = useState(false)
  const [imageModel, setImageModel] = useState(DEFAULT_IMAGE_MODEL)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [themeMounted, setThemeMounted] = useState(false)
<<<<<<< HEAD
=======
  const [dashboardOpen, setDashboardOpen] = useState(false)
>>>>>>> add_library
=======
>>>>>>> mcericola
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [isHydratingConversation, setIsHydratingConversation] = useState(true)
  const [isMutatingConversation, setIsMutatingConversation] = useState(false)
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null)
  const [editingConversationName, setEditingConversationName] = useState("")
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> mcericola
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [deepSearchEnabled, setDeepSearchEnabled] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<PendingOcrAttachment[]>([])
  const [attachmentsByMessageId, setAttachmentsByMessageId] = useState<Record<string, MessageAttachment[]>>({})
<<<<<<< HEAD
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const queuedAttachmentsRef = useRef<MessageAttachment[][]>([])
  const seenUserMessageIdsRef = useRef<Set<string>>(new Set())
  const isMobile = useIsMobile()
  const { theme, setTheme } = useTheme()
=======
=======
  const [searchQuery, setSearchQuery] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [searchStatus, setSearchStatus] = useState<string | null>(null)
  const [scrollTargetMessageId, setScrollTargetMessageId] = useState<string | null>(null)
  const [searchHighlightTerms, setSearchHighlightTerms] = useState<string[]>([])
  const [searchCursor, setSearchCursor] = useState<{ conversationId: string | null; messageId: string | null } | null>(null)
>>>>>>> mcericola
=======
>>>>>>> mcericola
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const queuedAttachmentsRef = useRef<MessageAttachment[][]>([])
  const seenUserMessageIdsRef = useRef<Set<string>>(new Set())
  const isMobile = useIsMobile()
<<<<<<< HEAD
>>>>>>> add_library
=======
  const { theme, setTheme } = useTheme()
>>>>>>> mcericola

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
<<<<<<< HEAD
<<<<<<< HEAD
  const isDarkTheme = theme === "dark"
=======
>>>>>>> add_library
=======
  const isDarkTheme = theme === "dark"
>>>>>>> mcericola

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.conversationId === conversationId),
    [conversations, conversationId],
  )

  const charCount = messages.reduce((total, message) => {
    const chars =
      message.parts
        ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text.length)
        .reduce((a, b) => a + b, 0) ?? 0

    return total + chars
  }, 0)
  const tokenEstimate = charCount / CHARS_PER_TOKEN
  const footprintKg = tokenEstimate * KG_PER_TOKEN
<<<<<<< HEAD

  const resetAttachmentUiState = useCallback(() => {
    setPendingAttachments([])
    setAttachmentsByMessageId({})
    queuedAttachmentsRef.current = []
    seenUserMessageIdsRef.current = new Set()
  }, [])
=======
>>>>>>> add_library

  const resetAttachmentUiState = useCallback(() => {
    setPendingAttachments([])
    setAttachmentsByMessageId({})
    queuedAttachmentsRef.current = []
    seenUserMessageIdsRef.current = new Set()
  }, [])

  useEffect(() => {
    const behavior = status === "streaming" || status === "submitted" ? "auto" : "smooth"
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [messages, status])

  useEffect(() => {
<<<<<<< HEAD
    if (!scrollTargetMessageId) return

    const timer = window.setTimeout(() => {
      const didScroll = scrollToMessage(scrollTargetMessageId)
      if (didScroll) {
        setScrollTargetMessageId(null)
      }
    }, 50)

    return () => window.clearTimeout(timer)
  }, [scrollTargetMessageId, scrollToMessage, messages])

  useEffect(() => {
<<<<<<< HEAD
    setThemeMounted(true)
  }, [])
=======
    if (!isMobile) {
      setIsSidebarOpen(true)
    }
  }, [isMobile])
>>>>>>> add_library

  useEffect(() => {
    setSearchCursor(null)
    setSearchStatus(null)
    setSearchHighlightTerms([])
  }, [searchQuery])
=======
    setThemeMounted(true)
  }, [])
>>>>>>> mcericola

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
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> mcericola
      setConversationId(data.conversationId)
      setModel(sanitizeModel(data.model))
      window.localStorage.setItem(CONVERSATION_STORAGE_KEY, data.conversationId)
      setMessages(data.messages)
<<<<<<< HEAD
<<<<<<< HEAD
      resetAttachmentUiState()
      return data
    },
    [setMessages, resetAttachmentUiState],
  )

  useEffect(() => {
    if (messages.length === 0) {
      return
    }

    let needsUpdate = false
    const nextAssignments: Record<string, MessageAttachment[]> = {}

    for (const message of messages) {
      if (message.role !== "user") {
        continue
      }

      if (seenUserMessageIdsRef.current.has(message.id)) {
        continue
      }

      seenUserMessageIdsRef.current.add(message.id)
      const queued = queuedAttachmentsRef.current.shift() ?? []
      if (queued.length > 0) {
        nextAssignments[message.id] = queued
        needsUpdate = true
      }
    }

    if (needsUpdate) {
      setAttachmentsByMessageId((previous) => ({ ...previous, ...nextAssignments }))
    }
  }, [messages])
=======
=======
      applyConversationData(data)
>>>>>>> mcericola
=======
      resetAttachmentUiState()
>>>>>>> mcericola
      return data
    },
    [setMessages, resetAttachmentUiState],
  )
>>>>>>> add_library

  useEffect(() => {
    if (messages.length === 0) {
      return
    }

    let needsUpdate = false
    const nextAssignments: Record<string, MessageAttachment[]> = {}

    for (const message of messages) {
      if (message.role !== "user") {
        continue
      }

      if (seenUserMessageIdsRef.current.has(message.id)) {
        continue
      }

      seenUserMessageIdsRef.current.add(message.id)
      const queued = queuedAttachmentsRef.current.shift() ?? []
      if (queued.length > 0) {
        nextAssignments[message.id] = queued
        needsUpdate = true
      }
    }

    if (needsUpdate) {
      setAttachmentsByMessageId((previous) => ({ ...previous, ...nextAssignments }))
    }
  }, [messages])

  useEffect(() => {
    let isMounted = true

    const hydrateConversation = async () => {
      try {
        const savedConversationId = window.localStorage.getItem(CONVERSATION_STORAGE_KEY)
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
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> mcericola
    const attachmentSnapshot: MessageAttachment[] = pendingAttachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      size: attachment.size,
      type: attachment.type,
    }))
    const requestAttachments: ChatRequestAttachment[] = pendingAttachments.map((attachment) => ({
      name: attachment.name,
      size: attachment.size,
      type: attachment.type,
      kind: attachment.kind,
      contentBase64: attachment.contentBase64,
      documentUrl: attachment.documentUrl,
    }))
    queuedAttachmentsRef.current.push(attachmentSnapshot)
<<<<<<< HEAD
    sendMessage(
      { text: input },
      {
        body: {
          conversationId,
          model,
          webSearchEnabled,
          deepSearchEnabled,
          imageGenerationEnabled,
          imageModel,
          attachments: requestAttachments,
        },
=======
    sendMessage(
      { text: input },
      {
        body: { conversationId, model },
>>>>>>> add_library
=======
    sendMessage(
      { text: input },
      {
        body: {
          conversationId,
          model,
          webSearchEnabled,
          deepSearchEnabled,
          imageGenerationEnabled,
          imageModel,
          attachments: requestAttachments,
        },
>>>>>>> mcericola
      },
    )
    setInput("")
    setPendingAttachments([])
  }

  const handleSuggestionClick = (prompt: string) => {
    if (isLoading || !conversationId) return
    sendMessage(
      { text: prompt },
      {
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> mcericola
        body: {
          conversationId,
          model,
          webSearchEnabled,
          deepSearchEnabled,
          imageGenerationEnabled,
          imageModel,
        },
<<<<<<< HEAD
      },
    )
=======
        body: { conversationId, model },
=======
>>>>>>> mcericola
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
      setModel(sanitizeModel(data.model))
      window.localStorage.setItem(CONVERSATION_STORAGE_KEY, data.conversationId)
      setMessages(data.messages)
      setInput("")
      resetAttachmentUiState()
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
        setModel(sanitizeModel(data.model))
        window.localStorage.setItem(CONVERSATION_STORAGE_KEY, data.conversationId)
        setMessages(data.messages)
        resetAttachmentUiState()
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
>>>>>>> add_library
  }

<<<<<<< HEAD
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
      setModel(sanitizeModel(data.model))
      window.localStorage.setItem(CONVERSATION_STORAGE_KEY, data.conversationId)
      setMessages(data.messages)
      setInput("")
      resetAttachmentUiState()
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
        setModel(sanitizeModel(data.model))
        window.localStorage.setItem(CONVERSATION_STORAGE_KEY, data.conversationId)
        setMessages(data.messages)
        resetAttachmentUiState()
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

=======
>>>>>>> mcericola
  const activeToolStatus = useMemo(() => {
    if (status !== "submitted") {
      return null
    }

    const hasOcrTool = pendingAttachments.length > 0
    const hasWebTool = webSearchEnabled
    const hasDeepTool = deepSearchEnabled
    const hasImageTool = imageGenerationEnabled

    const runningSearchLabels = [
      hasWebTool ? "web search" : null,
      hasDeepTool ? "deep search" : null,
    ].filter((label): label is string => Boolean(label))
    if (hasOcrTool && runningSearchLabels.length > 0) {
      return `Running tools: OCR and ${runningSearchLabels.join(" + ")}...`
    }
    if (hasOcrTool) {
      return "Running tool: OCR parsing..."
    }
    if (runningSearchLabels.length > 0) {
      return `Running tool: ${runningSearchLabels.join(" + ")}...`
    }
    if (hasImageTool) {
      return "Running tool: image generation..."
    }
    return "Preparing response..."
  }, [status, pendingAttachments.length, webSearchEnabled, deepSearchEnabled, imageGenerationEnabled])

  return (
    <div className="relative flex flex-1 overflow-hidden">
<<<<<<< HEAD
<<<<<<< HEAD
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
            <p className="px-2 py-3 text-xs text-muted-foreground">No conversations yet.</p>
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
        <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-card/70 px-3 py-2 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/70 bg-background text-foreground transition-colors hover:bg-muted"
              aria-label="Toggle conversation sidebar"
            >
              <MenuIcon className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <LeafIcon className="h-4 w-4" />
              </div>
              <span className="hidden text-sm font-semibold tracking-tight text-foreground sm:inline">
                Verdant
              </span>
            </div>
            <p className="truncate text-sm font-medium text-foreground">
              {activeConversation?.title || conversationId || "conversation"}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {themeMounted ? (
              <button
                type="button"
                onClick={() => setTheme(isDarkTheme ? "light" : "dark")}
                className="inline-flex h-8 items-center rounded-full border-2 border-emerald-700 bg-emerald-100/80 px-3 text-xs font-medium text-emerald-950 ring-1 ring-emerald-700/35 transition hover:-translate-y-0.5 hover:border-emerald-800 hover:bg-emerald-200 hover:shadow-[0_10px_24px_-10px_rgba(16,185,129,0.95)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/80 dark:border-emerald-300 dark:bg-emerald-500/30 dark:text-emerald-50 dark:ring-emerald-300/45 dark:hover:border-emerald-200 dark:hover:bg-emerald-500/45 dark:focus-visible:ring-emerald-300/95"
                aria-label="Toggle theme"
              >
                {isDarkTheme ? "🌙 Dark" : "☀️ Light"}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setDashboardOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs font-medium text-card-foreground shadow-sm transition hover:border-primary/50 hover:bg-background"
              aria-label="Open carbon footprint dashboard"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
                <span aria-hidden>🌿</span>
              </div>
              <span className="hidden whitespace-nowrap sm:inline" aria-label={`Estimated carbon footprint ${formatFootprint(footprintKg)}`}>
                Footprint: {formatFootprint(footprintKg)}
              </span>
            </button>
          </div>
        </div>
=======
      <button
        type="button"
        onClick={() => setDashboardOpen(true)}
        className="fixed right-3 top-16 z-50 flex items-center gap-2 rounded-full border border-border/70 bg-card/90 px-3 py-1.5 text-xs font-medium text-card-foreground shadow-sm backdrop-blur transition hover:border-primary/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
        aria-label="Open carbon footprint dashboard"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
          <span aria-hidden>🌿</span>
        </div>
        <span className="whitespace-nowrap" aria-label={`Estimated carbon footprint ${formatFootprint(footprintKg)}`}>
          Footprint: {formatFootprint(footprintKg)}
        </span>
      </button>

=======
>>>>>>> mcericola
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
            <p className="px-2 py-3 text-xs text-muted-foreground">No conversations yet.</p>
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
<<<<<<< HEAD
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-card/70 px-3 py-2 backdrop-blur-md">
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
>>>>>>> add_library

        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-card/60 px-3 py-2">
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSearchNext()
            }}
          >
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search messages"
              className="h-9 w-60"
              disabled={isLoading || isSearching}
            />
            <Button
              type="submit"
              variant="outline"
              className="h-9"
              disabled={isLoading || isSearching}
=======
        <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-card/70 px-3 py-2 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/70 bg-background text-foreground transition-colors hover:bg-muted"
              aria-label="Toggle conversation sidebar"
>>>>>>> mcericola
            >
              <MenuIcon className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <LeafIcon className="h-4 w-4" />
              </div>
              <span className="hidden text-sm font-semibold tracking-tight text-foreground sm:inline">
                Verdant
              </span>
            </div>
            <p className="truncate text-sm font-medium text-foreground">
              {activeConversation?.title || conversationId || "conversation"}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {themeMounted ? (
              <button
                type="button"
                onClick={() => setTheme(isDarkTheme ? "light" : "dark")}
                className="inline-flex h-8 items-center rounded-full border-2 border-emerald-700 bg-emerald-100/80 px-3 text-xs font-medium text-emerald-950 ring-1 ring-emerald-700/35 transition hover:-translate-y-0.5 hover:border-emerald-800 hover:bg-emerald-200 hover:shadow-[0_10px_24px_-10px_rgba(16,185,129,0.95)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/80 dark:border-emerald-300 dark:bg-emerald-500/30 dark:text-emerald-50 dark:ring-emerald-300/45 dark:hover:border-emerald-200 dark:hover:bg-emerald-500/45 dark:focus-visible:ring-emerald-300/95"
                aria-label="Toggle theme"
              >
                {isDarkTheme ? "🌙 Dark" : "☀️ Light"}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setDashboardOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs font-medium text-card-foreground shadow-sm transition hover:border-primary/50 hover:bg-background"
              aria-label="Open carbon footprint dashboard"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
                <span aria-hidden>🌿</span>
              </div>
              <span className="hidden whitespace-nowrap sm:inline" aria-label={`Estimated carbon footprint ${formatFootprint(footprintKg)}`}>
                Footprint: {formatFootprint(footprintKg)}
              </span>
            </button>
          </div>
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
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> mcericola
                  attachments={attachmentsByMessageId[message.id] ?? []}
                  isStreaming={isLoading && index === messages.length - 1 && message.role === "assistant"}
                />
              ))}
              {activeToolStatus ? (
                <div className="flex gap-3 px-4 py-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-primary-foreground" />
                  </div>
                  <div className="max-w-[75%] rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm text-card-foreground shadow-sm">
                    {activeToolStatus}
                  </div>
                </div>
              ) : null}
<<<<<<< HEAD
=======
                  isStreaming={isLoading && index === messages.length - 1 && message.role === "assistant"}
                />
              ))}
>>>>>>> add_library
=======
>>>>>>> mcericola
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
          model={model}
          onModelChange={(value) => setModel(sanitizeModel(value))}
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> mcericola
          imageGenerationEnabled={imageGenerationEnabled}
          onToggleImageGeneration={() => setImageGenerationEnabled((current) => !current)}
          imageModel={imageModel}
          onImageModelChange={(value) => setImageModel(sanitizeImageModel(value))}
          webSearchEnabled={webSearchEnabled}
          onToggleWebSearch={() => setWebSearchEnabled((current) => !current)}
          deepSearchEnabled={deepSearchEnabled}
          onToggleDeepSearch={() => setDeepSearchEnabled((current) => !current)}
          attachments={pendingAttachments}
          onAddFiles={(files) => {
            if (!files || files.length === 0) {
              return
            }

            void (async () => {
              const selectedFiles = Array.from(files)
              const supportedFiles = selectedFiles
                .map((file) => ({ file, mimeType: normalizeAttachmentMime(file) }))
                .filter(
                  (entry): entry is { file: File; mimeType: string } =>
                    typeof entry.mimeType === "string",
                )

              if (supportedFiles.length === 0) {
                toast({
                  title: "Unsupported file type",
                  description: "Supported: PDF, PNG, JPG, JPEG, WEBP.",
                  variant: "destructive",
                })
                return
              }

              const oversizedFiles = supportedFiles.filter(
                ({ file }) => file.size > MAX_OCR_ATTACHMENT_BYTES,
              )
              if (oversizedFiles.length > 0) {
                toast({
                  title: "Unsupported file size",
                  description: `Files larger than ${MAX_OCR_ATTACHMENT_LABEL} are not supported.`,
                  variant: "destructive",
                })
              }

              const allowedFiles = supportedFiles.filter(
                ({ file }) => file.size > 0 && file.size <= MAX_OCR_ATTACHMENT_BYTES,
              )
              if (allowedFiles.length === 0) {
                return
              }

              const preparedFiles = await Promise.all(
                allowedFiles.map(async ({ file, mimeType }, index) => {
                  const contentBase64 = arrayBufferToBase64(await file.arrayBuffer())
                  return {
                    id: `pending-file-${Date.now()}-${index}-${Math.random().toString(16).slice(2, 8)}`,
                    name: file.name,
                    size: file.size,
                    type: mimeType,
                    kind: "file",
                    contentBase64,
                  } satisfies PendingOcrAttachment
                }),
              )

              setPendingAttachments((current) => [...current, ...preparedFiles])
            })().catch((error) => {
              console.error("Failed to prepare OCR attachment.", error)
              toast({
                title: "Failed to read file",
                description: "Please try again with a different file.",
                variant: "destructive",
              })
            })
          }}
          onAddAttachmentUrl={(url) => {
            setPendingAttachments((current) => [
              ...current,
              {
                id: `pending-link-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                name: getAttachmentNameFromUrl(url),
                size: 0,
                type: "text/uri-list",
                kind: "url",
                documentUrl: url,
              } satisfies PendingOcrAttachment,
            ])
          }}
          onRemoveAttachment={(attachmentId) => {
            setPendingAttachments((current) =>
              current.filter((attachment) => attachment.id !== attachmentId),
            )
          }}
<<<<<<< HEAD
=======
>>>>>>> add_library
=======
>>>>>>> mcericola
        />
      </div>

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
              <p className="mt-1 text-2xl font-semibold text-foreground">{formatFootprint(footprintKg)}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background p-4">
              <p className="text-xs text-muted-foreground">Estimated tokens</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {Math.max(0, Math.round(tokenEstimate)).toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background p-4">
              <p className="text-xs text-muted-foreground">Characters processed</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{charCount.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background p-4">
              <p className="text-xs text-muted-foreground">Messages exchanged</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{messages.length}</p>
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-secondary/60 px-4 py-3 text-sm text-foreground">
            Tip: Shorter prompts and specific questions usually reduce token use and footprint.
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
