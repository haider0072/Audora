"use client"

import { memo } from "react"
import { Download, Check, RefreshCw, X, Clock, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { DownloadState } from "@/lib/tidal-types"

interface DownloadIndicatorProps {
  state?: DownloadState
  isInLibrary: boolean
  onDownload: () => void
  onCancel?: () => void
  onRetry?: () => void
  compact?: boolean
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

export const DownloadIndicator = memo(function DownloadIndicator({
  state,
  isInLibrary,
  onDownload,
  onCancel,
  onRetry,
  compact = false,
}: DownloadIndicatorProps) {
  // Already in library
  if (isInLibrary) {
    return (
      <div className={`flex items-center gap-1 text-green-500 ${compact ? "text-xs" : "text-sm"}`}>
        <Check className={compact ? "h-3 w-3" : "h-4 w-4"} />
        {!compact && <span>In Library</span>}
      </div>
    )
  }

  // No download state — show download button
  if (!state || state.status === "cancelled") {
    return (
      <Button
        variant="ghost"
        size={compact ? "icon" : "sm"}
        onClick={onDownload}
        className={compact ? "h-7 w-7" : "h-8 gap-1.5"}
      >
        <Download className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {!compact && <span>FLAC</span>}
      </Button>
    )
  }

  switch (state.status) {
    case "queued":
      return (
        <div className={`flex items-center gap-1 text-muted-foreground ${compact ? "text-xs" : "text-sm"}`}>
          <Clock className={compact ? "h-3 w-3" : "h-4 w-4"} />
          {!compact && <span>Queued</span>}
        </div>
      )

    case "downloading":
      return (
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 ${compact ? "text-xs" : "text-sm"} text-blue-500`}>
            <Loader2 className={`animate-spin ${compact ? "h-3 w-3" : "h-4 w-4"}`} />
            <span>{state.progress}%</span>
          </div>
          {!compact && state.totalBytes > 0 && (
            <span className="text-xs text-muted-foreground">
              {formatBytes(state.bytesDownloaded)} / {formatBytes(state.totalBytes)}
            </span>
          )}
          {onCancel && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancel}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      )

    case "processing":
      return (
        <div className={`flex items-center gap-1 text-amber-500 ${compact ? "text-xs" : "text-sm"}`}>
          <Loader2 className={`animate-spin ${compact ? "h-3 w-3" : "h-4 w-4"}`} />
          {!compact && <span>Processing</span>}
        </div>
      )

    case "complete":
      return (
        <div className={`flex items-center gap-1 text-green-500 ${compact ? "text-xs" : "text-sm"}`}>
          <Check className={compact ? "h-3 w-3" : "h-4 w-4"} />
          {!compact && <span>Done</span>}
        </div>
      )

    case "error":
      return (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size={compact ? "icon" : "sm"}
            onClick={onRetry || onDownload}
            className={`text-red-500 hover:text-red-400 ${compact ? "h-7 w-7" : "h-8 gap-1.5"}`}
          >
            <RefreshCw className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
            {!compact && <span>Retry</span>}
          </Button>
        </div>
      )

    default:
      return null
  }
})
