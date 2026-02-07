import crypto from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"
import type { UIMessage } from "ai"

const CONVERSATIONS_DIR = path.join(process.cwd(), "dedalus_stuff", "conversations")
const CONVERSATION_FILE_PATTERN = /^conversation(\d+)\.json$/
const DEFAULT_MODEL_NAME = process.env.DEDALUS_MODEL?.trim() || "anthropic/claude-opus-4-5"
const DEFAULT_MODEL_KIND = "dedalus"

type StoredRole = "user" | "assistant"

interface StoredMessage {
  id: string
  role: StoredRole
  text: string
  created_at: string
}

interface ConversationBundle {
  format: {
    name: string
    version: string
  }
  encoding: {
    charset: string
    line_endings: string
  }
  conversation: {
    id: string
    name: string
    name_hash_sha256: string
    created_at: string
    updated_at: string
  }
  model: {
    kind: string
    name: string
  }
  messages: {
    messages: StoredMessage[]
    filepaths: string[]
    tools: unknown[]
    notes: string
  }
}

interface ConversationRecord {
  conversationId: string
  filePath: string
  bundle: ConversationBundle
}

function createMessageId(role: StoredRole): string {
  return `${role}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
}

function sanitizeConversationId(value?: string | null): string | null {
  if (!value) return null
  const sanitized = value.trim().replace(/[^a-zA-Z0-9_-]/g, "")
  return sanitized.length > 0 ? sanitized : null
}

function buildConversationFilePath(conversationId: string): string {
  return path.join(CONVERSATIONS_DIR, `${conversationId}.json`)
}

function hashConversationName(name: string): string {
  return crypto.createHash("sha256").update(name).digest("hex")
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function extractTextFromUIMessage(message: UIMessage): string {
  const fromParts = message.parts
    ?.filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("")

  if (typeof fromParts === "string" && fromParts.length > 0) {
    return fromParts
  }

  const messageWithContent = message as UIMessage & { content?: unknown }
  if (typeof messageWithContent.content === "string") {
    return messageWithContent.content
  }

  return ""
}

function toStoredMessage(message: UIMessage): StoredMessage | null {
  if (message.role !== "user" && message.role !== "assistant") {
    return null
  }

  const text = extractTextFromUIMessage(message)
  if (!text.trim()) {
    return null
  }

  return {
    id: message.id || createMessageId(message.role),
    role: message.role,
    text,
    created_at: new Date().toISOString(),
  }
}

function toUIMessage(message: StoredMessage): UIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.text }],
  }
}

function createConversationBundle(conversationId: string): ConversationBundle {
  const now = new Date().toISOString()

  return {
    format: { name: "conversation_bundle", version: "1.0" },
    encoding: { charset: "utf-8", line_endings: "lf" },
    conversation: {
      id: conversationId,
      name: conversationId,
      name_hash_sha256: hashConversationName(conversationId),
      created_at: now,
      updated_at: now,
    },
    model: {
      kind: DEFAULT_MODEL_KIND,
      name: DEFAULT_MODEL_NAME,
    },
    messages: {
      messages: [],
      filepaths: [],
      tools: [],
      notes: "",
    },
  }
}

function normalizeStoredMessages(value: unknown): StoredMessage[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((rawMessage) => {
    if (!rawMessage || typeof rawMessage !== "object") {
      return []
    }

    const entry = rawMessage as Record<string, unknown>
    const role = entry.role
    const text = entry.text
    const id = entry.id
    const createdAt = entry.created_at

    if ((role !== "user" && role !== "assistant") || typeof text !== "string" || !text.trim()) {
      return []
    }

    return [
      {
        id: typeof id === "string" && id.length > 0 ? id : createMessageId(role),
        role,
        text,
        created_at: typeof createdAt === "string" ? createdAt : new Date().toISOString(),
      } satisfies StoredMessage,
    ]
  })
}

function normalizeBundle(raw: unknown, conversationId: string): ConversationBundle {
  const fallback = createConversationBundle(conversationId)
  if (!raw || typeof raw !== "object") {
    return fallback
  }

  const parsed = raw as Record<string, unknown>
  const conversation = parsed.conversation as Record<string, unknown> | undefined
  const model = parsed.model as Record<string, unknown> | undefined
  const messageContainer = parsed.messages as Record<string, unknown> | undefined

  const createdAt =
    typeof conversation?.created_at === "string" ? conversation.created_at : fallback.conversation.created_at

  return {
    format: {
      name:
        typeof (parsed.format as Record<string, unknown> | undefined)?.name === "string"
          ? ((parsed.format as Record<string, unknown>).name as string)
          : fallback.format.name,
      version:
        typeof (parsed.format as Record<string, unknown> | undefined)?.version === "string"
          ? ((parsed.format as Record<string, unknown>).version as string)
          : fallback.format.version,
    },
    encoding: {
      charset:
        typeof (parsed.encoding as Record<string, unknown> | undefined)?.charset === "string"
          ? ((parsed.encoding as Record<string, unknown>).charset as string)
          : fallback.encoding.charset,
      line_endings:
        typeof (parsed.encoding as Record<string, unknown> | undefined)?.line_endings === "string"
          ? ((parsed.encoding as Record<string, unknown>).line_endings as string)
          : fallback.encoding.line_endings,
    },
    conversation: {
      id: conversationId,
      name: typeof conversation?.name === "string" ? conversation.name : conversationId,
      name_hash_sha256:
        typeof conversation?.name_hash_sha256 === "string"
          ? conversation.name_hash_sha256
          : hashConversationName(conversationId),
      created_at: createdAt,
      updated_at:
        typeof conversation?.updated_at === "string" ? conversation.updated_at : fallback.conversation.updated_at,
    },
    model: {
      kind: typeof model?.kind === "string" ? model.kind : fallback.model.kind,
      name: typeof model?.name === "string" ? model.name : fallback.model.name,
    },
    messages: {
      messages: normalizeStoredMessages(messageContainer?.messages),
      filepaths: isStringArray(messageContainer?.filepaths) ? messageContainer.filepaths : [],
      tools: Array.isArray(messageContainer?.tools) ? messageContainer.tools : [],
      notes: typeof messageContainer?.notes === "string" ? messageContainer.notes : "",
    },
  }
}

async function saveBundle(filePath: string, bundle: ConversationBundle): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf-8")
}

async function loadBundle(filePath: string, conversationId: string): Promise<ConversationBundle> {
  const raw = await fs.readFile(filePath, "utf-8")
  return normalizeBundle(JSON.parse(raw), conversationId)
}

async function getNextConversationId(): Promise<string> {
  const files = await fs.readdir(CONVERSATIONS_DIR)
  const largestConversationNumber = files.reduce((largestNumber, fileName) => {
    const match = CONVERSATION_FILE_PATTERN.exec(fileName)
    if (!match) {
      return largestNumber
    }

    const candidate = Number.parseInt(match[1], 10)
    return Number.isNaN(candidate) ? largestNumber : Math.max(largestNumber, candidate)
  }, 0)

  return `conversation${largestConversationNumber + 1}`
}

async function ensureConversationRecord(preferredConversationId?: string | null): Promise<ConversationRecord> {
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true })

  const sanitizedConversationId = sanitizeConversationId(preferredConversationId)
  if (sanitizedConversationId) {
    const filePath = buildConversationFilePath(sanitizedConversationId)

    try {
      const bundle = await loadBundle(filePath, sanitizedConversationId)
      return { conversationId: sanitizedConversationId, filePath, bundle }
    } catch (error) {
      const fileReadError = error as NodeJS.ErrnoException
      if (fileReadError.code !== "ENOENT") {
        throw error
      }

      const bundle = createConversationBundle(sanitizedConversationId)
      await saveBundle(filePath, bundle)
      return { conversationId: sanitizedConversationId, filePath, bundle }
    }
  }

  const conversationId = await getNextConversationId()
  const filePath = buildConversationFilePath(conversationId)
  const bundle = createConversationBundle(conversationId)
  await saveBundle(filePath, bundle)

  return { conversationId, filePath, bundle }
}

export async function loadConversationForUi(conversationId?: string | null): Promise<{
  conversationId: string
  messages: UIMessage[]
}> {
  const record = await ensureConversationRecord(conversationId)
  return {
    conversationId: record.conversationId,
    messages: record.bundle.messages.messages.map(toUIMessage),
  }
}

export async function persistPromptSnapshot(
  conversationId: string | undefined,
  messages: UIMessage[],
): Promise<string> {
  const record = await ensureConversationRecord(conversationId)

  record.bundle.messages.messages = messages
    .map((message) => toStoredMessage(message))
    .filter((message): message is StoredMessage => message !== null)

  record.bundle.conversation.updated_at = new Date().toISOString()
  await saveBundle(record.filePath, record.bundle)

  return record.conversationId
}

export async function appendAssistantCompletion(conversationId: string, text: string): Promise<void> {
  if (!text.trim()) {
    return
  }

  const record = await ensureConversationRecord(conversationId)
  const lastMessage = record.bundle.messages.messages.at(-1)

  if (lastMessage?.role === "assistant" && lastMessage.text === text) {
    return
  }

  record.bundle.messages.messages.push({
    id: createMessageId("assistant"),
    role: "assistant",
    text,
    created_at: new Date().toISOString(),
  })

  record.bundle.conversation.updated_at = new Date().toISOString()
  await saveBundle(record.filePath, record.bundle)
}
