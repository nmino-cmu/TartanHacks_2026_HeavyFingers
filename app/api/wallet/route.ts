import { NextResponse } from "next/server"
import path from "path"
import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

const WALLET_SCRIPT = path.join(process.cwd(), "wallet", "wallet.py")
const DEFAULT_WALLET_PATH = path.join(process.cwd(), "wallet", "wallets", "wallet.json")
const PYTHON_BIN = process.env.PYTHON_BIN || "python3"

type WalletAction = "create" | "info" | "send-check"

async function runWalletCommand(args: string[]) {
  const { stdout, stderr } = await execFileAsync(PYTHON_BIN, args, {
    timeout: 25_000,
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

  return parsed.data
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
    default:
      throw new Error(`Unsupported action: ${action satisfies never}`)
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const refresh = searchParams.get("refresh") === "true"

  try {
    const data = await handleAction("info", { refresh })
    return NextResponse.json({ status: "ok", data })
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
    return NextResponse.json({ status: "ok", data })
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", error: error?.message ?? "Unknown error" },
      { status: 500 },
    )
  }
}
