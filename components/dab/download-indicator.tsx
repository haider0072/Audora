"use client"

import { memo } from "react"
import { ArrowDownToLine, Check, Clock, RotateCw, X } from "lucide-react"

import { BusyArc } from "@/components/busy-arc"
import { ProgressRing } from "@/components/player/progress-ring"
import { TransportButton } from "@/components/player/transport-button"
import type { DownloadState } from "@/lib/tidal-types"

interface DownloadIndicatorProps {
  /** The song's title, which every label names. */
  title: string
  state?: DownloadState
  isInLibrary: boolean
  onDownload: () => void
  onCancel: () => void
}

/**
 * A song's download, as one control in a row: the way to get it, how far it
 * has come (a ring that fills, or an arc while the server saves it to the
 * cloud, and stops it when pressed), and whether it is in the library. A
 * failure says so and offers to try again: words and an icon, never red,
 * which is Audora's own. Styled by `.online-download`.
 */
export const DownloadIndicator = memo(function DownloadIndicator({
  title,
  state,
  isInLibrary,
  onDownload,
  onCancel,
}: DownloadIndicatorProps) {
  if (isInLibrary || state?.status === "complete") {
    return (
      <span className="online-download" data-state="done" title="In your library">
        <Check aria-hidden="true" />
        <span className="sr-only">In your library</span>
      </span>
    )
  }

  switch (state?.status) {
    case "queued":
      return (
        <TransportButton label={`Queued: stop downloading ${title}`} size="sm" className="online-download" onClick={onCancel}>
          <Clock aria-hidden="true" />
        </TransportButton>
      )
    case "downloading":
      return (
        <TransportButton
          label={`Stop downloading ${title}, ${state.progress}%`}
          size="sm"
          className="online-download"
          data-state="downloading"
          onClick={onCancel}
        >
          <ProgressRing progress={state.progress / 100} />
          <X className="online-download-stop" aria-hidden="true" />
        </TransportButton>
      )
    case "processing":
      return (
        <span className="online-download" data-state="processing" title="Finishing the download">
          <BusyArc />
          <span className="sr-only">Finishing the download</span>
        </span>
      )
    case "saving":
      // The server reports nothing until the song is saved, so an arc turns where the ring would fill.
      return (
        <TransportButton
          label={`Stop saving ${title} to the cloud`}
          size="sm"
          className="online-download"
          data-state="saving"
          onClick={onCancel}
        >
          <BusyArc radius={9} />
          <X className="online-download-stop" aria-hidden="true" />
        </TransportButton>
      )
    case "error":
      return (
        <TransportButton
          label={`${title} didn't download: try again`}
          title={state.error ?? "The download failed"}
          size="sm"
          className="online-download"
          data-state="error"
          onClick={onDownload}
        >
          <RotateCw aria-hidden="true" />
        </TransportButton>
      )
    default:
      return (
        <TransportButton label={`Download ${title} in FLAC`} size="sm" className="online-download" onClick={onDownload}>
          <ArrowDownToLine aria-hidden="true" />
        </TransportButton>
      )
  }
})
