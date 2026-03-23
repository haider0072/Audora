"use client"

import { memo } from "react"
import { Download, Loader2 } from "lucide-react"
import type { DownloadState } from "@/lib/dab-types"

interface DownloadQueueBarProps {
  downloads: Map<string, DownloadState>
}

export const DownloadQueueBar = memo(function DownloadQueueBar({
  downloads,
}: DownloadQueueBarProps) {
  const active = Array.from(downloads.values()).filter(
    (d) => d.status === "downloading" || d.status === "queued" || d.status === "processing"
  )

  if (active.length === 0) return null

  const downloading = active.find((d) => d.status === "downloading")
  const queued = active.filter((d) => d.status === "queued").length

  return (
    <div className="flex-shrink-0 border-t border-white/10 px-3 py-2 bg-white/5">
      <div className="flex items-center gap-2 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
        <div className="flex-1 min-w-0">
          {downloading ? (
            <p className="truncate">
              Downloading: <span className="font-medium">{downloading.trackTitle}</span>
              {" "}{downloading.progress}%
            </p>
          ) : (
            <p>Processing...</p>
          )}
        </div>
        {queued > 0 && (
          <span className="text-muted-foreground flex-shrink-0">
            +{queued} queued
          </span>
        )}
      </div>

      {/* Progress bar */}
      {downloading && downloading.totalBytes > 0 && (
        <div className="mt-1 h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${downloading.progress}%` }}
          />
        </div>
      )}
    </div>
  )
})
