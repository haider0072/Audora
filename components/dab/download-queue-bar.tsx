"use client"

import { memo, type CSSProperties } from "react"

import { BusyArc } from "@/components/busy-arc"
import { isDownloadActive, type ActiveDownload, type DownloadState } from "@/lib/tidal-types"
import { formatCount } from "@/lib/utils"

const VERBS: Record<ActiveDownload["status"], string> = {
  queued: "Waiting to download",
  downloading: "Downloading",
  processing: "Finishing",
  saving: "Saving to the cloud",
}

/** How far a download has come, or null for one the server is saving, which says nothing until it is done. */
function percentOf(download: ActiveDownload): number | null {
  switch (download.status) {
    case "downloading":
      return download.progress
    case "processing":
      return 100
    case "saving":
      return null
    case "queued":
      return 0
  }
}

/**
 * Downloads under way, at the foot of the online search: the song coming
 * down, how far it has come as a line of the song's colour along the top,
 * and how many more wait their turn. A song the server is saving to the
 * cloud has no line or percent, as nothing says how far it has come. Gone
 * once nothing is downloading. Styled by `.online-strip`.
 */
export const DownloadQueueBar = memo(function DownloadQueueBar({ downloads }: { downloads: Map<string, DownloadState> }) {
  const active = Array.from(downloads.values()).filter(isDownloadActive)
  if (active.length === 0) return null

  const current =
    active.find((download) => download.status === "downloading") ??
    active.find((download) => download.status === "processing") ??
    active.find((download) => download.status === "saving") ??
    active[0]
  const percent = percentOf(current)
  const waiting = active.length - 1

  return (
    <div className="online-strip" style={{ "--progress": (percent ?? 0) / 100 } as CSSProperties}>
      <span className="online-strip-line" aria-hidden="true" />
      <BusyArc />
      <p className="online-strip-text">
        {VERBS[current.status]} <span className="online-strip-title">{current.trackTitle}</span>
      </p>
      {waiting > 0 && <span className="online-strip-more">{formatCount(waiting, "more song")}</span>}
      {percent !== null && <span className="type-data online-strip-percent">{percent}%</span>}
    </div>
  )
})
