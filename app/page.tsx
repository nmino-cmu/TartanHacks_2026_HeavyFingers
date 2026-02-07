import { Header } from "@/components/header"
import { ChatShell } from "@/components/chat-shell"

export default function Page() {
  return (
    <div className="mosaic-bg flex h-dvh flex-col">
      <Header />
      <main className="flex flex-1 overflow-hidden">
        <ChatShell />
      </main>
    </div>
  )
}
