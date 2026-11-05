"use client"

import { useId, useState, type FormEvent } from "react"
import { CircleAlert, CloudOff } from "lucide-react"

import { BusyArc } from "@/components/busy-arc"
import { CloudUploadSection } from "@/components/cloud-upload-section"
import { cloudLed } from "@/components/desktop/cloud-status"
import { StatusLed } from "@/components/desktop/status-led"
import type { UseCloudLibraryReturn } from "@/hooks/use-cloud-library"
import type { Song } from "@/lib/song"
import { formatCount } from "@/lib/utils"

/**
 * Sign-in and status for the cloud library. Shared by the desktop dialog and
 * the mobile sheet; the shells only decide what frames it. Styled by the
 * surfaces' sections in app/globals.css.
 */

interface CloudLibraryPanelProps {
  cloud: UseCloudLibraryReturn
  /** This device's songs, so the panel can offer to upload the ones the cloud lacks. */
  songs: readonly Song[]
}

/** What went wrong, in words beside an icon. */
function CloudError({ message }: { message: string }) {
  return (
    <p className="surface-alert" role="alert">
      <CircleAlert aria-hidden="true" />
      {message}
    </p>
  )
}

export function CloudLibraryPanel({ cloud, songs }: CloudLibraryPanelProps) {
  const passwordId = useId()
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault()
    if (!password || submitting) return
    setSubmitting(true)
    const ok = await cloud.signIn(password)
    setSubmitting(false)
    if (ok) setPassword("")
  }

  if (cloud.status === "unavailable") {
    return (
      <p className="surface-alert">
        <CloudOff aria-hidden="true" />
        This deployment has no cloud library configured. Local songs work as usual.
      </p>
    )
  }

  if (cloud.status === "signed-out" || (cloud.status === "error" && cloud.songCount === 0)) {
    return (
      <form onSubmit={handleSignIn} className="surface-body">
        <p className="surface-hint">
          Sign in to stream your cloud library on this device. Songs you already have here keep playing from
          the local copy.
        </p>
        <div className="surface-field">
          <label htmlFor={passwordId} className="surface-label">
            Password
          </label>
          <div className="soft-field soft-field-compact">
            <input
              id={passwordId}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </div>
        {cloud.error ? <CloudError message={cloud.error} /> : null}
        <div className="surface-foot">
          <button type="submit" className="solid-button" aria-disabled={!password || submitting || undefined}>
            {submitting ? <BusyArc /> : null}
            Sign in
          </button>
        </div>
      </form>
    )
  }

  const loading = cloud.status === "loading"

  return (
    <div className="surface-body">
      <div className="surface-section">
        <div className="surface-row">
          <p className="surface-heading">
            <StatusLed state={cloudLed(cloud.status)} />
            {loading ? "Loading…" : `${formatCount(cloud.songCount, "song")} in the cloud`}
          </p>
          {cloud.pending > 0 ? (
            <span className="surface-meta type-data">
              <BusyArc />
              Reading {cloud.pending} new
            </span>
          ) : null}
        </div>
        <p className="surface-hint">
          Cloud songs stream on demand; nothing is stored on this device. Uploads appear here as soon as they
          have been read.
        </p>
        {cloud.error ? <CloudError message={cloud.error} /> : null}
      </div>

      {cloud.status === "ready" ? <CloudUploadSection songs={songs} /> : null}

      <div className="surface-section">
        <div className="surface-actions">
          <button
            type="button"
            className="text-button"
            aria-disabled={loading || undefined}
            onClick={loading ? undefined : cloud.refresh}
          >
            Refresh
          </button>
          <button type="button" className="text-button" onClick={() => void cloud.signOut()}>
            Sign out
          </button>
          <button type="button" className="text-button" onClick={() => void cloud.signOut({ everywhere: true })}>
            Sign out of all devices
          </button>
        </div>
      </div>
    </div>
  )
}
