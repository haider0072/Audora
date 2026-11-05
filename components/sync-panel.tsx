"use client"

import { useId, useState } from "react"
import { AlertTriangle } from "lucide-react"

import { BusyArc } from "@/components/busy-arc"
import { StatusLed, type LedState } from "@/components/desktop/status-led"
import { CenterFader } from "@/components/sound/center-fader"
import type { UseDeviceSyncReturn } from "@/hooks/use-device-sync"
import { useNullOffsetMs } from "@/hooks/use-null-offset"
import { useSyncStats } from "@/hooks/use-sync-stats"
import { NULL_OFFSET_LIMIT_MS, setNullOffsetMs } from "@/lib/sync/null-offset"
import type { SyncStats } from "@/lib/sync/sync-stats-store"

/**
 * Controls for playing the same track on two devices at once. Styled by the
 * surfaces' sections in app/globals.css.
 *
 * The live readout is not decoration. Two speakers in one room are the hardest
 * case this feature has, and the only way to null the last few milliseconds is
 * by ear against a number that updates while the user moves the slider.
 */

interface SyncPanelProps {
  sync: UseDeviceSyncReturn
}

/** Milliseconds signed the way the rest of the app signs a value: +12, −12, 0. */
function signedMs(ms: number): string {
  if (ms > 0) return `+${ms} ms`
  if (ms < 0) return `−${Math.abs(ms)} ms`
  return "0 ms"
}

export function SyncPanel({ sync }: SyncPanelProps) {
  const headingId = useId()
  const [codeInput, setCodeInput] = useState("")
  const [hostedCode, setHostedCode] = useState<string | null>(null)

  const isIdle = sync.status === "idle" || sync.status === "closed"
  const codeComplete = /^\d{6}$/.test(codeInput)

  const handleHost = () => {
    setHostedCode(sync.startHosting())
  }

  const handleJoin = () => {
    if (!codeComplete) return
    setHostedCode(null)
    sync.join(codeInput)
  }

  const handleLeave = () => {
    setHostedCode(null)
    setCodeInput("")
    sync.leave()
  }

  return (
    <div className="surface-body">
      <section className="surface-section" aria-labelledby={headingId}>
        <div className="surface-row">
          <h3 id={headingId} className="surface-heading">
            Session
          </h3>
          <SessionStatus sync={sync} />
        </div>

        {isIdle ? (
          <>
            <p className="surface-hint">
              Both devices need to be on the same network, and both need the track in their own library. Only
              playback commands are sent — never audio.
            </p>
            <div className="surface-actions">
              <button type="button" className="solid-button" onClick={handleHost}>
                Host a session
              </button>
            </div>
            <div className="sync-join">
              <div className="soft-field soft-field-compact">
                <input
                  value={codeInput}
                  onChange={(event) => setCodeInput(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleJoin()
                  }}
                  placeholder="6-digit code"
                  inputMode="numeric"
                  aria-label="Session code from the other device"
                />
              </div>
              <button
                type="button"
                className="text-button"
                aria-disabled={!codeComplete || undefined}
                onClick={handleJoin}
              >
                Join
              </button>
            </div>
          </>
        ) : (
          <>
            {hostedCode && !sync.isConnected ? (
              <div className="sync-code">
                <p className="surface-hint">Enter this on the other device</p>
                <p className="sync-code-digits">{hostedCode}</p>
              </div>
            ) : null}

            {sync.detail ? (
              <p className="surface-alert">
                <AlertTriangle aria-hidden="true" />
                <span>{sync.detail}</span>
              </p>
            ) : null}

            {sync.missingTrackLabel ? (
              <p className="surface-alert">
                <AlertTriangle aria-hidden="true" />
                <span>
                  Not in this library: <strong className="font-semibold">{sync.missingTrackLabel}</strong>
                </span>
              </p>
            ) : null}
          </>
        )}
      </section>

      {sync.isConnected ? (
        <>
          <div className="surface-section">
            <ConnectionReadout sync={sync} />
          </div>
          <NullOffsetControl />
        </>
      ) : null}

      {isIdle ? null : (
        <div className="surface-section">
          <div className="surface-actions">
            {sync.isConnected && sync.role === "host" ? (
              <button type="button" className="text-button" onClick={sync.handOver}>
                Let the other device take over
              </button>
            ) : null}
            <button type="button" className="text-button" onClick={handleLeave}>
              End session
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** How the session stands, as an LED and a word; a turning arc while the devices pair. */
function SessionStatus({ sync }: SyncPanelProps) {
  if (sync.status === "signaling" || sync.status === "connecting") {
    return (
      <span className="surface-meta type-data">
        <BusyArc />
        Pairing…
      </span>
    )
  }

  let led: LedState = "off"
  let label = "Off"
  if (sync.isConnected) {
    led = "on"
    label = sync.role === "host" ? "Hosting" : "Following"
  } else if (sync.status === "failed") {
    led = "error"
    label = "Failed"
  }

  return (
    <span className="surface-meta type-data">
      <StatusLed state={led} />
      {label}
    </span>
  )
}

/**
 * Subscribes to the live measurements on its own. Reading them here rather
 * than through the session keeps the per-pong and per-tick updates out of the
 * player's render path — only this strip re-renders with them.
 */
function ConnectionReadout({ sync }: SyncPanelProps) {
  const stats = useSyncStats()

  return (
    <dl className="sync-readout">
      <Stat label="Peer" value={sync.peerName ?? "—"} />
      <Stat label="Round trip" value={stats.rttMs > 0 ? `${stats.rttMs.toFixed(1)} ms` : "—"} />
      <Stat label="Drift" value={formatDrift(sync.role, stats)} />
    </dl>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="type-data">{value}</dd>
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
  return signedMs(Math.round(stats.driftMs))
}

/**
 * Owns its own subscription to the trim so dragging the fader re-renders
 * this control rather than the player around it.
 */
function NullOffsetControl() {
  const headingId = useId()
  const nullOffsetMs = useNullOffsetMs()
  const shown = signedMs(nullOffsetMs)

  return (
    <section className="surface-section" aria-labelledby={headingId}>
      <div className="surface-row">
        <h3 id={headingId} className="surface-heading">
          Fine tune
        </h3>
        <span className="surface-meta type-data" aria-hidden="true">
          {shown}
        </span>
      </div>
      <CenterFader
        orientation="horizontal"
        value={nullOffsetMs}
        limit={NULL_OFFSET_LIMIT_MS}
        step={1}
        onChange={setNullOffsetMs}
        label="Fine tune this device against the other one, in milliseconds"
        valueText={shown}
      />
      <p className="surface-hint">
        Nudge this device earlier or later until the two sound like one source. Headphones or a Bluetooth speaker
        on either side will need it.
      </p>
    </section>
  )
}
