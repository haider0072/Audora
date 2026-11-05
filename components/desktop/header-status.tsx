"use client"

import { useSyncExternalStore } from "react"
import { Cloud } from "lucide-react"

import { BusyArc } from "@/components/busy-arc"
import { CLOUD_STATUS_LABELS, cloudLed } from "@/components/desktop/cloud-status"
import { StatusLed } from "@/components/desktop/status-led"
import { ProgressRing } from "@/components/player/progress-ring"
import type { CloudLibraryStatus } from "@/hooks/use-cloud-library"
import { cloudUploads } from "@/lib/cloud/upload-queue"
import { formatCount } from "@/lib/utils"

/**
 * The cloud library, in the header: its state as an LED, or, while files go
 * up, a ring that fills as they do. Only this re-renders as an upload moves.
 */
export function CloudButton({ status, onOpen }: { status: CloudLibraryStatus; onOpen: () => void }) {
  const uploads = useSyncExternalStore(cloudUploads.subscribe, cloudUploads.getSnapshot, cloudUploads.getSnapshot)
  const progress = uploads.active && uploads.bytesTotal > 0 ? Math.min(uploads.bytesSent / uploads.bytesTotal, 1) : null
  const label = CLOUD_STATUS_LABELS[status]

  return (
    <button type="button" className="header-button" aria-haspopup="dialog" title={`Cloud library: ${label}`} onClick={onOpen}>
      <Cloud aria-hidden="true" />
      <span className="header-button-label">Cloud</span>
      {progress === null ? (
        <>
          <StatusLed state={cloudLed(status)} />
          <span className="sr-only">, {label}</span>
        </>
      ) : (
        <>
          <ProgressRing progress={progress} />
          <span className="sr-only">, uploading, {Math.round(progress * 100)}%</span>
        </>
      )}
    </button>
  )
}

/**
 * Songs the online search is still downloading, in the header while there are
 * any, so they can be followed from anywhere. Opens the search they came from.
 */
export function DownloadsButton({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count === 0) return null
  return (
    <button type="button" className="header-button" title={`${formatCount(count, "song")} downloading`} onClick={onOpen}>
      <BusyArc />
      <span className="header-button-label">Downloading</span>
      <span className="type-data">{count}</span>
    </button>
  )
}
