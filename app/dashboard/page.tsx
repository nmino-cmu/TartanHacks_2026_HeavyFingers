"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, Cpu, Leaf, MessageSquareText, RefreshCw, Users } from "lucide-react"

interface DashboardSummary {
  conversationCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  footprintKg: number
  averageConversationFootprintKg: number
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

interface CarbonDashboardResponse {
  generatedAt: string
  selectedUserId: string
  proofOfConceptSingleUser: boolean
  assumptions: {
    mode: string
    charsPerToken: number
    kgPerToken: number
  }
  summary: DashboardSummary
  availableUsers: UserMetric[]
  users: UserMetric[]
  conversations: ConversationMetric[]
}

function formatNumber(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString()
}

function formatKg(value: number): string {
  if (value >= 1) {
    return `${value.toFixed(2)} kg CO2e`
  }
  return `${(value * 1000).toFixed(2)} g CO2e`
}

function formatDate(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return "unknown"
  }
  return parsed.toLocaleString()
}

export default function CarbonDashboardPage() {
  const [selectedUserId, setSelectedUserId] = useState("all")
  const [data, setData] = useState<CarbonDashboardResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async (userId: string, isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }
    setError(null)

    try {
      const query = userId !== "all" ? `?userId=${encodeURIComponent(userId)}` : ""
      const response = await fetch(`/api/carbon-dashboard${query}`, { cache: "no-store" })
      if (!response.ok) {
        throw new Error(`Dashboard API failed with status ${response.status}`)
      }

      const payload = (await response.json()) as CarbonDashboardResponse
      setData(payload)
    } catch (requestError) {
      console.error("Failed to load carbon dashboard data.", requestError)
      setError(requestError instanceof Error ? requestError.message : "Failed to load dashboard data.")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadData("all")
  }, [loadData])

  const maxConversationFootprint = useMemo(() => {
    if (!data || data.conversations.length === 0) {
      return 0
    }
    return Math.max(...data.conversations.map((conversation) => conversation.footprintKg))
  }, [data])

  const selectedUserLabel = useMemo(() => {
    if (!data) {
      return "All users"
    }
    if (selectedUserId === "all") {
      return "All users"
    }
    return data.availableUsers.find((user) => user.userId === selectedUserId)?.userName || selectedUserId
  }, [data, selectedUserId])

  const hasRows = (data?.conversations.length ?? 0) > 0

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#0b1117] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.18),_transparent_48%),radial-gradient(circle_at_80%_20%,_rgba(16,185,129,0.15),_transparent_40%),linear-gradient(180deg,_#0b1117_0%,_#070b10_65%,_#05080c_100%)]" />
      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-slate-700/60 bg-slate-950/55 p-5 shadow-[0_25px_80px_rgba(2,6,23,0.75)] backdrop-blur-md">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
                <Leaf className="h-3.5 w-3.5" />
                Commercial Carbon Monitor
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
                Conversation Emissions Dashboard
              </h1>
              <p className="max-w-2xl text-sm text-slate-300">
                Track estimated carbon usage by user and conversation, with operational visibility for product and
                compliance reporting.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void loadData(selectedUserId, true)}
                disabled={isLoading || isRefreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-600/70 bg-slate-900/70 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400/80 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-600/70 bg-slate-900/70 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400/80 hover:bg-slate-800"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Chat
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-slate-700/70 bg-slate-900/65 p-4 shadow-[0_10px_35px_rgba(2,6,23,0.6)]">
            <p className="text-xs uppercase tracking-wider text-slate-400">Total Footprint</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-200">
              {data ? formatKg(data.summary.footprintKg) : "—"}
            </p>
          </article>
          <article className="rounded-2xl border border-slate-700/70 bg-slate-900/65 p-4 shadow-[0_10px_35px_rgba(2,6,23,0.6)]">
            <p className="text-xs uppercase tracking-wider text-slate-400">Total Tokens</p>
            <p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-cyan-200">
              <Cpu className="h-5 w-5" />
              {data ? formatNumber(data.summary.totalTokens) : "—"}
            </p>
          </article>
          <article className="rounded-2xl border border-slate-700/70 bg-slate-900/65 p-4 shadow-[0_10px_35px_rgba(2,6,23,0.6)]">
            <p className="text-xs uppercase tracking-wider text-slate-400">Conversations</p>
            <p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-indigo-200">
              <MessageSquareText className="h-5 w-5" />
              {data ? formatNumber(data.summary.conversationCount) : "—"}
            </p>
          </article>
          <article className="rounded-2xl border border-slate-700/70 bg-slate-900/65 p-4 shadow-[0_10px_35px_rgba(2,6,23,0.6)]">
            <p className="text-xs uppercase tracking-wider text-slate-400">Active Filter</p>
            <p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-slate-100">
              <Users className="h-5 w-5 text-slate-300" />
              {selectedUserLabel}
            </p>
          </article>
        </section>

        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/55 p-4 shadow-[0_15px_45px_rgba(2,6,23,0.55)]">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[220px] flex-1">
              <label htmlFor="user-filter" className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                Filter by User
              </label>
              <select
                id="user-filter"
                value={selectedUserId}
                onChange={(event) => {
                  const nextUserId = event.target.value
                  setSelectedUserId(nextUserId)
                  void loadData(nextUserId)
                }}
                className="h-11 w-full rounded-xl border border-slate-600 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none ring-0 transition focus:border-cyan-400"
              >
                <option value="all">All users</option>
                {(data?.availableUsers ?? []).map((user) => (
                  <option key={user.userId} value={user.userId}>
                    {user.userName} ({user.userId})
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
              {data ? `Last updated ${formatDate(data.generatedAt)}` : "Loading dataset..."}
            </div>
          </div>
          {data?.proofOfConceptSingleUser ? (
            <p className="mt-3 text-xs text-slate-400">
              Proof-of-concept mode: currently one user is available, but this filter is wired for multi-user growth.
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/55 p-4 shadow-[0_15px_45px_rgba(2,6,23,0.55)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-100">Usage by Conversation</h2>
            <p className="text-xs text-slate-400">Heuristic estimate from stored conversation text</p>
          </div>

          {isLoading ? (
            <div className="rounded-xl border border-slate-700/70 bg-slate-950/50 px-4 py-6 text-sm text-slate-400">
              Loading conversation metrics...
            </div>
          ) : hasRows ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700/70 text-xs uppercase tracking-[0.12em] text-slate-400">
                    <th className="px-3 py-3 font-medium">Conversation</th>
                    <th className="px-3 py-3 font-medium">User</th>
                    <th className="px-3 py-3 font-medium">Messages</th>
                    <th className="px-3 py-3 font-medium">Tokens</th>
                    <th className="px-3 py-3 font-medium">Footprint</th>
                    <th className="px-3 py-3 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.conversations.map((conversation) => {
                    const width =
                      maxConversationFootprint > 0
                        ? Math.max(6, Math.round((conversation.footprintKg / maxConversationFootprint) * 100))
                        : 0

                    return (
                      <tr
                        key={conversation.conversationId}
                        className="border-b border-slate-800/80 text-slate-100 transition hover:bg-slate-800/35"
                      >
                        <td className="px-3 py-3 align-top">
                          <p className="font-medium text-slate-100">{conversation.title}</p>
                          <p className="text-xs text-slate-400">{conversation.conversationId}</p>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <p className="font-medium">{conversation.userName}</p>
                          <p className="text-xs text-slate-400">{conversation.userId}</p>
                        </td>
                        <td className="px-3 py-3 align-top">{formatNumber(conversation.messageCount)}</td>
                        <td className="px-3 py-3 align-top">
                          <p>{formatNumber(conversation.totalTokens)}</p>
                          <p className="text-xs text-slate-400">
                            P {formatNumber(conversation.promptTokens)} • C {formatNumber(conversation.completionTokens)}
                          </p>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <p>{formatKg(conversation.footprintKg)}</p>
                          <div className="mt-1 h-1.5 w-40 rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top text-xs text-slate-300">{formatDate(conversation.updatedAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-700/70 bg-slate-950/50 px-4 py-6 text-sm text-slate-400">
              No conversation data is available for this user filter yet.
            </div>
          )}
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          {(data?.users ?? []).map((user) => (
            <article
              key={user.userId}
              className="rounded-2xl border border-slate-700/70 bg-slate-900/55 p-4 shadow-[0_12px_32px_rgba(2,6,23,0.45)]"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{user.userName}</p>
                  <p className="text-xs text-slate-400">{user.userId}</p>
                </div>
                <p className="rounded-full border border-slate-600/80 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-300">
                  {formatNumber(user.conversationCount)} conversations
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-slate-700/70 bg-slate-950/45 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Footprint</p>
                  <p className="mt-1 font-semibold text-emerald-200">{formatKg(user.footprintKg)}</p>
                </div>
                <div className="rounded-xl border border-slate-700/70 bg-slate-950/45 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Tokens</p>
                  <p className="mt-1 font-semibold text-cyan-200">{formatNumber(user.totalTokens)}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-400">Last activity: {formatDate(user.lastActiveAt)}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  )
}
