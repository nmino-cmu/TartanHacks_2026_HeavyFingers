import Link from "next/link"

const CHARS_PER_TOKEN = 4
const KG_PER_TOKEN = 0.0000005

export const metadata = {
  title: "Carbon Emission Calculation",
  description: "How we estimate the carbon footprint for each chat session.",
}

export default function CarbonCalculationPage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-primary">Methodology</p>
        <h1 className="text-3xl font-bold text-foreground">How we estimate carbon emissions</h1>
        <p className="text-base text-muted-foreground">
          We display an approximate carbon footprint for your chat session so you can see how model
          usage impacts energy. This page explains the simple model behind that number.
        </p>
      </div>

      <section className="rounded-2xl border border-border/70 bg-card/60 p-6 shadow-sm backdrop-blur">
        <h2 className="text-xl font-semibold text-foreground">The calculation</h2>
        <ol className="mt-3 space-y-3 text-sm text-foreground">
          <li>
            <span className="font-semibold">1) Count characters.</span> We sum the length of every
            text snippet sent and received in this chat session.
          </li>
          <li>
            <span className="font-semibold">2) Approximate tokens.</span> We divide characters by{" "}
            {CHARS_PER_TOKEN} (≈ characters per token) to estimate total tokens processed.
          </li>
          <li>
            <span className="font-semibold">3) Apply emission factor.</span> Each token is assumed to
            emit {KG_PER_TOKEN * 1000} g CO₂e (0.5 mg), a conservative heuristic derived from public
            estimates for large language model inference.
          </li>
          <li>
            <span className="font-semibold">4) Convert to kg.</span> Footprint = tokens × {KG_PER_TOKEN} kg.
          </li>
        </ol>

        <div className="mt-4 rounded-xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
          Formula: <code className="text-foreground">footprint_kg = (chars / {CHARS_PER_TOKEN}) * {KG_PER_TOKEN}</code>
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/60 p-6 shadow-sm backdrop-blur">
        <h2 className="text-xl font-semibold text-foreground">Why this is approximate</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-foreground">
          <li>Real energy use varies by model, hardware, data center efficiency, and load.</li>
          <li>We do not yet account for retries, background tool calls, or image tokens.</li>
          <li>Numbers are session‑scoped; refreshing the page resets the shown estimate.</li>
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          As better published benchmarks emerge, we’ll tighten the factor or add model-specific
          multipliers.
        </p>
      </section>

      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex items-center rounded-lg border border-border/70 bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          ← Back to chat
        </Link>
        <p className="text-xs text-muted-foreground">
          Last updated: {new Date().toISOString().slice(0, 10)}
        </p>
      </div>
    </main>
  )
}
