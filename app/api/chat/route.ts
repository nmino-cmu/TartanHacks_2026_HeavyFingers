import { spawn } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai"
import {
  appendAssistantCompletion,
  getActiveConversationIdForUi,
  persistPromptSnapshot,
} from "@/lib/conversation-store"

export const maxDuration = 600

type StreamFinishReason = "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other"

interface AskQuestionEvent {
  type?: unknown
  token?: unknown
  text?: unknown
  message?: unknown
  finish_reason?: unknown
  prompt_tokens?: unknown
  completion_tokens?: unknown
  total_tokens?: unknown
  carbon_kg?: unknown
}

interface AskQuestionUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  carbonKg?: number
}

interface UploadedOcrAttachment {
  name: string
  size: number
  type: string
  kind: "file" | "url"
  contentBase64?: string
  documentUrl?: string
}

interface ConversationLockQueue {
  tail: Promise<void>
}

type RoutingTier = "light" | "tooling" | "heavy"

interface CarbonRoutingSettings {
  routingSensitivity: number
  historyCompression: number
}

interface RoutingDecision {
  tier: RoutingTier
  model: string
  heavyModel: string
  maxTokens: number
  historyWindowMessages: number
  historySummaryMaxChars: number
  availableModels: string[]
  allowEscalation: boolean
}

interface CachedToolContext {
  value: string
  expiresAt: number
}

const conversationLockQueues = new Map<string, ConversationLockQueue>()
const toolContextCache = new Map<string, CachedToolContext>()

const DEFAULT_MODEL = "anthropic/claude-opus-4-5"
const RELIABLE_FALLBACK_MODEL = "openai/gpt-5-mini"
const ENABLE_MODEL_FAILOVER = process.env.CHAT_ENABLE_MODEL_FAILOVER?.trim() === "1"
const ENABLE_RECOVERY_LOGS = process.env.CHAT_RECOVERY_LOGS?.trim() === "1"
const DEFAULT_API_BASE_URL = "https://api.dedaluslabs.ai/v1"
const OCR_MODEL = process.env.CHAT_OCR_MODEL?.trim() || "mistral-ocr-latest"
const WEB_SEARCH_MCP_SERVER = "akakak/parallel-search-mcp"
const DEEP_SEARCH_MCP_SERVER = "tsion/sonar"
const WEB_SEARCH_MODEL = process.env.CHAT_WEB_SEARCH_MODEL?.trim() || "openai/gpt-5-mini"
const DEEP_SEARCH_MODEL = process.env.CHAT_DEEP_SEARCH_MODEL?.trim() || "openai/gpt-5-mini"
const MAX_OCR_ATTACHMENTS = 5
const MAX_OCR_ATTACHMENT_BYTES = 50 * 1024 * 1024
const MAX_BASE64_CHARS_PER_ATTACHMENT = Math.ceil((MAX_OCR_ATTACHMENT_BYTES * 4) / 3) + 512
const MAX_OCR_CONTEXT_CHARS_PER_FILE = 12000
const MAX_OCR_CONTEXT_CHARS_TOTAL = 30000
const MAX_WEB_CONTEXT_CHARS = 12000
const GENERATED_IMAGE_DIR = path.join(process.cwd(), "public", "generated")
const SUPPORTED_OCR_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
])
const CHAT_MODELS = new Set<string>([
  "anthropic/claude-opus-4-5",
  "anthropic/claude-sonnet-4-5",
  "anthropic/claude-haiku-4-5",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
])
const IMAGE_MODELS = new Set(["openai/dall-e-3", "openai/gpt-image-1"])
const IMAGE_MODEL_FROM_ENV = process.env.CHAT_IMAGE_MODEL?.trim() || ""
const DEFAULT_IMAGE_MODEL = IMAGE_MODELS.has(IMAGE_MODEL_FROM_ENV)
  ? IMAGE_MODEL_FROM_ENV
  : "openai/gpt-image-1"
const ALLOWED_MODELS = new Set<string>([...CHAT_MODELS, ...IMAGE_MODELS])

const STREAM_DELTA_DELAY_MS = 10
const STREAM_TOKENS_PER_FLUSH = 2
const LIGHT_TIER_MODEL_DEFAULT = process.env.CHAT_TIER_MODEL_LIGHT?.trim() || "openai/gpt-5-nano"
const TOOLING_TIER_MODEL_DEFAULT = process.env.CHAT_TIER_MODEL_TOOLING?.trim() || "openai/gpt-5-mini"
const HEAVY_TIER_MODEL_DEFAULT = process.env.CHAT_TIER_MODEL_HEAVY?.trim() || DEFAULT_MODEL
const LIGHT_TIER_MAX_TOKENS = Number(process.env.CHAT_TIER_MAX_TOKENS_LIGHT ?? 900)
const TOOLING_TIER_MAX_TOKENS = Number(process.env.CHAT_TIER_MAX_TOKENS_TOOLING ?? 1400)
const HEAVY_TIER_MAX_TOKENS = Number(process.env.CHAT_TIER_MAX_TOKENS_HEAVY ?? 2600)
const TOOL_CONTEXT_CACHE_TTL_MS = Number(process.env.CHAT_TOOL_CACHE_TTL_MS ?? 3 * 60 * 1000)

const MIN_HISTORY_WINDOW_MESSAGES = 6
const MAX_HISTORY_WINDOW_MESSAGES = 24
const MIN_HISTORY_SUMMARY_CHARS = 900
const MAX_HISTORY_SUMMARY_CHARS = 4200
const FALLBACK_KG_PER_TOKEN = 0.0000005

const DEFAULT_CARBON_SETTINGS: CarbonRoutingSettings = {
  routingSensitivity: 55,
  historyCompression: 50,
}

function sanitizeConversationId(value?: string | null): string | null {
  if (!value) return null
  const sanitized = value.trim().replace(/[^a-zA-Z0-9_-]/g, "")
  return sanitized.length > 0 ? sanitized : null
}

function sanitizeRequestedModel(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return ALLOWED_MODELS.has(trimmed) ? trimmed : null
}

function sanitizeRequestedImageModel(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return IMAGE_MODELS.has(trimmed) ? trimmed : null
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  const rounded = Math.round(value)
  if (rounded < min) return min
  if (rounded > max) return max
  return rounded
}

function sanitizeCarbonRoutingSettings(raw: unknown): CarbonRoutingSettings {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_CARBON_SETTINGS
  }

  const record = raw as Record<string, unknown>
  const routingSensitivity =
    typeof record.routingSensitivity === "number"
      ? clampInt(record.routingSensitivity, 0, 100)
      : DEFAULT_CARBON_SETTINGS.routingSensitivity
  const historyCompression =
    typeof record.historyCompression === "number"
      ? clampInt(record.historyCompression, 0, 100)
      : DEFAULT_CARBON_SETTINGS.historyCompression

  return {
    routingSensitivity,
    historyCompression,
  }
}

function getProviderFromModelName(modelName: string): "anthropic" | "openai" | "google" | "other" {
  if (modelName.startsWith("anthropic/")) return "anthropic"
  if (modelName.startsWith("openai/")) return "openai"
  if (modelName.startsWith("google/")) return "google"
  return "other"
}

function pickTierModels(selectedModel: string): { light: string; tooling: string; heavy: string } {
  const provider = getProviderFromModelName(selectedModel)
  if (provider === "anthropic") {
    return {
      light: "anthropic/claude-haiku-4-5",
      tooling: "anthropic/claude-sonnet-4-5",
      heavy: CHAT_MODELS.has(selectedModel) ? selectedModel : "anthropic/claude-opus-4-5",
    }
  }

  if (provider === "google") {
    return {
      light: "google/gemini-2.5-flash-lite",
      tooling: "google/gemini-2.5-flash",
      heavy: CHAT_MODELS.has(selectedModel) ? selectedModel : "google/gemini-2.5-pro",
    }
  }

  if (provider === "openai") {
    return {
      light: "openai/gpt-5-nano",
      tooling: "openai/gpt-5-mini",
      heavy: CHAT_MODELS.has(selectedModel) ? selectedModel : "openai/gpt-5",
    }
  }

  const fallbackHeavy = CHAT_MODELS.has(selectedModel) ? selectedModel : HEAVY_TIER_MODEL_DEFAULT
  return {
    light: LIGHT_TIER_MODEL_DEFAULT,
    tooling: TOOLING_TIER_MODEL_DEFAULT,
    heavy: fallbackHeavy,
  }
}

function scorePromptComplexity(prompt: string): number {
  const normalized = prompt.trim().toLowerCase()
  if (!normalized) {
    return 0
  }

  const charCount = normalized.length
  const wordCount = normalized.split(/\s+/).filter(Boolean).length
  const newlineCount = (normalized.match(/\n/g) || []).length
  const questionCount = (normalized.match(/\?/g) || []).length

  let score = 0
  if (charCount > 220) score += 1
  if (charCount > 520) score += 1
  if (charCount > 1000) score += 1
  if (wordCount > 55) score += 1
  if (wordCount > 120) score += 1
  if (newlineCount >= 4) score += 1
  if (questionCount >= 2) score += 1
  if (/(analy[sz]e|compare|trade[ -]?off|step[- ]by[- ]step|plan|strategy|ambiguous|deep dive)/.test(normalized)) {
    score += 2
  }
  if (/(debug|root cause|architecture|design|optimi[sz]e|refactor|benchmark|algorithm)/.test(normalized)) {
    score += 2
  }

  return score
}

function computeHistoryCompression(
  tier: RoutingTier,
  historyCompression: number,
): { historyWindowMessages: number; historySummaryMaxChars: number } {
  const compression = clampInt(historyCompression, 0, 100)
  const baseWindow =
    MAX_HISTORY_WINDOW_MESSAGES -
    Math.round(((MAX_HISTORY_WINDOW_MESSAGES - MIN_HISTORY_WINDOW_MESSAGES) * compression) / 100)
  const baseSummaryChars =
    MAX_HISTORY_SUMMARY_CHARS -
    Math.round(((MAX_HISTORY_SUMMARY_CHARS - MIN_HISTORY_SUMMARY_CHARS) * compression) / 100)

  if (tier === "light") {
    return {
      historyWindowMessages: clampInt(baseWindow - 2, MIN_HISTORY_WINDOW_MESSAGES, MAX_HISTORY_WINDOW_MESSAGES),
      historySummaryMaxChars: clampInt(
        baseSummaryChars - 350,
        MIN_HISTORY_SUMMARY_CHARS,
        MAX_HISTORY_SUMMARY_CHARS,
      ),
    }
  }

  if (tier === "heavy") {
    return {
      historyWindowMessages: clampInt(baseWindow + 3, MIN_HISTORY_WINDOW_MESSAGES, MAX_HISTORY_WINDOW_MESSAGES),
      historySummaryMaxChars: clampInt(
        baseSummaryChars + 550,
        MIN_HISTORY_SUMMARY_CHARS,
        MAX_HISTORY_SUMMARY_CHARS,
      ),
    }
  }

  return {
    historyWindowMessages: clampInt(baseWindow, MIN_HISTORY_WINDOW_MESSAGES, MAX_HISTORY_WINDOW_MESSAGES),
    historySummaryMaxChars: clampInt(baseSummaryChars, MIN_HISTORY_SUMMARY_CHARS, MAX_HISTORY_SUMMARY_CHARS),
  }
}

function buildRoutingDecision(params: {
  latestUserMessage: string
  selectedModel: string
  toolsEnabled: boolean
  settings: CarbonRoutingSettings
}): RoutingDecision {
  const { latestUserMessage, selectedModel, toolsEnabled, settings } = params
  const tierModels = pickTierModels(selectedModel)
  const complexity = scorePromptComplexity(latestUserMessage)
  const complexityThreshold = clampInt(
    7 - Math.floor(clampInt(settings.routingSensitivity, 0, 100) / 25),
    3,
    7,
  )

  const tier: RoutingTier = toolsEnabled
    ? "tooling"
    : complexity >= complexityThreshold
      ? "heavy"
      : "light"

  const model =
    tier === "tooling" ? tierModels.tooling : tier === "heavy" ? tierModels.heavy : tierModels.light
  const heavyModel = tierModels.heavy
  const allowEscalation = tier === "light" && heavyModel !== model
  const maxTokens =
    tier === "tooling"
      ? clampInt(TOOLING_TIER_MAX_TOKENS, 400, 8000)
      : tier === "heavy"
        ? clampInt(HEAVY_TIER_MAX_TOKENS, 400, 8000)
        : clampInt(LIGHT_TIER_MAX_TOKENS, 400, 8000)
  const history = computeHistoryCompression(tier, settings.historyCompression)
  const availableModels = Array.from(new Set([tierModels.light, tierModels.tooling, tierModels.heavy])).filter(
    (modelName) => CHAT_MODELS.has(modelName),
  )

  return {
    tier,
    model,
    heavyModel,
    maxTokens,
    historyWindowMessages: history.historyWindowMessages,
    historySummaryMaxChars: history.historySummaryMaxChars,
    availableModels,
    allowEscalation,
  }
}

function getCachedToolContext(cacheKey: string): string | null {
  const cached = toolContextCache.get(cacheKey)
  if (!cached) {
    return null
  }
  if (cached.expiresAt <= Date.now()) {
    toolContextCache.delete(cacheKey)
    return null
  }
  return cached.value
}

function setCachedToolContext(cacheKey: string, value: string): void {
  const ttl = Number.isFinite(TOOL_CONTEXT_CACHE_TTL_MS)
    ? Math.max(30_000, TOOL_CONTEXT_CACHE_TTL_MS)
    : 3 * 60 * 1000
  toolContextCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttl,
  })
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

function getLatestUserMessage(messages: UIMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== "user") {
      continue
    }

    const text = extractTextFromUIMessage(message).trim()
    if (text) {
      return text
    }
  }

  return null
}

function normalizeFinishReason(rawReason: string): StreamFinishReason {
  switch (rawReason) {
    case "stop":
      return "stop"
    case "length":
      return "length"
    case "content_filter":
    case "content-filter":
      return "content-filter"
    case "tool_calls":
    case "tool-calls":
      return "tool-calls"
    case "error":
      return "error"
    default:
      return "other"
  }
}

function splitIntoStreamingTokens(text: string): string[] {
  if (!text) {
    return []
  }

  const tokens = text.match(/\s+|[^\s]+/g)
  if (!tokens) {
    return [text]
  }

  return tokens
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === "string") {
    return error
  }

  return "Unknown error."
}

function toClientError(error: unknown): string {
  const message = getErrorMessage(error)
  const normalized = message.toLowerCase()
  if (message.includes("Missing DEDALUS_API_KEY")) {
    return "Missing or invalid DEDALUS_API_KEY. Set a valid key and restart the server."
  }

  if (message.includes("DEDALUS_API_KEY")) {
    return "Missing or invalid DEDALUS_API_KEY. Set a valid key and restart the server."
  }

  if (normalized.includes("dedalus request failed with status 500")) {
    return "The selected model is temporarily unavailable on Dedalus right now. Switch models and try again."
  }

  if (normalized.includes("dedalus request failed with status 403")) {
    return "Dedalus rejected the request (403). Verify API key permissions and allowed origins, then retry."
  }

  if (normalized.includes("cloudflare")) {
    return "Dedalus request was blocked upstream (Cloudflare). Please retry in a moment."
  }

  if (normalized.includes("no valid ocr attachments")) {
    return "No valid OCR attachments were found. Upload PDF/PNG/JPG/WEBP or add an https URL."
  }

  if (normalized.includes("ocr attachment parse failed")) {
    return "Failed to parse one or more attachments with OCR. Try a different file or URL."
  }

  return message || "Chat request failed."
}

function isImageModel(modelName: string): boolean {
  return IMAGE_MODELS.has(modelName)
}

function normalizeBase64(value: string): string {
  return value.replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "")
}

function sanitizeAttachmentName(value: unknown, index: number): string {
  if (typeof value !== "string") {
    return `attachment-${index + 1}.pdf`
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return `attachment-${index + 1}.pdf`
  }

  return trimmed.slice(0, 200)
}

function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "https:"
  } catch {
    return false
  }
}

function detectMimeFromBinary(decoded: Buffer): string | null {
  if (decoded.length >= 5 && decoded.subarray(0, 5).toString("utf8") === "%PDF-") {
    return "application/pdf"
  }

  if (
    decoded.length >= 8 &&
    decoded[0] === 0x89 &&
    decoded[1] === 0x50 &&
    decoded[2] === 0x4e &&
    decoded[3] === 0x47 &&
    decoded[4] === 0x0d &&
    decoded[5] === 0x0a &&
    decoded[6] === 0x1a &&
    decoded[7] === 0x0a
  ) {
    return "image/png"
  }

  if (decoded.length >= 3 && decoded[0] === 0xff && decoded[1] === 0xd8 && decoded[2] === 0xff) {
    return "image/jpeg"
  }

  if (
    decoded.length >= 12 &&
    decoded.subarray(0, 4).toString("ascii") === "RIFF" &&
    decoded.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp"
  }

  return null
}

function inferMimeFromUrl(url: string, hintType?: string): string | null {
  const normalizedHint = (hintType || "").toLowerCase().trim()
  if (SUPPORTED_OCR_MIME_TYPES.has(normalizedHint)) {
    return normalizedHint
  }

  try {
    const parsed = new URL(url)
    const pathname = parsed.pathname.toLowerCase()
    if (pathname.endsWith(".pdf")) return "application/pdf"
    if (pathname.endsWith(".png")) return "image/png"
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg"
    if (pathname.endsWith(".webp")) return "image/webp"
  } catch {
    return null
  }

  return null
}

function decodeOcrAttachments(raw: unknown): UploadedOcrAttachment[] {
  if (!Array.isArray(raw)) {
    return []
  }

  const attachments: UploadedOcrAttachment[] = []

  for (let index = 0; index < raw.length; index += 1) {
    if (attachments.length >= MAX_OCR_ATTACHMENTS) {
      break
    }

    const entry = raw[index]
    if (!entry || typeof entry !== "object") {
      continue
    }

    const record = entry as Record<string, unknown>
    const name = sanitizeAttachmentName(record.name, index)
    const typeHint = typeof record.type === "string" ? record.type : ""
    const kindValue = typeof record.kind === "string" ? record.kind : ""
    const kind: "file" | "url" = kindValue === "url" ? "url" : "file"

    if (kind === "url") {
      const documentUrl = typeof record.documentUrl === "string" ? record.documentUrl.trim() : ""
      if (!documentUrl || !isHttpsUrl(documentUrl)) {
        continue
      }

      const inferredMimeType = inferMimeFromUrl(documentUrl, typeHint) || "text/uri-list"

      attachments.push({
        name,
        size: 0,
        type: inferredMimeType,
        kind: "url",
        documentUrl,
      })
      continue
    }

    const rawContent = typeof record.contentBase64 === "string" ? record.contentBase64 : ""
    if (!rawContent) {
      continue
    }

    const contentBase64 = normalizeBase64(rawContent)
    if (!contentBase64 || contentBase64.length > MAX_BASE64_CHARS_PER_ATTACHMENT) {
      continue
    }

    const decoded = Buffer.from(contentBase64, "base64")
    if (decoded.length === 0 || decoded.length > MAX_OCR_ATTACHMENT_BYTES) {
      continue
    }

    const detectedMimeType = detectMimeFromBinary(decoded)
    if (!detectedMimeType) {
      continue
    }

    const size =
      typeof record.size === "number" && Number.isFinite(record.size)
        ? Math.max(0, Math.floor(record.size))
        : decoded.length

    attachments.push({
      name,
      size,
      type: detectedMimeType,
      kind: "file",
      contentBase64,
    })
  }

  return attachments
}

function extractTextFragments(value: unknown): string[] {
  if (typeof value === "string") {
    return value ? [value] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractTextFragments(item))
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return ["text", "content", "value", "output_text"].flatMap((key) =>
      extractTextFragments(record[key]),
    )
  }

  return []
}

function extractTextFromChatCompletionPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return ""
  }

  const record = payload as Record<string, unknown>
  const choices = record.choices
  if (!Array.isArray(choices) || choices.length === 0) {
    return ""
  }

  const firstChoice = choices[0]
  if (!firstChoice || typeof firstChoice !== "object") {
    return ""
  }

  const choiceRecord = firstChoice as Record<string, unknown>
  const message = choiceRecord.message
  const text = extractTextFragments(message).join("")
  if (text.trim()) {
    return text.trim()
  }

  return extractTextFragments(choiceRecord).join("").trim()
}

function extractTextFromOcrPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return ""
  }

  const record = payload as Record<string, unknown>
  const pagesRaw = record.pages
  if (!Array.isArray(pagesRaw)) {
    return ""
  }

  const markdownChunks = pagesRaw
    .map((page, index) => {
      if (!page || typeof page !== "object") {
        return ""
      }

      const pageRecord = page as Record<string, unknown>
      const markdown = typeof pageRecord.markdown === "string" ? pageRecord.markdown.trim() : ""
      if (!markdown) {
        return ""
      }

      const pageIndex =
        typeof pageRecord.index === "number" && Number.isFinite(pageRecord.index)
          ? Math.max(0, Math.floor(pageRecord.index))
          : index
      return `Page ${pageIndex + 1}\n${markdown}`
    })
    .filter((chunk) => chunk.length > 0)

  return markdownChunks.join("\n\n")
}

interface BuildMcpSearchContextOptions {
  userQuery: string
  dedalusApiKey: string
  abortSignal: AbortSignal
  mcpServer: string
  model: string
  workerPrompt: string
  failurePrefix: string
  noResultsText: string
  toolChoiceRequired?: boolean
  availableModels?: string[]
}

async function buildMcpSearchContext(options: BuildMcpSearchContextOptions): Promise<string> {
  const {
    userQuery,
    dedalusApiKey,
    abortSignal,
    mcpServer,
    model,
    workerPrompt,
    failurePrefix,
    noResultsText,
    toolChoiceRequired = true,
    availableModels,
  } = options
  const apiBaseUrl = process.env.DEDALUS_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
  const userAgent =
    process.env.DEDALUS_USER_AGENT?.trim() ||
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

  const requestBody: Record<string, unknown> = {
    model,
    stream: false,
    mcp_servers: [mcpServer],
    messages: [
      {
        role: "system",
        content: workerPrompt,
      },
      {
        role: "user",
        content: `Find up-to-date web information for this query and summarize it:\n${userQuery}`,
      },
    ],
  }
  if (toolChoiceRequired) {
    requestBody.tool_choice = "required"
  }
  if (Array.isArray(availableModels) && availableModels.length > 0) {
    requestBody.available_models = availableModels
  }

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${dedalusApiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": userAgent,
    },
    body: JSON.stringify(requestBody),
    signal: abortSignal,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`${failurePrefix} failed with status ${response.status}. ${body.slice(0, 400)}`)
  }

  const payload = (await response.json()) as unknown
  const text = extractTextFromChatCompletionPayload(payload)
  if (!text) {
    throw new Error(`${failurePrefix} failed: empty result.`)
  }

  if (text.trim() === "NO_RESULTS") {
    return noResultsText
  }

  return text.slice(0, MAX_WEB_CONTEXT_CHARS)
}

async function buildWebSearchContext(
  userQuery: string,
  dedalusApiKey: string,
  abortSignal: AbortSignal,
): Promise<string> {
  return buildMcpSearchContext({
    userQuery,
    dedalusApiKey,
    abortSignal,
    mcpServer: WEB_SEARCH_MCP_SERVER,
    model: WEB_SEARCH_MODEL,
    workerPrompt:
      "You are a web research worker. Use available MCP tools to search and extract web content before answering. Return concise bullet points and include source URLs. If no useful results are found, return exactly NO_RESULTS.",
    failurePrefix: "Web search context",
    noResultsText: "Web search returned no useful results.",
    toolChoiceRequired: true,
    availableModels: [WEB_SEARCH_MODEL],
  })
}

async function buildDeepSearchContext(
  userQuery: string,
  dedalusApiKey: string,
  abortSignal: AbortSignal,
): Promise<string> {
  return buildMcpSearchContext({
    userQuery,
    dedalusApiKey,
    abortSignal,
    mcpServer: DEEP_SEARCH_MCP_SERVER,
    model: DEEP_SEARCH_MODEL,
    workerPrompt:
      "You are a deep research worker. Use available MCP tools to run broad and follow-up searches, extract key evidence, and return concise bullets with source URLs. If no useful results are found, return exactly NO_RESULTS.",
    failurePrefix: "Deep search context",
    noResultsText: "Deep search returned no useful results.",
    toolChoiceRequired: true,
    availableModels: [DEEP_SEARCH_MODEL],
  })
}

function buildGeneratedImageMarkdown(imageUrl: string, prompt: string): string {
  const alt = prompt.trim().slice(0, 120) || "Generated image"
  return `![${alt}](${imageUrl})`
}

async function saveGeneratedImage(base64Data: string): Promise<string> {
  await fs.mkdir(GENERATED_IMAGE_DIR, { recursive: true })
  const fileName = `gen-${Date.now()}-${Math.random().toString(16).slice(2, 10)}.png`
  const filePath = path.join(GENERATED_IMAGE_DIR, fileName)
  await fs.writeFile(filePath, Buffer.from(base64Data, "base64"))
  return `/generated/${fileName}`
}

async function generateImageMarkdown(
  prompt: string,
  selectedModel: string,
  abortSignal: AbortSignal,
): Promise<string> {
  const dedalusApiKey = process.env.DEDALUS_API_KEY?.trim()
  if (!dedalusApiKey) {
    throw new Error("Missing DEDALUS_API_KEY.")
  }

  const promptText = prompt.trim()
  if (!promptText) {
    throw new Error("Image generation failed: prompt is empty.")
  }

  const apiBaseUrl = process.env.DEDALUS_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
  const dedalusUserAgent =
    process.env.DEDALUS_USER_AGENT?.trim() ||
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

  const body: Record<string, unknown> = {
    model: selectedModel,
    prompt: promptText,
    n: 1,
    size: "1024x1024",
  }

  if (selectedModel === "openai/dall-e-3") {
    body.quality = "standard"
  }

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${dedalusApiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": dedalusUserAgent,
    },
    body: JSON.stringify(body),
    signal: abortSignal,
  })

  if (!response.ok) {
    const bodyText = await response.text()
    throw new Error(`Image generation failed with status ${response.status}. ${bodyText.slice(0, 400)}`)
  }

  const payload = (await response.json()) as Record<string, unknown>
  const data = Array.isArray(payload.data) ? payload.data : []
  const first = data[0] as Record<string, unknown> | undefined
  if (!first) {
    throw new Error("Image generation failed: empty image payload.")
  }

  const imageUrl = typeof first.url === "string" ? first.url : ""
  if (imageUrl) {
    return buildGeneratedImageMarkdown(imageUrl, promptText)
  }

  const imageBase64 =
    typeof first.b64_json === "string"
      ? first.b64_json
      : typeof first.b64 === "string"
        ? first.b64
        : ""
  if (!imageBase64) {
    throw new Error("Image generation failed: no image URL or base64 payload returned.")
  }

  const localImagePath = await saveGeneratedImage(imageBase64)
  return buildGeneratedImageMarkdown(localImagePath, promptText)
}

async function parseOcrAttachment(
  attachment: UploadedOcrAttachment,
  dedalusApiKey: string,
  abortSignal: AbortSignal,
): Promise<string> {
  const apiBaseUrl = process.env.DEDALUS_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
  const userAgent =
    process.env.DEDALUS_USER_AGENT?.trim() ||
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/ocr`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${dedalusApiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": userAgent,
    },
    body: JSON.stringify({
      model: OCR_MODEL,
      document: {
        type: "document_url",
        document_url:
          attachment.kind === "url" && attachment.documentUrl
            ? attachment.documentUrl
            : `data:${attachment.type};base64,${attachment.contentBase64 ?? ""}`,
      },
      include_image_base64: false,
    }),
    signal: abortSignal,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OCR attachment parse failed with status ${response.status}. ${body.slice(0, 400)}`)
  }

  const payload = (await response.json()) as unknown
  const extracted = extractTextFromOcrPayload(payload)
  if (!extracted.trim()) {
    throw new Error("OCR attachment parse failed: extracted text was empty.")
  }

  return extracted
}

async function buildOcrPromptContext(
  attachments: UploadedOcrAttachment[],
  dedalusApiKey: string,
  abortSignal: AbortSignal,
): Promise<string> {
  let totalChars = 0
  const sections: string[] = []

  for (const attachment of attachments) {
    const parsedText = await parseOcrAttachment(attachment, dedalusApiKey, abortSignal)
    const normalizedText = parsedText.replace(/\r\n/g, "\n").trim()
    if (!normalizedText) {
      continue
    }

    const remaining = MAX_OCR_CONTEXT_CHARS_TOTAL - totalChars
    if (remaining <= 0) {
      break
    }

    const nextChunk = normalizedText.slice(0, Math.min(MAX_OCR_CONTEXT_CHARS_PER_FILE, remaining))
    if (!nextChunk) {
      continue
    }

    totalChars += nextChunk.length
    const truncated = nextChunk.length < normalizedText.length
    const sourceLabel = attachment.kind === "url" ? "URL" : "File"
    sections.push(
      [
        `${sourceLabel}: ${attachment.name}`,
        nextChunk,
        truncated ? "[Attachment text truncated to fit context window.]" : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
  }

  if (sections.length === 0) {
    throw new Error("OCR attachment parse failed: no text could be extracted.")
  }

  return [
    "The user attached files or links. Use this extracted OCR context when answering.",
    ...sections,
  ].join("\n\n")
}

async function acquireConversationLock(conversationId: string): Promise<() => void> {
  const queue = conversationLockQueues.get(conversationId) ?? { tail: Promise.resolve() }
  const previousTail = queue.tail

  let releaseGate!: () => void
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve
  })

  const nextTail = previousTail.then(
    () => gate,
    () => gate,
  )

  queue.tail = nextTail
  conversationLockQueues.set(conversationId, queue)

  await previousTail.catch(() => undefined)

  let released = false
  return () => {
    if (released) {
      return
    }
    released = true
    releaseGate()

    if (conversationLockQueues.get(conversationId) === queue && queue.tail === nextTail) {
      conversationLockQueues.delete(conversationId)
    }
  }
}

async function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) {
    return
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
      resolve()
    }

    signal.addEventListener("abort", onAbort, { once: true })
  })
}

async function waitForDrainSignal(
  signal: AbortSignal,
  setWakeDrain: (resolver: (() => void) | null) => void,
  timeoutMs: number,
): Promise<void> {
  if (signal.aborted || timeoutMs <= 0) {
    return
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      setWakeDrain(null)
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, timeoutMs)

    const resolver = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
      resolve()
    }

    const onAbort = () => {
      clearTimeout(timer)
      setWakeDrain(null)
      signal.removeEventListener("abort", onAbort)
      resolve()
    }

    setWakeDrain(resolver)
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

async function streamFromAskQuestionScript(
  userMessage: string,
  conversationId: string,
  abortSignal: AbortSignal,
  onToken: (token: string) => void,
  selectedModel: string,
  useStreaming: boolean,
  options?: {
    maxTokens?: number
    availableModels?: string[]
    historyWindowMessages?: number
    historySummaryMaxChars?: number
  },
): Promise<{ assistantText: string; finishReason: StreamFinishReason; usage: AskQuestionUsage | null }> {
  const scriptPath = path.join(process.cwd(), "dedalus_stuff", "scripts", "askQuestion.py")
  const globalJsonPath = path.join(process.cwd(), "dedalus_stuff", "globalInfo.json")
  const conversationJsonPath = path.join(
    process.cwd(),
    "dedalus_stuff",
    "conversations",
    `${conversationId}.json`,
  )

  const args = [
    "-u",
    scriptPath,
    "--message",
    userMessage,
    "--conversation-id",
    conversationId,
    "--conversation-json-path",
    conversationJsonPath,
    "--global-json-path",
    globalJsonPath,
    "--no-update-global-info",
    useStreaming ? "--stream" : "--no-stream",
    "--model",
    selectedModel,
  ]
  if (options?.maxTokens && Number.isFinite(options.maxTokens) && options.maxTokens > 0) {
    args.push("--max-tokens", String(Math.floor(options.maxTokens)))
  }
  if (Array.isArray(options?.availableModels) && options.availableModels.length > 0) {
    args.push("--available-models", options.availableModels.join(","))
  }
  if (
    options?.historyWindowMessages &&
    Number.isFinite(options.historyWindowMessages) &&
    options.historyWindowMessages > 0
  ) {
    args.push("--history-window-messages", String(Math.floor(options.historyWindowMessages)))
  }
  if (
    options?.historySummaryMaxChars &&
    Number.isFinite(options.historySummaryMaxChars) &&
    options.historySummaryMaxChars > 0
  ) {
    args.push("--history-summary-max-chars", String(Math.floor(options.historySummaryMaxChars)))
  }

  return await new Promise((resolve, reject) => {
    const child = spawn("python", args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdoutBuffer = ""
    let stderrBuffer = ""
    let assistantText = ""
    let finishReason: StreamFinishReason = "stop"
    let reportedError: string | null = null
    let usage: AskQuestionUsage | null = null

    const onAbort = () => {
      child.kill("SIGTERM")
    }
    abortSignal.addEventListener("abort", onAbort, { once: true })

    const consumeEventLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed) {
        return
      }

      let event: AskQuestionEvent
      try {
        event = JSON.parse(trimmed) as AskQuestionEvent
      } catch {
        return
      }

      if (event.type === "token" && typeof event.token === "string") {
        onToken(event.token)
        assistantText += event.token
        return
      }

      if (event.type === "final") {
        if (typeof event.text === "string" && event.text.length > 0) {
          assistantText = event.text
        }
        if (typeof event.finish_reason === "string") {
          finishReason = normalizeFinishReason(event.finish_reason)
        }
        return
      }

      if (event.type === "usage") {
        const promptTokens =
          typeof event.prompt_tokens === "number" && Number.isFinite(event.prompt_tokens)
            ? Math.max(0, Math.round(event.prompt_tokens))
            : 0
        const completionTokens =
          typeof event.completion_tokens === "number" && Number.isFinite(event.completion_tokens)
            ? Math.max(0, Math.round(event.completion_tokens))
            : 0
        const totalTokens =
          typeof event.total_tokens === "number" && Number.isFinite(event.total_tokens)
            ? Math.max(0, Math.round(event.total_tokens))
            : promptTokens + completionTokens

        const nextUsage: AskQuestionUsage = {
          promptTokens,
          completionTokens,
          totalTokens,
        }
        if (typeof event.carbon_kg === "number" && Number.isFinite(event.carbon_kg) && event.carbon_kg >= 0) {
          nextUsage.carbonKg = event.carbon_kg
        }
        usage = nextUsage
        return
      }

      if (event.type === "error" && typeof event.message === "string" && event.message.trim()) {
        reportedError = event.message
      }
    }

    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk
      let newlineIndex = stdoutBuffer.indexOf("\n")

      while (newlineIndex !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex)
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
        consumeEventLine(line)
        newlineIndex = stdoutBuffer.indexOf("\n")
      }
    })

    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk: string) => {
      stderrBuffer += chunk
    })

    child.on("error", (error) => {
      abortSignal.removeEventListener("abort", onAbort)
      reject(error)
    })

    child.on("close", (code) => {
      abortSignal.removeEventListener("abort", onAbort)

      if (stdoutBuffer.trim()) {
        consumeEventLine(stdoutBuffer)
      }

      if (reportedError) {
        reject(new Error(reportedError))
        return
      }

      if (code !== 0) {
        const stderrText = stderrBuffer.trim()
        reject(new Error(stderrText || `askQuestion.py exited with code ${code ?? "unknown"}.`))
        return
      }

      if (!assistantText.trim()) {
        reject(new Error("askQuestion.py returned an empty assistant response."))
        return
      }

      resolve({ assistantText, finishReason, usage })
    })
  })
}

function shouldRetryWithoutScriptStreaming(error: unknown): boolean {
  const normalized = getErrorMessage(error).toLowerCase()
  if (!normalized) {
    return false
  }

  return (
    normalized.includes("empty assistant response") ||
    normalized.includes("returned no completion choices")
  )
}

function isRetryableDedalusServerError(error: unknown): boolean {
  const normalized = getErrorMessage(error).toLowerCase()
  if (!normalized) {
    return false
  }

  return (
    normalized.includes("dedalus request failed with status 500") ||
    normalized.includes("failed to reach dedalus api")
  )
}

function getModelExecutionChain(routingDecision: RoutingDecision): string[] {
  const candidates: string[] = [routingDecision.model]
  if (routingDecision.allowEscalation && routingDecision.heavyModel !== routingDecision.model) {
    candidates.push(routingDecision.heavyModel)
  }

  if (ENABLE_MODEL_FAILOVER && candidates.length < 2 && CHAT_MODELS.has(RELIABLE_FALLBACK_MODEL)) {
    candidates.push(RELIABLE_FALLBACK_MODEL)
  }

  const deduped: string[] = []
  for (const candidate of candidates) {
    if (!CHAT_MODELS.has(candidate)) {
      continue
    }
    if (!deduped.includes(candidate)) {
      deduped.push(candidate)
    }
    if (deduped.length >= 2) {
      break
    }
  }

  if (deduped.length === 0) {
    return [DEFAULT_MODEL]
  }

  return deduped
}

function logRecovery(message: string, payload: Record<string, unknown>): void {
  if (!ENABLE_RECOVERY_LOGS) {
    return
  }
  console.warn(message, payload)
}

export async function POST(req: Request) {
  let releaseConversationLock: (() => void) | null = null

  try {
    const dedalusApiKey = process.env.DEDALUS_API_KEY?.trim()
    if (!dedalusApiKey || dedalusApiKey === "your_key_here") {
      return Response.json(
        { error: "Missing or invalid DEDALUS_API_KEY. Set a valid key and restart the server." },
        { status: 500 },
      )
    }

    const url = new URL(req.url)
    const requestBody = (await req.json()) as {
      messages?: UIMessage[]
      conversationId?: unknown
      model?: unknown
      webSearchEnabled?: unknown
      deepSearchEnabled?: unknown
      imageGenerationEnabled?: unknown
      imageModel?: unknown
      attachments?: unknown
      carbonSettings?: unknown
    }
    const messages = Array.isArray(requestBody.messages) ? requestBody.messages : []
    const webSearchEnabled = requestBody.webSearchEnabled === true
    const deepSearchEnabled = requestBody.deepSearchEnabled === true
    const imageGenerationEnabled = requestBody.imageGenerationEnabled === true
    const requestedImageModel = sanitizeRequestedImageModel(requestBody.imageModel)
    const uploadedOcrAttachments = decodeOcrAttachments(requestBody.attachments)
    const requestedConversationIdFromBody =
      typeof requestBody.conversationId === "string" ? requestBody.conversationId : undefined
    const requestedConversationId =
      requestedConversationIdFromBody ?? url.searchParams.get("conversationId")

    let sanitizedRequestedConversationId = sanitizeConversationId(requestedConversationId)
    if (!sanitizedRequestedConversationId) {
      sanitizedRequestedConversationId = sanitizeConversationId(await getActiveConversationIdForUi())
    }

    if (!sanitizedRequestedConversationId) {
      return Response.json(
        {
          error:
            "No active conversation selected. Create or select a conversation before sending a message.",
        },
        { status: 400 },
      )
    }

    const requestedModel = sanitizeRequestedModel(requestBody.model)
    const selectedModel =
      requestedModel || process.env.DEDALUS_MODEL?.trim() || DEFAULT_MODEL
    const selectedImageModel =
      requestedImageModel || (isImageModel(selectedModel) ? selectedModel : DEFAULT_IMAGE_MODEL)
    const carbonSettings = sanitizeCarbonRoutingSettings(requestBody.carbonSettings)

    releaseConversationLock = await acquireConversationLock(sanitizedRequestedConversationId)

    let conversationId: string
    try {
      conversationId = await persistPromptSnapshot(sanitizedRequestedConversationId, messages, {
        allowCreate: false,
        modelName: selectedModel,
      })
    } catch (error) {
      releaseConversationLock()
      releaseConversationLock = null

      const fileError = error as NodeJS.ErrnoException
      if (fileError.code === "ENOENT") {
        return Response.json(
          { error: `Conversation "${sanitizedRequestedConversationId}" was not found.` },
          { status: 404 },
        )
      }
      throw error
    }

    const latestUserMessage = getLatestUserMessage(messages)
    if (!latestUserMessage) {
      if (releaseConversationLock) {
        releaseConversationLock()
        releaseConversationLock = null
      }
      return Response.json({ error: "No user message found in chat payload." }, { status: 400 })
    }

    const hasAttachmentPayload = Array.isArray(requestBody.attachments) && requestBody.attachments.length > 0
    if (hasAttachmentPayload && uploadedOcrAttachments.length === 0) {
      if (releaseConversationLock) {
        releaseConversationLock()
        releaseConversationLock = null
      }
      return Response.json({ error: "No valid OCR attachments were found in the request." }, { status: 400 })
    }

    const toolsEnabledForRouting =
      webSearchEnabled || deepSearchEnabled || uploadedOcrAttachments.length > 0
    const routingDecision = buildRoutingDecision({
      latestUserMessage,
      selectedModel,
      toolsEnabled: toolsEnabledForRouting,
      settings: carbonSettings,
    })

    let promptForModel = latestUserMessage
    if (uploadedOcrAttachments.length > 0) {
      try {
        const attachmentContext = await buildOcrPromptContext(
          uploadedOcrAttachments,
          dedalusApiKey,
          req.signal,
        )
        promptForModel = `${latestUserMessage}\n\n<attached_ocr_context>\n${attachmentContext}\n</attached_ocr_context>`
      } catch (error) {
        console.error("Failed to parse OCR attachments. Continuing without attachment context.", error)
        logRecovery("Continuing without parsed OCR attachment context.", {
          conversationId,
          attachmentCount: uploadedOcrAttachments.length,
          reason: getErrorMessage(error),
        })
        promptForModel = `${latestUserMessage}\n\nThe user attached files/links, but OCR extraction failed on the server. Do not infer or hallucinate document contents. Ask the user to re-upload the file or share a direct https URL and try again.`
      }
    }

    if (webSearchEnabled) {
      const webCacheKey = `web:${latestUserMessage.trim().toLowerCase()}`
      try {
        let webContext = getCachedToolContext(webCacheKey)
        if (!webContext) {
          webContext = await buildWebSearchContext(latestUserMessage, dedalusApiKey, req.signal)
          if (webContext.trim()) {
            setCachedToolContext(webCacheKey, webContext)
          }
        }
        if (webContext.trim()) {
          promptForModel = `${promptForModel}\n\n<web_search_context>\n${webContext}\n</web_search_context>`
        }
      } catch (error) {
        console.error("Failed to build web search context. Continuing without web context.", error)
        logRecovery("Continuing without web search context.", {
          conversationId,
          reason: getErrorMessage(error),
        })
        promptForModel = `${promptForModel}\n\nWeb search was requested but failed on the server. Do not invent web findings. If needed, say web search is temporarily unavailable.`
      }
    }

    if (deepSearchEnabled) {
      const deepSearchCacheKey = `deep:${latestUserMessage.trim().toLowerCase()}`
      try {
        let deepSearchContext = getCachedToolContext(deepSearchCacheKey)
        if (!deepSearchContext) {
          deepSearchContext = await buildDeepSearchContext(latestUserMessage, dedalusApiKey, req.signal)
          if (deepSearchContext.trim()) {
            setCachedToolContext(deepSearchCacheKey, deepSearchContext)
          }
        }
        if (deepSearchContext.trim()) {
          promptForModel = `${promptForModel}\n\n<deep_search_context>\n${deepSearchContext}\n</deep_search_context>`
        }
      } catch (error) {
        console.error("Failed to build deep search context. Continuing without deep search context.", error)
        logRecovery("Continuing without deep search context.", {
          conversationId,
          reason: getErrorMessage(error),
        })
        promptForModel = `${promptForModel}\n\nDeep search was requested but failed on the server. Do not invent deep-search findings. If needed, say deep search is temporarily unavailable.`
      }
    }

    // Keep fallback prompt-token reporting anchored to the user's message text.
    // Tool-injected context can be much larger and distorts UI-facing estimates.
    const estimatedPromptTokens = splitIntoStreamingTokens(latestUserMessage).length
    const stream = createUIMessageStream({
      originalMessages: messages,
      onError: (error) => {
        console.error("Chat stream failed.", error)
        return toClientError(error)
      },
      execute: async ({ writer }) => {
        const textPartId = `text-${Date.now()}`
        const messageId = `assistant-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
        let finishReason: StreamFinishReason = "stop"
        let sawTokenEvent = false
        let streamClosed = false
        let wakeDrain: (() => void) | null = null
        const pendingTokens: string[] = []
        let estimatedCompletionTokens = 0
        let usageSummary: AskQuestionUsage | null = null

        const notifyDrain = () => {
          if (!wakeDrain) {
            return
          }

          const resolve = wakeDrain
          wakeDrain = null
          resolve()
        }

        const enqueueText = (text: string) => {
          if (!text) {
            return
          }

          const tokens = splitIntoStreamingTokens(text)
          if (tokens.length === 0) {
            return
          }
          estimatedCompletionTokens += tokens.length

          for (const token of tokens) {
            pendingTokens.push(token)
          }
          notifyDrain()
        }

        const drainTokens = async () => {
          while (!streamClosed || pendingTokens.length > 0) {
            if (pendingTokens.length === 0) {
              await new Promise<void>((resolve) => {
                wakeDrain = resolve
              })
              continue
            }

            if (!streamClosed && pendingTokens.length < STREAM_TOKENS_PER_FLUSH) {
              await waitForDrainSignal(
                req.signal,
                (resolver) => {
                  wakeDrain = resolver
                },
                16,
              )
              continue
            }

            const chunkSize = streamClosed
              ? Math.min(STREAM_TOKENS_PER_FLUSH, pendingTokens.length)
              : STREAM_TOKENS_PER_FLUSH
            const delta = pendingTokens.splice(0, chunkSize).join("")
            if (!delta) {
              continue
            }

            writer.write({ type: "text-delta", id: textPartId, delta })
            if (STREAM_DELTA_DELAY_MS > 0 && pendingTokens.length > 0) {
              await waitFor(STREAM_DELTA_DELAY_MS, req.signal)
            }
          }
        }

        const drainPromise = drainTokens()
        let assistantText = ""
        let streamCompleted = false
        let modelUsedForResponse = routingDecision.model

        writer.write({ type: "start", messageId })
        writer.write({ type: "start-step" })
        writer.write({ type: "text-start", id: textPartId })
        try {
          if (imageGenerationEnabled || isImageModel(selectedModel)) {
            assistantText = await generateImageMarkdown(promptForModel, selectedImageModel, req.signal)
            modelUsedForResponse = selectedImageModel
            sawTokenEvent = true
            enqueueText(assistantText)
            streamCompleted = true
            return
          }

          let pythonResult:
            | { assistantText: string; finishReason: StreamFinishReason; usage: AskQuestionUsage | null }
            | null = null
          let lastModelError: unknown = null
          const modelCandidates = getModelExecutionChain(routingDecision)
          const scriptOptions = {
            maxTokens: routingDecision.maxTokens,
            availableModels: routingDecision.availableModels,
            historyWindowMessages: routingDecision.historyWindowMessages,
            historySummaryMaxChars: routingDecision.historySummaryMaxChars,
          }

          for (const candidateModel of modelCandidates) {
            const maxAttempts = ENABLE_MODEL_FAILOVER && candidateModel === modelCandidates[0] ? 2 : 1

            for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
              try {
                try {
                  pythonResult = await streamFromAskQuestionScript(
                    promptForModel,
                    conversationId,
                    req.signal,
                    (token) => {
                      sawTokenEvent = true
                      enqueueText(token)
                    },
                    candidateModel,
                    true,
                    scriptOptions,
                  )
                } catch (error) {
                  if (!shouldRetryWithoutScriptStreaming(error)) {
                    throw error
                  }

                  logRecovery("Retrying askQuestion.py without upstream token streaming.", {
                    conversationId,
                    selectedModel: candidateModel,
                    reason: getErrorMessage(error),
                  })

                  pythonResult = await streamFromAskQuestionScript(
                    promptForModel,
                    conversationId,
                    req.signal,
                    (token) => {
                      sawTokenEvent = true
                      enqueueText(token)
                    },
                    candidateModel,
                    false,
                    scriptOptions,
                  )
                }

                modelUsedForResponse = candidateModel
                usageSummary = pythonResult.usage
                break
              } catch (error) {
                lastModelError = error
                const retryable = isRetryableDedalusServerError(error)
                const hasAttemptsLeft = attempt < maxAttempts

                if (retryable && hasAttemptsLeft) {
                  await waitFor(300 * attempt, req.signal)
                  continue
                }

                break
              }
            }

            if (pythonResult) {
              break
            }

            if (
              lastModelError &&
              isRetryableDedalusServerError(lastModelError) &&
              candidateModel !== modelCandidates.at(-1)
            ) {
              logRecovery("Falling back to another model after Dedalus upstream failure.", {
                conversationId,
                failedModel: candidateModel,
                nextModel: modelCandidates[modelCandidates.indexOf(candidateModel) + 1],
                reason: getErrorMessage(lastModelError),
              })
            }
          }

          if (!pythonResult) {
            throw (lastModelError ?? new Error("Dedalus did not return a response."))
          }

          finishReason = pythonResult.finishReason
          assistantText = pythonResult.assistantText

          if (!sawTokenEvent && pythonResult.assistantText) {
            enqueueText(pythonResult.assistantText)
          }
          streamCompleted = true
        } finally {
          streamClosed = true
          notifyDrain()
          await drainPromise

          if (streamCompleted && assistantText.trim()) {
            try {
              if (
                modelUsedForResponse !== routingDecision.model &&
                modelUsedForResponse !== selectedModel
              ) {
                await persistPromptSnapshot(conversationId, messages, {
                  allowCreate: false,
                  modelName: modelUsedForResponse,
                })
              }
              await appendAssistantCompletion(conversationId, assistantText)
            } catch (error) {
              console.error("Failed to append assistant completion to master copy.", error)
            }
          }

          if (releaseConversationLock) {
            releaseConversationLock()
            releaseConversationLock = null
          }
        }

        if (streamCompleted) {
          const promptTokens = usageSummary?.promptTokens ?? estimatedPromptTokens
          const completionTokens = usageSummary?.completionTokens ?? estimatedCompletionTokens
          const totalTokens = usageSummary?.totalTokens ?? promptTokens + completionTokens
          const footprintKg =
            usageSummary?.carbonKg ??
            Math.max(0, totalTokens) * FALLBACK_KG_PER_TOKEN
          writer.write({
            type: "data-carbon-stats",
            data: {
              promptTokens,
              completionTokens,
              totalTokens,
              footprintKg,
              model: modelUsedForResponse,
              source: usageSummary ? "provider-usage" : "estimated",
            },
          })
          writer.write({ type: "text-end", id: textPartId })
          writer.write({ type: "finish-step" })
          writer.write({ type: "finish", finishReason })
        }
      },
    })

    return createUIMessageStreamResponse({ stream })
  } catch (error) {
    if (releaseConversationLock) {
      releaseConversationLock()
      releaseConversationLock = null
    }

    console.error("Failed to process chat request.", error)
    return Response.json({ error: toClientError(error) }, { status: 500 })
  }
}
