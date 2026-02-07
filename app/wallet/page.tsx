"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  ArrowRight,
  CircleDollarSign,
  DownloadCloud,
  HeartHandshake,
  Leaf,
  KeyRound,
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
const CHARITIES = [
  { id: "earthday.org", label: "Earthday.org (EIN 133798288)" },
  { id: "GivePact", label: "GivePact (EIN 920504087)" },
  { id: "Environmental Defense Fund", label: "Environmental Defense Fund (EIN 116107128)" },
  { id: "custom", label: "Custom address" },
]

function formatBalance(drops?: string) {
  if (!drops) return "—"
  const asNumber = Number(drops)
  if (Number.isNaN(asNumber)) return "—"
  return `${(asNumber / 1_000_000).toFixed(2)} XRP`
}

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletData | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<"create" | "refresh" | "send" | "import" | "charity" | null>(null)
  const [seedVisible, setSeedVisible] = useState(false)
  const [amount, setAmount] = useState("10")
  const [destination, setDestination] = useState(DEFAULT_DESTINATION)
  const [destinationMode, setDestinationMode] = useState<"test" | "real">("test")
  const [destinationTest, setDestinationTest] = useState(DEFAULT_DESTINATION)
  const [destinationReal, setDestinationReal] = useState("")
  const [importSeed, setImportSeed] = useState("")
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false)
  const [selectedCharity, setSelectedCharity] = useState<"custom" | string>("custom")
  const [donorName, setDonorName] = useState("")
  const [donorEmail, setDonorEmail] = useState("")

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

  function handleCreateClick() {
    if (hasWallet) {
      setConfirmCreateOpen(true)
      return
    }
    handleCreate()
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
    if (!destination.trim()) {
      toast({ title: "Add a destination", description: "Choose a charity or enter a wallet address.", variant: "destructive" })
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

  async function handleSelectCharity(value: string) {
    setSelectedCharity(value as "custom" | string)
    if (value === "custom") {
      setDestination("")
      return
    }

    setBusy("charity")
    try {
      const res = await fetch("/api/charity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          charity: value,
          name: donorName || undefined,
          email: donorEmail || undefined,
        }),
      })
      const payload = await res.json()
      if (payload.status === "ok" && payload.data?.address) {
        setDestination(payload.data.address)
        toast({ title: "Charity selected", description: "Destination address filled automatically." })
      } else {
        throw new Error(payload.error || "Unable to fetch address")
      }
    } catch (error: any) {
      toast({ title: "Could not load charity address", description: error?.message ?? "Unknown error", variant: "destructive" })
      setSelectedCharity("custom")
    }
    setBusy(null)
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    const trimmedSeed = importSeed.trim()
    if (!trimmedSeed) {
      toast({ title: "Enter a seed", description: "Paste the secret seed to import.", variant: "destructive" })
      return
    }

    setBusy("import")
    const response = await request("POST", { action: "import", seed: trimmedSeed })
    if (response.status === "ok") {
      setWallet(response.data)
      setSeedVisible(false)
      setImportSeed("")
      toast({ title: "Wallet imported", description: "Loaded balance from the XRPL testnet." })
    } else {
      toast({ title: "Import failed", description: response.error, variant: "destructive" })
    }
    setBusy(null)
  }

  return (
    <div className="mosaic-bg min-h-dvh pb-16">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pt-10">
        <div className="flex items-center justify-between">
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-card/90 px-3 py-1.5 text-sm font-medium text-primary shadow-sm backdrop-blur transition hover:border-primary/50 hover:shadow-md"
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
                <Badge className="bg-white/30 text-white backdrop-blur">Testnet only</Badge>
                <Badge variant="secondary" className="bg-black/40 text-white">
                  Seed stays local
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {!hasWallet && !loading && (
          <Card className="border-dashed border-primary/30 bg-card/70 shadow-lg">
            <CardHeader>
              <CardTitle>No wallet connected</CardTitle>
              <CardDescription>
                Start fresh on XRPL Testnet or import an existing wallet seed from your machine.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-5">
              <div className="md:col-span-2 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Create and fund a brand-new testnet wallet using the faucet. Your seed is stored only on disk in
                  <code className="ml-1 rounded bg-muted px-1 py-0.5 text-xs">wallet/wallets/wallet.json</code>.
                </p>
                <Button
                  size="lg"
                  onClick={handleCreateClick}
                  disabled={busy === "create"}
                  className="gap-2"
                >
                  <Wallet2 className="h-4 w-4" />
                  Create a testnet wallet
                </Button>
              </div>
              <div className="md:col-span-3">
                <form className="space-y-3" onSubmit={handleImport}>
                  <Label htmlFor="import-seed" className="flex items-center gap-2 text-sm">
                    <KeyRound className="h-4 w-4 text-emerald-700" />
                    Import an existing seed
                  </Label>
                  <Input
                    id="import-seed"
                    value={importSeed}
                    onChange={(e) => setImportSeed(e.target.value)}
                    placeholder="s██████████████████████████"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>We never send your seed anywhere else—the API shells into wallet.py locally.</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={busy === "import"} className="gap-2">
                      <ArrowRight className="h-4 w-4" />
                      Import &amp; load wallet
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setImportSeed("")}>Clear</Button>
                  </div>
                </form>
              </div>
            </CardContent>
          </Card>
        )}

        <div className={cn("grid gap-6 md:grid-cols-5", !hasWallet && "opacity-50 pointer-events-none")}> 
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
                  onClick={handleCreateClick}
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
                  <Label htmlFor="charity" className="flex items-center gap-2 text-sm">
                    <HeartHandshake className="h-4 w-4 text-emerald-700" />
                    Charity (via GivePact)
                  </Label>
                  <Select value={selectedCharity} onValueChange={handleSelectCharity}>
                    <SelectTrigger id="charity" disabled={busy === "charity"}>
                      <SelectValue placeholder="Choose where to donate" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHARITIES.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    We request a fresh deposit address for the chosen nonprofit. Pick “Custom address” to paste your own.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="donor-name" className="text-sm">
                      Donor name (optional)
                    </Label>
                    <Input
                      id="donor-name"
                      value={donorName}
                      onChange={(e) => setDonorName(e.target.value)}
                      placeholder="XRPL Donor"
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="donor-email" className="text-sm">
                      Donor email (optional)
                    </Label>
                    <Input
                      id="donor-email"
                      type="email"
                      value={donorEmail}
                      onChange={(e) => setDonorEmail(e.target.value)}
                      placeholder="donor@example.com"
                      autoComplete="email"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="destination-mode" className="text-sm">
                    Destination type
                  </Label>
                  <Select
                    value={destinationMode}
                    onValueChange={(v) => {
                      const mode = v as "test" | "real"
                      setDestinationMode(mode)
                      setSelectedCharity("custom")
                      setDestination(mode === "test" ? destinationTest : destinationReal)
                    }}
                  >
                    <SelectTrigger id="destination-mode">
                      <SelectValue placeholder="Choose where to send" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="test">Testnet wallet (default)</SelectItem>
                      <SelectItem value="real">Mainnet wallet</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Keep both addresses handy and flip between them. Selecting a charity will still auto-fill a fresh address, but you can switch back here any time.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="destination-test" className="text-sm">
                      Test wallet address
                    </Label>
                    <Input
                      id="destination-test"
                      value={destinationTest}
                      onChange={(e) => {
                        setDestinationTest(e.target.value)
                        setSelectedCharity("custom")
                        if (destinationMode === "test") setDestination(e.target.value)
                      }}
                      placeholder="rTEST... (XRPL testnet)"
                      spellCheck={false}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="destination-real" className="text-sm">
                      Real wallet address
                    </Label>
                    <Input
                      id="destination-real"
                      value={destinationReal}
                      onChange={(e) => {
                        setDestinationReal(e.target.value)
                        setSelectedCharity("custom")
                        if (destinationMode === "real") setDestination(e.target.value)
                      }}
                      placeholder="rMAIN... (XRPL mainnet)"
                      spellCheck={false}
                    />
                  </div>
                </div>
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
                    Active destination (used for this check)
                  </Label>
                  <Input
                    id="destination"
                    value={destination}
                    onChange={(e) => {
                      const value = e.target.value
                      setSelectedCharity("custom")
                      setDestination(value)
                      if (destinationMode === "test") {
                        setDestinationTest(value)
                      } else {
                        setDestinationReal(value)
                      }
                    }}
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">
                    Determined by the charity picker or your selected slot above; you can also edit it directly.
                  </p>
                </div>
                <Separator />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-muted-foreground">
                    Uses your locally stored seed to sign the check.
                  </div>
                  <Button type="submit" disabled={busy === "send" || busy === "charity"} className="gap-2">
                    <ArrowRight className="h-4 w-4" />
                    Create Check
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={confirmCreateOpen} onOpenChange={setConfirmCreateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recreate your wallet?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Making a new wallet replaces the current one and writes a fresh seed to disk. Do this only when:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-foreground">
                <li>You suspect your current seed is compromised.</li>
                <li>You need a clean faucet-funded testnet balance to demo from zero.</li>
                <li>The local wallet file is corrupted and cannot load.</li>
              </ul>
              <p className="text-muted-foreground">Otherwise keep your existing wallet so past checks and balances stay accessible.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "create"}>Keep current wallet</AlertDialogCancel>
            <AlertDialogAction
              className="gap-2"
              disabled={busy === "create"}
              onClick={() => {
                setConfirmCreateOpen(false)
                handleCreate()
              }}
            >
              <DownloadCloud className="h-4 w-4" />
              Yes, make a new wallet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
