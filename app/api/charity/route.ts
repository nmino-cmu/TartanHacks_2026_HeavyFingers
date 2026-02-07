import { NextResponse } from "next/server"

const CHARITIES: Record<string, string> = {
  "earthday.org": "133798288",
  GivePact: "920504087",
  "Environmental Defense Fund": "116107128",
}

type DonateBody = {
  charity?: string
  name?: string
  email?: string
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as DonateBody
  const charityKey = body.charity

  if (!charityKey || !(charityKey in CHARITIES)) {
    return NextResponse.json(
      { status: "error", error: "Unknown charity" },
      { status: 400 },
    )
  }

  const payload = {
    ein: CHARITIES[charityKey],
    asset: "XRP",
    network: "Ripple",
    share_data: true,
    donor_name: body.name?.trim() || "XRPL Donor",
    donor_email: body.email?.trim() || "donor@example.com",
  }

  try {
    const res = await fetch("https://api.givepact.io/v1/donate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`GivePact returned ${res.status}: ${text || "unknown error"}`)
    }

    const data = (await res.json()) as { address?: string }
    if (!data?.address) {
      throw new Error("Missing address in response")
    }

    return NextResponse.json({ status: "ok", data: { address: data.address } })
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", error: error?.message ?? "Unable to fetch charity address" },
      { status: 500 },
    )
  }
}
