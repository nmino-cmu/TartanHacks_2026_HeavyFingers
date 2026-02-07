import { NextResponse } from "next/server"
import path from "path"
import { execFile } from "child_process"
import { promisify } from "util"
import { promises as fs } from "fs"

const execFileAsync = promisify(execFile)

const WALLET_SCRIPT = path.join(process.cwd(), "wallet", "wallet.py")
const DEFAULT_WALLET_PATH = path.join(process.cwd(), "wallet", "wallets", "wallet.json")
const DONATION_PATH = path.join(process.cwd(), "wallet", "wallets", "donations.json")
const PYTHON_BIN = process.env.PYTHON_BIN || "python3"
const WALLET_PASSPHRASE = process.env.WALLET_PASSPHRASE

type WalletAction = "create" | "info" | "send-check" | "import" | "txs"

async function runWalletCommand(args: string[]) {
  if (!WALLET_PASSPHRASE) {
    throw new Error("Set WALLET_PASSPHRASE in the environment before using the wallet.")
  }

  const { stdout, stderr } = await execFileAsync(PYTHON_BIN, args, {
    timeout: 25_000,
    env: { ...process.env, WALLET_PASSPHRASE },
  })

  // If the script writes errors to stderr but still returns JSON, prefer stdout.
  if (!stdout?.trim()) {
    throw new Error(stderr || "Wallet script produced no output")
  }

  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch (error) {
    throw new Error(`Failed to parse wallet output: ${stdout}`)
  }

  if (parsed.status === "error") {
    throw new Error(parsed.error || "Wallet script error")
  }

  // Do not expose the seed or raw payload to the client.
  const { seed, raw, ...rest } = parsed.data ?? {}
  return rest
}

async function readDonationTotal(): Promise<number> {
  try {
    const raw = await fs.readFile(DONATION_PATH, "utf-8")
    const parsed = JSON.parse(raw)
    const n = Number(parsed.total)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

async function writeDonationTotal(total: number) {
  await fs.mkdir(path.dirname(DONATION_PATH), { recursive: true })
  let records: any[] = []
  try {
    const raw = await fs.readFile(DONATION_PATH, "utf-8")
    const parsed = JSON.parse(raw)
    records = Array.isArray(parsed.records) ? parsed.records : []
  } catch {
    records = []
  }
  await fs.writeFile(DONATION_PATH, JSON.stringify({ total, records }), "utf-8")
}

async function readDonationRecords(): Promise<any[]> {
  try {
    const raw = await fs.readFile(DONATION_PATH, "utf-8")
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed.records)) return parsed.records
    return []
  } catch {
    return []
  }
}

async function appendDonationRecord(record: any) {
  const total = await readDonationTotal()
  const records = await readDonationRecords()
  records.unshift(record)
  await fs.mkdir(path.dirname(DONATION_PATH), { recursive: true })
  await fs.writeFile(DONATION_PATH, JSON.stringify({ total, records }), "utf-8")
}

async function handleAction(action: WalletAction, payload: any) {
  switch (action) {
    case "create": {
      const force = Boolean(payload?.force)
      const args = [
        WALLET_SCRIPT,
        "create",
        "--wallet-file",
        payload?.walletFile || DEFAULT_WALLET_PATH,
      ]
      if (force) args.push("--force")
      return runWalletCommand(args)
    }
    case "info": {
      const refresh = Boolean(payload?.refresh)
      const args = [
        WALLET_SCRIPT,
        "info",
        "--wallet-file",
        payload?.walletFile || DEFAULT_WALLET_PATH,
      ]
      if (refresh) args.push("--refresh")
      return runWalletCommand(args)
    }
    case "send-check": {
      const destination = payload?.destination
      const amount = payload?.amount
      if (!destination || !amount) {
        throw new Error("destination and amount are required for send-check")
      }
      const args = [
        WALLET_SCRIPT,
        "send-check",
        "--wallet-file",
        payload?.walletFile || DEFAULT_WALLET_PATH,
        "--destination",
        destination,
        "--amount",
        String(amount),
      ]
      return runWalletCommand(args)
    }
    case "import": {
      const seed = payload?.seed
      if (!seed || typeof seed !== "string") {
        throw new Error("seed is required for import")
      }
      const args = [
        WALLET_SCRIPT,
        "import",
        "--wallet-file",
        payload?.walletFile || DEFAULT_WALLET_PATH,
        "--seed",
        seed,
        "--refresh",
      ]
      return runWalletCommand(args)
    }
    case "txs": {
      const limit = Math.min(Number(payload?.limit) || 10, 25)
      const args = [
        WALLET_SCRIPT,
        "txs",
        "--wallet-file",
        payload?.walletFile || DEFAULT_WALLET_PATH,
        "--limit",
        String(limit),
      ]
      const txs = await runWalletCommand(args)
      const records = await readDonationRecords()
      const enriched = Array.isArray(txs?.transactions)
        ? txs.transactions.map((tx: any) => {
            const match = records.find((r) => r.hash && tx.hash && r.hash === tx.hash)
            return match ? { ...tx, donor_name: match.donor_name, donated_amount: match.amount } : tx
          })
        : []
      return { ...txs, transactions: enriched }
    }
    default:
      throw new Error(`Unsupported action: ${action satisfies never}`)
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const refresh = searchParams.get("refresh") === "true"

  try {
    const data = await handleAction("info", { refresh })
    const donation_total = await readDonationTotal()
    return NextResponse.json({ status: "ok", data: { ...data, donation_total } })
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", error: error?.message ?? "Unknown error" },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const action = body?.action as WalletAction | undefined

  if (!action) {
    return NextResponse.json(
      { status: "error", error: "Missing action" },
      { status: 400 },
    )
  }

  try {
    const data = await handleAction(action, body)

    if (action === "send-check") {
      const prevTotal = await readDonationTotal()
      const increment = Number(body?.amount) || 0
      const newTotal = prevTotal + increment
      await writeDonationTotal(newTotal)
      if (data?.tx_hash) {
        await appendDonationRecord({
          hash: data.tx_hash,
          donor_name: body?.donorName || body?.donor_name || "",
          amount: increment,
          ts: Date.now(),
        })
      }
      return NextResponse.json({ status: "ok", data: { ...data, donation_total: newTotal } })
    }

    return NextResponse.json({ status: "ok", data })
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", error: error?.message ?? "Unknown error" },
      { status: 500 },
    )
  }
}
