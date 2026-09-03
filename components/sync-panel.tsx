"use client"

import { useState } from "react"
import { AlertTriangle, Link2, Link2Off, MonitorSpeaker, Radio } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import type { UseDeviceSyncReturn } from "@/hooks/use-device-sync"
import { useNullOffsetMs } from "@/hooks/use-null-offset"
import { useSyncStats } from "@/hooks/use-sync-stats"
import { NULL_OFFSET_LIMIT_MS, setNullOffsetMs } from "@/lib/sync/null-offset"
import type { SyncStats } from "@/lib/sync/sync-stats-store"

/**
 * Controls for playing the same track on two devices at once.
 *
 * The live readout is not decoration. Two speakers in one room are the hardest
 * case this feature has, and the only way to null the last few milliseconds is
 * by ear against a number that updates while the user moves the slider.
 */

interface SyncPanelProps {
  sync: UseDeviceSyncReturn
}

export function SyncPanel({ sync }: SyncPanelProps) {
  const [codeInput, setCodeInput] = useState("")
  const [hostedCode, setHostedCode] = useState<string | null>(null)

  const isIdle = sync.status === "idle" || sync.status === "closed"

  const handleHost = () => {
    setHostedCode(sync.startHosting())
  }

  const handleJoin = () => {
    const code = codeInput.trim()
    if (!/^\d{6}$/.test(code)) return
    setHostedCode(null)
    sync.join(code)
  }

  const handleLeave = () => {
    setHostedCode(null)
    setCodeInput("")
    sync.leave()
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <MonitorSpeaker className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Play on two devices</h3>
        <StatusBadge sync={sync} />
      </header>

      {isIdle ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Both devices need to be on the same network, and both need the track in
            their own library. Only playback commands are sent — never audio.
          </p>
          <Button onClick={handleHost} className="w-full" size="sm">
            <Radio className="mr-2 h-4 w-4" />
            Host a session
          </Button>
          <div className="flex gap-2">
            <Input
              value={codeInput}
              onChange={(event) => setCodeInput(event.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleJoin()
              }}
              placeholder="6-digit code"
              inputMode="numeric"
              aria-label="Session code from the other device"
              className="font-mono"
            />
            <Button onClick={handleJoin} variant="secondary" size="sm" disabled={codeInput.length !== 6}>
              Join
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {hostedCode && !sync.isConnected ? (
            <div className="rounded-md border border-dashed p-3 text-center">
              <p className="text-xs text-muted-foreground">Enter this on the other device</p>
              <p className="mt-1 font-mono text-2xl tracking-[0.3em]">{hostedCode}</p>
            </div>
          ) : null}

          {sync.detail ? (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{sync.detail}</span>
            </p>
          ) : null}

          {sync.missingTrackLabel ? (
            <p className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-500">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Not in this library: <strong className="font-medium">{sync.missingTrackLabel}</strong>
              </span>
            </p>
          ) : null}

          {sync.isConnected ? (
            <>
              <Separator />
              <ConnectionReadout sync={sync} />
              <NullOffsetControl />
              {sync.role === "host" ? (
                <Button onClick={sync.handOver} variant="outline" size="sm" className="w-full">
                  Let the other device take over
                </Button>
              ) : null}
            </>
          ) : null}

          <Button onClick={handleLeave} variant="ghost" size="sm" className="w-full">
            <Link2Off className="mr-2 h-4 w-4" />
            End session
          </Button>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ sync }: SyncPanelProps) {
  if (sync.isConnected) {
    return (
      <Badge variant="secondary" className="ml-auto gap-1">
        <Link2 className="h-3 w-3" />
        {sync.role === "host" ? "Hosting" : "Following"}
      </Badge>
    )
  }

  if (sync.status === "failed") {
    return (
      <Badge variant="destructive" className="ml-auto">
        Failed
      </Badge>
    )
  }

  if (sync.status === "signaling" || sync.status === "connecting") {
    return (
      <Badge variant="outline" className="ml-auto">
        Pairing…
      </Badge>
    )
  }

  return null
}

/**
 * Subscribes to the live measurements on its own. Reading them here rather
 * than through the session keeps the per-pong and per-tick updates out of the
 * player's render path — only this strip re-renders with them.
 */
function ConnectionReadout({ sync }: SyncPanelProps) {
  const stats = useSyncStats()

  return (
    <dl className="grid grid-cols-3 gap-2 text-center">
      <Stat label="Peer" value={sync.peerName ?? "—"} />
      <Stat
        label="Round trip"
        value={stats.rttMs > 0 ? `${stats.rttMs.toFixed(1)} ms` : "—"}
      />
      <Stat label="Drift" value={formatDrift(sync.role, stats)} />
    </dl>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xs">{value}</dd>
    </div>
  )
}

/**
 * The follower measures drift against the host; the host has nothing to
 * measure itself against, so it says so rather than showing a misleading zero.
 */
function formatDrift(role: UseDeviceSyncReturn["role"], stats: SyncStats): string {
  if (role === "host") return "on peer"
  if (!stats.clockLocked) return "settling"
  if (stats.driftMs === null) return "—"
  const rounded = Math.round(stats.driftMs)
  return `${rounded > 0 ? "+" : ""}${rounded} ms`
}

/**
 * Owns its own subscription to the trim so dragging the slider re-renders
 * this control rather than the player around it.
 */
function NullOffsetControl() {
  const nullOffsetMs = useNullOffsetMs()

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="sync-null-offset" className="text-xs">
          Fine tune
        </Label>
        <span className="font-mono text-xs text-muted-foreground">
          {nullOffsetMs > 0 ? "+" : ""}
          {nullOffsetMs} ms
        </span>
      </div>
      <Slider
        id="sync-null-offset"
        value={[nullOffsetMs]}
        onValueChange={([value]) => setNullOffsetMs(value)}
        min={-NULL_OFFSET_LIMIT_MS}
        max={NULL_OFFSET_LIMIT_MS}
        step={1}
        aria-label="Fine tune this device against the other one, in milliseconds"
      />
      <p className="text-[11px] text-muted-foreground">
        Nudge this device earlier or later until the two sound like one source.
        Headphones or a Bluetooth speaker on either side will need it.
      </p>
    </div>
  )
}
