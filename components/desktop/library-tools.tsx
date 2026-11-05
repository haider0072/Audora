"use client"

import { forwardRef, useSyncExternalStore } from "react"
import { Cloud, Search } from "lucide-react"

import { BusyArc } from "@/components/busy-arc"
import { CLOUD_STATUS_LABELS, cloudLed } from "@/components/desktop/cloud-status"
import { StatusLed } from "@/components/desktop/status-led"
import { ProgressRing } from "@/components/player/progress-ring"
import { TransportButton } from "@/components/player/transport-button"
import type { CloudLibraryStatus } from "@/hooks/use-cloud-library"
import { searchShortcut } from "@/hooks/use-search-shortcut"
import { cloudUploads } from "@/lib/cloud/upload-queue"
import { formatCount } from "@/lib/utils"

/**
 * The library's search, closed: a soft button with its shortcut, which opens
 * the field in its place. Styled by `.search-button`.
 */
export const SearchButton = forwardRef<HTMLButtonElement, { onOpen: () => void }>(function SearchButton({ onOpen }, ref) {
  const shortcut = searchShortcut()
  return (
    <button ref={ref} type="button" className="search-button" aria-keyshortcuts={shortcut.aria} onClick={onOpen}>
      <Search aria-hidden="true" />
      Search
      <kbd className="search-button-key" aria-hidden="true">
        {shortcut.label}
      </kbd>
    </button>
  )
})

/**
 * The cloud library, among the library's tools: an icon with its state as an
 * LED in the corner, or, while files go up, a ring that fills as they do.
 * Only this re-renders as an upload moves.
 */
export function CloudButton({ status, onOpen }: { status: CloudLibraryStatus; onOpen: () => void }) {
  const uploads = useSyncExternalStore(cloudUploads.subscribe, cloudUploads.getSnapshot, cloudUploads.getSnapshot)
  const progress = uploads.active && uploads.bytesTotal > 0 ? Math.min(uploads.bytesSent / uploads.bytesTotal, 1) : null
  const label = CLOUD_STATUS_LABELS[status]

  return (
    <TransportButton
      label={progress === null ? `Cloud, ${label}` : `Cloud, uploading, ${Math.round(progress * 100)}%`}
      title={`Cloud library: ${label}`}
      size="md"
      className="tool-button"
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <Cloud aria-hidden="true" />
      {progress === null ? (
        <StatusLed state={cloudLed(status)} className="tool-led" />
      ) : (
        <span className="tool-ring">
          <ProgressRing progress={progress} />
        </span>
      )}
    </TransportButton>
  )
}

/**
 * Songs the online search is still downloading, among the library's tools
 * while there are any, so they can be followed from anywhere. Opens the
 * search they came from.
 */
export function DownloadsButton({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count === 0) return null
  return (
    <button type="button" className="tool-words" title={`${formatCount(count, "song")} downloading`} onClick={onOpen}>
      <BusyArc />
      <span>Downloading</span>
      <span className="type-data">{count}</span>
    </button>
  )
}
