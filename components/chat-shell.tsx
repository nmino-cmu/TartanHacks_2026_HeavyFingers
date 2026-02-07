"use client"

import { ChatContainer } from "@/components/chat-container"

export function ChatShell() {
  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        <ChatContainer />
      </div>
    </div>
  )
}
