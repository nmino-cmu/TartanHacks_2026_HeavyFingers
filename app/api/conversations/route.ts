import {
  deleteConversationForUi,
  listConversationsForUi,
  loadConversationForUi,
  renameConversationForUi,
} from "@/lib/conversation-store"

export async function GET() {
  try {
    const conversations = await listConversationsForUi()
    return Response.json({ conversations })
  } catch (error) {
    console.error("Failed to list conversations.", error)
    return Response.json({ error: "Failed to list conversations." }, { status: 500 })
  }
}

export async function POST() {
  try {
    const conversation = await loadConversationForUi()
    return Response.json(conversation, { status: 201 })
  } catch (error) {
    console.error("Failed to create conversation.", error)
    return Response.json({ error: "Failed to create conversation." }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { conversationId?: unknown; name?: unknown }
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : undefined
    const name = typeof body.name === "string" ? body.name : ""

    const summary = await renameConversationForUi(conversationId, name)
    return Response.json({ conversation: summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to rename conversation."
    const status =
      message === "Missing conversation id."
        ? 400
        : message === "Conversation name cannot be empty."
          ? 400
          : message === "Conversation not found."
            ? 404
            : 500

    if (status === 500) {
      console.error("Failed to rename conversation.", error)
    }
    return Response.json({ error: message }, { status })
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url)
    const conversationId = url.searchParams.get("conversationId") ?? undefined
    const activeConversationId = url.searchParams.get("activeConversationId")
    const conversation = await deleteConversationForUi(conversationId, activeConversationId)
    return Response.json(conversation)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete conversation."
    const status =
      message === "Missing conversation id."
        ? 400
        : message === "Conversation not found."
          ? 404
          : message === "Cannot delete the last conversation."
            ? 400
            : 500

    if (status === 500) {
      console.error("Failed to delete conversation.", error)
    }
    return Response.json({ error: message }, { status })
  }
}
