"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

const CARBON_SETTINGS_STORAGE_KEY = "verdant-carbon-routing-settings-v1"

interface CarbonRoutingSettings {
  routingSensitivity: number
  historyCompression: number
}

const DEFAULT_CARBON_SETTINGS: CarbonRoutingSettings = {
  routingSensitivity: 55,
  historyCompression: 50,
}

function clampSettingValue(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return Math.round(value)
}

function sanitizeCarbonSettings(raw: unknown): CarbonRoutingSettings {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_CARBON_SETTINGS
  }
  const record = raw as Record<string, unknown>
  return {
    routingSensitivity:
      typeof record.routingSensitivity === "number"
        ? clampSettingValue(record.routingSensitivity)
        : DEFAULT_CARBON_SETTINGS.routingSensitivity,
    historyCompression:
      typeof record.historyCompression === "number"
        ? clampSettingValue(record.historyCompression)
        : DEFAULT_CARBON_SETTINGS.historyCompression,
  }
}

function Dial({
  label,
  value,
  accentClassName,
}: {
  label: string
  value: number
  accentClassName: string
}) {
  const clamped = clampSettingValue(value)
  const angle = Math.round((clamped / 100) * 360)

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={cn(
          "relative flex h-24 w-24 items-center justify-center rounded-full border border-border/70 bg-background shadow-sm",
          accentClassName,
        )}
        style={{
          backgroundImage: `conic-gradient(from 180deg, hsl(var(--primary)) 0deg, hsl(var(--primary)) ${angle}deg, hsl(var(--muted)) ${angle}deg, hsl(var(--muted)) 360deg)`,
        }}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border/60 bg-background/95 text-lg font-semibold text-foreground">
          {clamped}
        </div>
      </div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<CarbonRoutingSettings>(DEFAULT_CARBON_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CARBON_SETTINGS_STORAGE_KEY)
      if (!raw) {
        setSettings(DEFAULT_CARBON_SETTINGS)
      } else {
        setSettings(sanitizeCarbonSettings(JSON.parse(raw)))
      }
    } catch {
      setSettings(DEFAULT_CARBON_SETTINGS)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (!loaded) return
    window.localStorage.setItem(CARBON_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  }, [settings, loaded])

  const estimatedHistoryWindow = useMemo(() => {
    return Math.max(6, Math.round(24 - (settings.historyCompression / 100) * 18))
  }, [settings.historyCompression])

  const sensitivityLabel = useMemo(() => {
    if (settings.routingSensitivity <= 35) return "Conservative heavy-routing"
    if (settings.routingSensitivity >= 75) return "Aggressive heavy-routing"
    return "Balanced heavy-routing"
  }, [settings.routingSensitivity])

  return (
    <div className="mosaic-bg min-h-dvh">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/80 px-4 py-3 backdrop-blur-md">
          <div>
            <p className="text-lg font-semibold text-foreground">Carbon Routing Settings</p>
            <p className="text-sm text-muted-foreground">
              Tune model routing sensitivity and history compression.
            </p>
          </div>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/" aria-label="Back to chat">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to chat
            </Link>
          </Button>
        </div>

        <section className="grid gap-4 rounded-2xl border border-border/70 bg-card/85 p-4 shadow-sm backdrop-blur-md md:grid-cols-2">
          <Dial label="Routing sensitivity" value={settings.routingSensitivity} accentClassName="" />
          <Dial label="History compression" value={settings.historyCompression} accentClassName="" />
        </section>

        <section className="space-y-5 rounded-2xl border border-border/70 bg-card/85 p-4 shadow-sm backdrop-blur-md">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">Routing sensitivity</p>
              <p className="text-xs text-muted-foreground">{sensitivityLabel}</p>
            </div>
            <Slider
              value={[settings.routingSensitivity]}
              min={0}
              max={100}
              step={1}
              onValueChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  routingSensitivity: clampSettingValue(value[0] ?? current.routingSensitivity),
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Higher values route more prompts to heavier models sooner.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">History compression</p>
              <p className="text-xs text-muted-foreground">Recent window ≈ {estimatedHistoryWindow} messages</p>
            </div>
            <Slider
              value={[settings.historyCompression]}
              min={0}
              max={100}
              step={1}
              onValueChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  historyCompression: clampSettingValue(value[0] ?? current.historyCompression),
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Higher values summarize older turns more aggressively to reduce token usage.
            </p>
          </div>

          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="secondary"
              className="rounded-full"
              onClick={() => setSettings(DEFAULT_CARBON_SETTINGS)}
            >
              Reset defaults
            </Button>
          </div>
        </section>
      </main>
    </div>
  )
}
