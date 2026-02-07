import { ChatContainer } from "@/components/chat-container"

export default function Page() {
  return (
    <div className="mosaic-bg flex h-dvh flex-col">
      <main className="flex flex-1 flex-col overflow-hidden">
        <ChatContainer />
      </main>
    </div>
  )
}
