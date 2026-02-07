"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  ArrowRight,
  CircleDollarSign,
  DownloadCloud,
  Leaf,
  RefreshCw,
  ShieldCheck,
  Wallet2,
} from "lucide-react"

type WalletData = {
  address?: string
  seed?: string
  explorer_url?: string
  file?: string
  account_data?: {
    Account?: string
    Balance?: string
    Sequence?: number
  }
  validated_ledger?: {
    ledger_index?: number
  }
}

type ApiResponse =
  | { status: "ok"; data: any }
  | { status: "error"; error: string }

const DEFAULT_DESTINATION = "rLjd5uRaxpi84pcn9ikbiMWPGqYfLrh15w" // Every.org testnet address

function formatBalance(drops?: string) {
  if (!drops) return "—"
  const asNumber = Number(drops)
  if (Number.isNaN(asNumber)) return "—"
  return `${(asNumber / 1_000_000).toFixed(2)} XRP`
}

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<"create" | "refresh" | "send" | null>(null)
  const [seedVisible, setSeedVisible] = useState(false)
  const [amount, setAmount] = useState("10")
  const [destination, setDestination] = useState(DEFAULT_DESTINATION)

  const hasWallet = Boolean(wallet?.address)

  const balance = useMemo(() => formatBalance(wallet?.account_data?.Balance), [wallet])

  async function request(
    method: "GET" | "POST",
    body?: Record<string, any>,
  ): Promise<ApiResponse> {
    const res = await fetch("/api/wallet" + (method === "GET" && body?.refresh ? "?refresh=true" : ""), {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "POST" ? JSON.stringify(body) : undefined,
      cache: "no-store",
    })
    return res.json()
  }

  async function loadWallet(refresh = false) {
    setLoading(true)
    const response = await request("GET", { refresh })
    if (response.status === "ok") {
      setWallet(response.data)
    } else {
      toast({ title: "Unable to load wallet", description: response.error, variant: "destructive" })
      setWallet(null)
    }
    setLoading(false)
  }

  async function handleCreate() {
    setBusy("create")
    const response = await request("POST", { action: "create", force: true })
    if (response.status === "ok") {
      setWallet(response.data)
      toast({ title: "Fresh testnet wallet", description: "Funded via XRPL faucet." })
    } else {
      toast({ title: "Creation failed", description: response.error, variant: "destructive" })
    }
    setBusy(null)
  }

  async function handleRefresh() {
    setBusy("refresh")
    await loadWallet(true)
    setBusy(null)
  }

  async function handleSendCheck(e: React.FormEvent) {
    e.preventDefault()
    if (!hasWallet) {
      toast({ title: "Create a wallet first", variant: "destructive" })
      return
    }
    setBusy("send")
    const response = await request("POST", {
      action: "send-check",
      destination,
      amount,
    })
    if (response.status === "ok") {
      toast({
        title: "Check created",
        description: `Sent ${amount} XRP to ${destination.slice(0, 6)}…`,
      })
    } else {
      toast({ title: "Send failed", description: response.error, variant: "destructive" })
    }
    setBusy(null)
  }

  useEffect(() => {
    loadWallet()
  }, [])

  return (
    <div className="mosaic-bg min-h-dvh pb-16">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pt-10">
        <div className="flex items-center justify-between">
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/80 px-3 py-1.5 text-sm font-medium text-primary shadow-sm hover:border-primary/40 hover:shadow-md transition"
          >
            ← Back to Chat
          </a>
        </div>

        <div className="overflow-hidden rounded-3xl border border-primary/15 bg-white/80 shadow-xl backdrop-blur">
          <div className="relative isolate overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-700 via-emerald-500 to-lime-400 opacity-80" />
            <div className="absolute inset-y-0 right-[-10%] h-[120%] w-[45%] rotate-6 bg-white/15 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-3 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-white shadow-lg backdrop-blur">
                  <Wallet2 className="h-6 w-6" />
                </div>
                <div className="space-y-1 text-white">
                  <p className="text-sm uppercase tracking-[0.2em]">XRPL Testnet</p>
                  <h1 className="text-3xl font-semibold leading-tight">Wallet Control Center</h1>
                  <p className="text-sm text-white/80">
                    Create, inspect, and send test checks using the local Python helper in <code className="rounded bg-white/15 px-1.5 py-0.5 text-xs">wallet/wallet.py</code>.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-white/15 text-white backdrop-blur">Testnet only</Badge>
                <Badge variant="secondary" className="bg-black/20 text-white">
                  Seed stays local
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-5">
          <Card className="md:col-span-3 border-border/70 bg-card/90 shadow-lg">
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle>Wallet Snapshot</CardTitle>
                <CardDescription>Data is read from wallet/wallets/wallet.json</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={busy === "refresh" || loading}
                  className="gap-2"
                >
                  <RefreshCw className={cn("h-4 w-4", busy === "refresh" && "animate-spin")} />
                  Refresh
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={busy === "create"}
                  className="gap-2"
                >
                  <DownloadCloud className="h-4 w-4" />
                  {hasWallet ? "Recreate" : "Create"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 rounded-2xl border border-border/60 bg-muted/40 p-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Address</p>
                  <p className="font-mono text-sm break-all text-foreground">
                    {loading ? "Loading…" : wallet?.address ?? "Not created"}
                  </p>
                  {wallet?.explorer_url && (
                    <a
                      href={wallet.explorer_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 underline underline-offset-4"
                    >
                      View on Testnet Explorer
                      <ArrowRight className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <p className="text-2xl font-semibold text-foreground">{loading ? "—" : balance}</p>
                  <p className="text-xs text-muted-foreground">
                    Sequence {wallet?.account_data?.Sequence ?? "—"} · Ledger{" "}
                    {wallet?.validated_ledger?.ledger_index ?? "—"}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Seed (local only)</p>
                    <p
                      className={cn(
                        "font-mono text-sm",
                        !seedVisible && "blur-sm brightness-75 select-none",
                      )}
                    >
                      {wallet?.seed ?? "Hidden"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      File: {wallet?.file ?? "wallet/wallets/wallet.json"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSeedVisible((v) => !v)}
                    disabled={!wallet?.seed}
                  >
                    {seedVisible ? "Hide" : "Reveal"}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Your seed stays on disk; the API shells into <code>wallet.py</code> for signing.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/60 px-3 py-3">
                  <ShieldCheck className="h-5 w-5 text-emerald-700" />
                  <div>
                    <p className="text-sm font-medium">Seed stored on disk</p>
                    <p className="text-xs text-muted-foreground">wallet/wallets/wallet.json</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/60 px-3 py-3">
                  <Leaf className="h-5 w-5 text-emerald-700" />
                  <div>
                    <p className="text-sm font-medium">Funded via Faucet</p>
                    <p className="text-xs text-muted-foreground">XRPL Testnet tokens only</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 border-border/70 bg-card/90 shadow-lg">
            <CardHeader>
              <CardTitle>Send a Test Check</CardTitle>
              <CardDescription>
                Builds a <code>CheckCreate</code> transaction via <code>wallet.py</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSendCheck}>
                <div className="space-y-2">
                  <Label htmlFor="amount" className="flex items-center gap-2 text-sm">
                    <CircleDollarSign className="h-4 w-4 text-emerald-700" />
                    Amount (XRP)
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    min="1"
                    step="0.1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    placeholder="10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="destination" className="text-sm">
                    Destination address
                  </Label>
                  <Input
                    id="destination"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    required
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">
                    Pre-filled with Every.org&apos;s donation address. You can use any XRPL testnet account.
                  </p>
                </div>
                <Separator />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-muted-foreground">
                    Uses your locally stored seed to sign the check.
                  </div>
                  <Button type="submit" disabled={busy === "send"} className="gap-2">
                    <ArrowRight className="h-4 w-4" />
                    Create Check
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
