"use client"

import { useEffect, useMemo, useState } from "react"
import type { UIMessage } from "ai"
import { ChatContainer } from "@/components/chat-container"
import { ChatSidebar } from "@/components/chat-sidebar"

type Conversation = {
  id: string
  title: string
  model: string
  messages: UIMessage[]
  updatedAt: number
}

const STORAGE_KEY = "daedalus_conversations_v1"
const DEFAULT_MODEL = "openai/gpt-4o-mini"

function newConversation(): Conversation {
  const id = crypto.randomUUID()
  return {
    id,
    title: "New chat",
    model: DEFAULT_MODEL,
    messages: [],
    updatedAt: Date.now(),
  }
}

function titleFromMessages(messages: UIMessage[]) {
  const firstUser = messages.find(m => m.role === "user")?.parts?.[0]
  // parts can vary; safest: fall back to generic title
  return (typeof (firstUser as any)?.text === "string" && (firstUser as any).text.trim().slice(0, 32)) || "New chat"
}

export function ChatShell() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string>("")

  // load
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Conversation[]
        if (parsed.length) {
          setConversations(parsed)
          setActiveId(parsed.sort((a,b)=>b.updatedAt-a.updatedAt)[0].id)
          return
        }
      }
    } catch {}
    const c = newConversation()
    setConversations([c])
    setActiveId(c.id)
  }, [])

  // save
  useEffect(() => {
    if (!conversations.length) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
  }, [conversations])

  const active = useMemo(
    () => conversations.find(c => c.id === activeId),
    [conversations, activeId]
  )

  const createChat = () => {
    const c = newConversation()
    setConversations(prev => [c, ...prev])
    setActiveId(c.id)
  }

  const deleteChat = (id: string) => {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id)
      if (!next.length) {
        const c = newConversation()
        setActiveId(c.id)
        return [c]
      }
      if (activeId === id) setActiveId(next[0].id)
      return next
    })
  }

  const updateActiveMessages = (messages: UIMessage[]) => {
    setConversations(prev =>
      prev.map(c => {
        if (c.id !== activeId) return c
        const nextTitle = c.title === "New chat" ? titleFromMessages(messages) : c.title
        return { ...c, messages, title: nextTitle, updatedAt: Date.now() }
      })
    )
  }

  const updateActiveModel = (model: string) => {
    setConversations(prev =>
      prev.map(c => (c.id === activeId ? { ...c, model, updatedAt: Date.now() } : c))
    )
  }

  if (!active) return null

  return (
    <div className="flex h-full overflow-hidden">
      <ChatSidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={createChat}
        onDelete={deleteChat}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <ChatContainer
          key={active.id}
          conversationId={active.id}  
          initialMessages={active.messages}
          model={active.model}
          onModelChange={updateActiveModel}
          onMessagesChange={updateActiveMessages}
        />
      </div>
    </div>
  )
}
