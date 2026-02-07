import crypto from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"
import type { UIMessage } from "ai"

const CONVERSATIONS_DIR = path.join(process.cwd(), "dedalus_stuff", "conversations")
const CONVERSATION_FILE_PATTERN = /^conversation(\d+)\.json$/
const DEFAULT_MODEL_NAME = process.env.DEDALUS_MODEL?.trim() || "anthropic/claude-opus-4-5"
const DEFAULT_MODEL_KIND = "dedalus"
const GLOBAL_INFO_JSON_PATH = path.join(process.cwd(), "dedalus_stuff", "globalInfo.json")

interface GlobalInfoTemplate {
  activeFileDetails: {
    existsActive: boolean | ""
    activeChatIndex: number | ""
    activeJsonFilePath: string
  }
  convoName: string
  convoIndex: number
  carbonFootprint: number
  "permanent memories": unknown[]
}

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

export interface ConversationSummary {
  conversationId: string
  title: string
  updatedAt: string
  messageCount: number
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

function getConversationIndex(conversationId: string): number | null {
  const match = /^conversation(\d+)$/i.exec(conversationId)
  if (!match) {
    return null
  }

  const parsed = Number.parseInt(match[1], 10)
  return Number.isNaN(parsed) ? null : parsed
}

function defaultConversationTitle(conversationId: string): string {
  const conversationIndex = getConversationIndex(conversationId)
  return conversationIndex !== null ? `Conversation ${conversationIndex}` : conversationId
}

function normalizeConversationTitle(rawName: unknown, conversationId: string): string {
  if (typeof rawName === "string") {
    const trimmed = rawName.trim()
    if (trimmed) {
      const match = /^conversation(\d+)$/i.exec(trimmed)
      if (match) {
        return `Conversation ${Number.parseInt(match[1], 10)}`
      }
      return trimmed
    }
  }

  return defaultConversationTitle(conversationId)
}

function sanitizeConversationTitle(name: string): string {
  const normalized = name.trim().replace(/\s+/g, " ")
  if (!normalized) {
    throw new Error("Conversation name cannot be empty.")
  }

  return normalized.slice(0, 120)
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
  const conversationName = defaultConversationTitle(conversationId)

  return {
    format: { name: "conversation_bundle", version: "1.0" },
    encoding: { charset: "utf-8", line_endings: "lf" },
    conversation: {
      id: conversationId,
      name: conversationName,
      name_hash_sha256: hashConversationName(conversationName),
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
  const conversationName = normalizeConversationTitle(conversation?.name, conversationId)

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
      name: conversationName,
      name_hash_sha256:
        typeof conversation?.name_hash_sha256 === "string"
          ? conversation.name_hash_sha256
          : hashConversationName(conversationName),
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

async function atomicWriteJson(filePath: string, payload: unknown): Promise<void> {
  const directory = path.dirname(filePath)
  await fs.mkdir(directory, { recursive: true })

  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  )
  const serialized = `${JSON.stringify(payload, null, 2)}\n`

  await fs.writeFile(tempPath, serialized, "utf-8")
  try {
    await fs.rename(tempPath, filePath)
  } catch (error) {
    try {
      await fs.unlink(tempPath)
    } catch {
      // best-effort cleanup
    }
    throw error
  }
}

async function saveBundle(filePath: string, bundle: ConversationBundle): Promise<void> {
  await atomicWriteJson(filePath, bundle)
}

async function loadBundle(filePath: string, conversationId: string): Promise<ConversationBundle> {
  const raw = await fs.readFile(filePath, "utf-8")
  return normalizeBundle(JSON.parse(raw), conversationId)
}

function getConversationIdFromPath(filePath: string): string | null {
  const fileName = path.basename(filePath)
  const conversationId = fileName.endsWith(".json") ? fileName.slice(0, -5) : ""
  return sanitizeConversationId(conversationId)
}

async function loadGlobalPayload(): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(GLOBAL_INFO_JSON_PATH, "utf-8")
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>
    }
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException
    if (fileError.code !== "ENOENT") {
      console.error("Failed to read global info json, creating a new one.", error)
    }
  }

  return {}
}

function normalizeGlobalInfoPayload(raw: Record<string, unknown>): GlobalInfoTemplate {
  const activeFileDetails =
    raw.activeFileDetails && typeof raw.activeFileDetails === "object"
      ? (raw.activeFileDetails as Record<string, unknown>)
      : {}

  const activeChatIndexRaw = activeFileDetails.activeChatIndex
  const activeChatIndex =
    typeof activeChatIndexRaw === "number" && Number.isFinite(activeChatIndexRaw)
      ? activeChatIndexRaw
      : typeof activeChatIndexRaw === "string" &&
          activeChatIndexRaw.trim().length > 0 &&
          !Number.isNaN(Number.parseInt(activeChatIndexRaw, 10))
        ? Number.parseInt(activeChatIndexRaw, 10)
        : ""

  const convoIndexRaw = Number(raw.convoIndex)
  const convoIndex = Number.isFinite(convoIndexRaw) && convoIndexRaw >= 0 ? Math.floor(convoIndexRaw) : 0

  const carbonFootprintRaw = Number(raw.carbonFootprint)
  const carbonFootprint = Number.isFinite(carbonFootprintRaw) ? carbonFootprintRaw : 0

  return {
    activeFileDetails: {
      existsActive:
        typeof activeFileDetails.existsActive === "boolean"
          ? activeFileDetails.existsActive
          : activeFileDetails.existsActive === ""
            ? ""
            : "",
      activeChatIndex,
      activeJsonFilePath:
        typeof activeFileDetails.activeJsonFilePath === "string"
          ? activeFileDetails.activeJsonFilePath
          : "",
    },
    convoName: typeof raw.convoName === "string" ? raw.convoName : "",
    convoIndex,
    carbonFootprint,
    "permanent memories": Array.isArray(raw["permanent memories"]) ? raw["permanent memories"] : [],
  }
}

async function getActiveConversationIdFromGlobal(): Promise<string | null> {
  const payload = normalizeGlobalInfoPayload(await loadGlobalPayload())
  if (typeof payload.activeFileDetails.activeJsonFilePath === "string" && payload.activeFileDetails.activeJsonFilePath) {
    const fromPath = getConversationIdFromPath(payload.activeFileDetails.activeJsonFilePath)
    if (fromPath) {
      return fromPath
    }
  }

  if (typeof payload.activeFileDetails.activeChatIndex === "number") {
    return `conversation${payload.activeFileDetails.activeChatIndex}`
  }

  return null
}

async function updateGlobalActiveConversation(record: ConversationRecord): Promise<void> {
  const current = normalizeGlobalInfoPayload(await loadGlobalPayload())
  const conversationIndex = getConversationIndex(record.conversationId)
  current.activeFileDetails.existsActive = true
  current.activeFileDetails.activeJsonFilePath = record.filePath
  current.convoName = normalizeConversationTitle(
    record.bundle.conversation.name,
    record.conversationId,
  )
  if (conversationIndex !== null) {
    current.activeFileDetails.activeChatIndex = conversationIndex
    current.convoIndex = Math.max(current.convoIndex, conversationIndex)
  }

  await atomicWriteJson(GLOBAL_INFO_JSON_PATH, current)
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

async function ensureExistingConversationRecord(
  requiredConversationId: string | undefined,
): Promise<ConversationRecord> {
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true })

  const sanitizedConversationId = sanitizeConversationId(requiredConversationId)
  if (!sanitizedConversationId) {
    throw new Error("Missing active conversation id.")
  }

  const filePath = buildConversationFilePath(sanitizedConversationId)
  const bundle = await loadBundle(filePath, sanitizedConversationId)
  return { conversationId: sanitizedConversationId, filePath, bundle }
}

export async function loadConversationForUi(conversationId?: string | null): Promise<{
  conversationId: string
  messages: UIMessage[]
}> {
  const record = await ensureConversationRecord(conversationId)
  try {
    await updateGlobalActiveConversation(record)
  } catch (error) {
    console.error("Failed to update global active conversation info.", error)
  }

  return {
    conversationId: record.conversationId,
    messages: record.bundle.messages.messages.map(toUIMessage),
  }
}

export async function persistPromptSnapshot(
  conversationId: string | undefined,
  messages: UIMessage[],
  options?: { allowCreate?: boolean },
): Promise<string> {
  const allowCreate = options?.allowCreate ?? true
  const record = allowCreate
    ? await ensureConversationRecord(conversationId)
    : await ensureExistingConversationRecord(conversationId)

  record.bundle.messages.messages = messages
    .map((message) => toStoredMessage(message))
    .filter((message): message is StoredMessage => message !== null)

  record.bundle.conversation.updated_at = new Date().toISOString()
  await saveBundle(record.filePath, record.bundle)
  try {
    await updateGlobalActiveConversation(record)
  } catch (error) {
    console.error("Failed to update global active conversation info.", error)
  }

  return record.conversationId
}

export async function renameConversationForUi(
  conversationId: string | undefined,
  requestedName: string,
): Promise<ConversationSummary> {
  const sanitizedConversationId = sanitizeConversationId(conversationId)
  if (!sanitizedConversationId) {
    throw new Error("Missing conversation id.")
  }

  let record: ConversationRecord
  try {
    record = await ensureExistingConversationRecord(sanitizedConversationId)
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException
    if (fileError.code === "ENOENT") {
      throw new Error("Conversation not found.")
    }
    throw error
  }
  const nextName = sanitizeConversationTitle(requestedName)
  const now = new Date().toISOString()

  record.bundle.conversation.name = nextName
  record.bundle.conversation.name_hash_sha256 = hashConversationName(nextName)
  record.bundle.conversation.updated_at = now
  await saveBundle(record.filePath, record.bundle)

  const activeConversationId = await getActiveConversationIdFromGlobal()
  if (activeConversationId === record.conversationId) {
    try {
      await updateGlobalActiveConversation(record)
    } catch (error) {
      console.error("Failed to update global active conversation info.", error)
    }
  }

  return {
    conversationId: record.conversationId,
    title: nextName,
    updatedAt: now,
    messageCount: record.bundle.messages.messages.length,
  }
}

export async function deleteConversationForUi(
  conversationId: string | undefined,
  preferredActiveConversationId?: string | null,
): Promise<{ conversationId: string; messages: UIMessage[] }> {
  const sanitizedConversationId = sanitizeConversationId(conversationId)
  if (!sanitizedConversationId) {
    throw new Error("Missing conversation id.")
  }

  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true })
  const existingConversations = await listConversationsForUi()

  if (!existingConversations.find((conversation) => conversation.conversationId === sanitizedConversationId)) {
    throw new Error("Conversation not found.")
  }

  if (existingConversations.length <= 1) {
    throw new Error("Cannot delete the last conversation.")
  }

  const filePath = buildConversationFilePath(sanitizedConversationId)
  await fs.unlink(filePath)

  const remainingConversations = await listConversationsForUi()
  const preferredActiveId = sanitizeConversationId(preferredActiveConversationId)
  const globalActiveId = await getActiveConversationIdFromGlobal()

  const remainingConversationIds = new Set(
    remainingConversations.map((conversation) => conversation.conversationId),
  )
  const fallbackActiveId = remainingConversations[0]?.conversationId

  const nextActiveConversationId =
    preferredActiveId && preferredActiveId !== sanitizedConversationId && remainingConversationIds.has(preferredActiveId)
      ? preferredActiveId
      : globalActiveId &&
          globalActiveId !== sanitizedConversationId &&
          remainingConversationIds.has(globalActiveId)
        ? globalActiveId
        : fallbackActiveId

  return loadConversationForUi(nextActiveConversationId)
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

function toTimestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

export async function listConversationsForUi(): Promise<ConversationSummary[]> {
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true })
  const files = await fs.readdir(CONVERSATIONS_DIR)

  const summaries: ConversationSummary[] = []

  for (const fileName of files) {
    if (!fileName.endsWith(".json")) {
      continue
    }

    const conversationId = fileName.slice(0, -5)
    if (!conversationId) {
      continue
    }

    const filePath = path.join(CONVERSATIONS_DIR, fileName)

    try {
      const bundle = await loadBundle(filePath, conversationId)
      summaries.push({
        conversationId,
        title: normalizeConversationTitle(bundle.conversation.name, conversationId),
        updatedAt: bundle.conversation.updated_at || bundle.conversation.created_at,
        messageCount: bundle.messages.messages.length,
      })
    } catch (error) {
      console.error(`Skipping unreadable conversation file: ${fileName}`, error)
    }
  }

  return summaries.sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt))
}
