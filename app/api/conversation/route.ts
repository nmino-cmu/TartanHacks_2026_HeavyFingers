import { loadConversationForUi } from "@/lib/conversation-store"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const conversationId = url.searchParams.get("conversationId")
    const conversation = await loadConversationForUi(conversationId)
    return Response.json(conversation)
  } catch (error) {
    console.error("Failed to load conversation master copy.", error)
    return Response.json({ error: "Failed to load conversation." }, { status: 500 })
  }
}
