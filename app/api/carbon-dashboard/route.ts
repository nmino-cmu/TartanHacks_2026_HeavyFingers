import { promises as fs } from "node:fs"
import path from "node:path"

const CONVERSATIONS_DIR = path.join(process.cwd(), "dedalus_stuff", "conversations")
const CHARS_PER_TOKEN = 4
const KG_PER_TOKEN = 0.0000005
const DEFAULT_USER_ID = "proof-user-1"
const DEFAULT_USER_NAME = "Proof User"

interface ConversationMetric {
  conversationId: string
  title: string
  userId: string
  userName: string
  updatedAt: string
  messageCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  footprintKg: number
}

interface UserMetric {
  userId: string
  userName: string
  conversationCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  footprintKg: number
  lastActiveAt: string
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function sanitizeUserId(value: string | null): string | null {
  if (!value) {
    return null
  }
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, "")
  return sanitized || null
}

function normalizeTimestamp(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value !== "string") {
      continue
    }
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString()
    }
  }
  return new Date(0).toISOString()
}

function estimateTokens(text: string): number {
  const normalized = text.trim()
  if (!normalized) {
    return 0
  }
  return Math.max(1, Math.ceil(normalized.length / CHARS_PER_TOKEN))
}

function extractUserHintsFromNotes(notes: unknown): { userId: string | null; userName: string | null } {
  const notesText = asString(notes)
  if (!notesText) {
    return { userId: null, userName: null }
  }

  const idMatch = /(?:^|\s)(?:user[_ -]?id)\s*[:=]\s*([a-zA-Z0-9_-]{2,64})/i.exec(notesText)
  const nameMatch = /(?:^|\s)(?:user[_ -]?name)\s*[:=]\s*([^\n\r]{2,80})/i.exec(notesText)

  return {
    userId: sanitizeUserId(idMatch?.[1]?.trim() ?? null),
    userName: asString(nameMatch?.[1] ?? null),
  }
}

function resolveUserIdentity(conversation: Record<string, unknown>, notes: unknown): {
  userId: string
  userName: string
} {
  const noteHints = extractUserHintsFromNotes(notes)

  const fromConversationId =
    sanitizeUserId(asString(conversation.userId)) ??
    sanitizeUserId(asString(conversation.user_id)) ??
    sanitizeUserId(asString(conversation.ownerId)) ??
    sanitizeUserId(asString(conversation.owner_id))

  const fromConversationName =
    asString(conversation.userName) ??
    asString(conversation.user_name) ??
    asString(conversation.ownerName) ??
    asString(conversation.owner_name)

  const userId = fromConversationId ?? noteHints.userId ?? DEFAULT_USER_ID
  const userName = fromConversationName ?? noteHints.userName ?? DEFAULT_USER_NAME

  return {
    userId,
    userName,
  }
}

function toConversationMetric(
  fileName: string,
  payload: Record<string, unknown>,
): ConversationMetric | null {
  const conversation = payload.conversation
  const modelMessages = payload.messages

  if (!conversation || typeof conversation !== "object") {
    return null
  }
  if (!modelMessages || typeof modelMessages !== "object") {
    return null
  }

  const conversationRecord = conversation as Record<string, unknown>
  const messageRecord = modelMessages as Record<string, unknown>
  const storedMessages = Array.isArray(messageRecord.messages) ? messageRecord.messages : []

  const conversationId = fileName.replace(/\.json$/i, "") || asString(conversationRecord.id)
  if (!conversationId) {
    return null
  }

  let promptTokens = 0
  let completionTokens = 0
  let messageCount = 0

  for (const rawMessage of storedMessages) {
    if (!rawMessage || typeof rawMessage !== "object") {
      continue
    }

    const entry = rawMessage as Record<string, unknown>
    const role = asString(entry.role)
    const text = asString(entry.text)
    if (!role || !text) {
      continue
    }

    const tokens = estimateTokens(text)
    messageCount += 1

    if (role === "user") {
      promptTokens += tokens
    } else if (role === "assistant") {
      completionTokens += tokens
    } else {
      promptTokens += Math.ceil(tokens / 2)
      completionTokens += Math.floor(tokens / 2)
    }
  }

  const totalTokens = promptTokens + completionTokens
  const footprintKg = totalTokens * KG_PER_TOKEN
  const title = asString(conversationRecord.name) ?? conversationId
  const updatedAt = normalizeTimestamp(
    conversationRecord.updated_at,
    conversationRecord.created_at,
  )
  const { userId, userName } = resolveUserIdentity(conversationRecord, messageRecord.notes)

  return {
    conversationId,
    title,
    userId,
    userName,
    updatedAt,
    messageCount,
    promptTokens,
    completionTokens,
    totalTokens,
    footprintKg,
  }
}

function toTimestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function accumulateUsers(conversations: ConversationMetric[]): UserMetric[] {
  const userMap = new Map<string, UserMetric>()

  for (const conversation of conversations) {
    const existing = userMap.get(conversation.userId)
    if (!existing) {
      userMap.set(conversation.userId, {
        userId: conversation.userId,
        userName: conversation.userName,
        conversationCount: 1,
        promptTokens: conversation.promptTokens,
        completionTokens: conversation.completionTokens,
        totalTokens: conversation.totalTokens,
        footprintKg: conversation.footprintKg,
        lastActiveAt: conversation.updatedAt,
      })
      continue
    }

    existing.conversationCount += 1
    existing.promptTokens += conversation.promptTokens
    existing.completionTokens += conversation.completionTokens
    existing.totalTokens += conversation.totalTokens
    existing.footprintKg += conversation.footprintKg
    if (toTimestamp(conversation.updatedAt) > toTimestamp(existing.lastActiveAt)) {
      existing.lastActiveAt = conversation.updatedAt
    }
    if (conversation.userName && conversation.userName !== DEFAULT_USER_NAME) {
      existing.userName = conversation.userName
    }
  }

  return Array.from(userMap.values()).sort((a, b) => b.footprintKg - a.footprintKg)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const requestedUserRaw = asString(searchParams.get("userId"))
  const requestedUserId =
    requestedUserRaw && requestedUserRaw.toLowerCase() !== "all"
      ? sanitizeUserId(requestedUserRaw)
      : null

  try {
    await fs.mkdir(CONVERSATIONS_DIR, { recursive: true })
    const files = await fs.readdir(CONVERSATIONS_DIR)
    const jsonFiles = files.filter((fileName) => fileName.endsWith(".json"))
    const conversationRows = (
      await Promise.all(
        jsonFiles.map(async (fileName) => {
          const filePath = path.join(CONVERSATIONS_DIR, fileName)
          try {
            const raw = await fs.readFile(filePath, "utf-8")
            const parsed = JSON.parse(raw)
            if (!parsed || typeof parsed !== "object") {
              return null
            }
            return toConversationMetric(fileName, parsed as Record<string, unknown>)
          } catch (error) {
            console.error(`Skipping unreadable conversation for dashboard: ${fileName}`, error)
            return null
          }
        }),
      )
    ).filter((metric): metric is ConversationMetric => metric !== null)

    conversationRows.sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt))
    const availableUsers = accumulateUsers(conversationRows)
    const filteredConversations = requestedUserId
      ? conversationRows.filter((conversation) => conversation.userId === requestedUserId)
      : conversationRows
    const filteredUsers = accumulateUsers(filteredConversations)

    const promptTokens = filteredConversations.reduce((sum, item) => sum + item.promptTokens, 0)
    const completionTokens = filteredConversations.reduce((sum, item) => sum + item.completionTokens, 0)
    const totalTokens = filteredConversations.reduce((sum, item) => sum + item.totalTokens, 0)
    const footprintKg = filteredConversations.reduce((sum, item) => sum + item.footprintKg, 0)

    return Response.json({
      generatedAt: new Date().toISOString(),
      selectedUserId: requestedUserId ?? "all",
      proofOfConceptSingleUser: availableUsers.length <= 1,
      assumptions: {
        mode: "heuristic-from-message-text",
        charsPerToken: CHARS_PER_TOKEN,
        kgPerToken: KG_PER_TOKEN,
      },
      summary: {
        conversationCount: filteredConversations.length,
        promptTokens,
        completionTokens,
        totalTokens,
        footprintKg,
        averageConversationFootprintKg:
          filteredConversations.length > 0 ? footprintKg / filteredConversations.length : 0,
      },
      availableUsers,
      users: filteredUsers,
      conversations: filteredConversations,
    })
  } catch (error) {
    console.error("Failed to build carbon dashboard dataset.", error)
    return Response.json({ error: "Failed to build carbon dashboard dataset." }, { status: 500 })
  }
}
