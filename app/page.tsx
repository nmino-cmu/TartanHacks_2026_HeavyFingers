import { Header } from "@/components/header"
import { ChatContainer } from "@/components/chat-container"

export default function Page() {
  return (
    <div className="mosaic-bg flex h-dvh flex-col">
      <Header />
      <main className="flex flex-1 flex-col overflow-hidden">
        <ChatContainer />
      </main>
    </div>
  )
}
