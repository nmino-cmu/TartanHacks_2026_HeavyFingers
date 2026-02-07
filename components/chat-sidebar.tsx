"use client"

import React from "react"

import type { UIMessage } from "ai"
import { Button } from "./ui/button"

type Conversation = {
  id: string
  title: string
  model: string
  messages: UIMessage[]
  updatedAt: number
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: Conversation[]
  activeId: string
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}) {
  return (
    <aside className="w-72 shrink-0 border-r border-border/60 bg-card/60 backdrop-blur-md">
      <div className="p-3">
        <Button className="w-full" onClick={onNew}>
          + New chat
        </Button>
      </div>

      <div className="px-2 pb-3">
        <div className="space-y-1 overflow-y-auto custom-scrollbar" style={{ maxHeight: "calc(100dvh - 140px)" }}>
          {conversations
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map(c => (
              <div
                key={c.id}
                className={`group flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition
                  ${c.id === activeId ? "bg-muted/60" : "hover:bg-muted/40"}`}
              >
                <button
                  className="flex-1 text-left truncate"
                  onClick={() => onSelect(c.id)}
                  title={c.title}
                >
                  {c.title}
                </button>

                <button
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition"
                  onClick={() => onDelete(c.id)}
                  aria-label="Delete chat"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            ))}
        </div>
      </div>
    </aside>
  )
}
