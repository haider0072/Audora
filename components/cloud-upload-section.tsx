"use client"

import { useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react"
import { CloudUpload, FileAudio, FolderUp, RotateCcw, X } from "lucide-react"

import type { Song } from "@/components/enhanced-playlist"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { AUDIO_FILE_ACCEPT, isAudioFileName } from "@/lib/cloud/audio-files"
import { cloudUploads, type UploadSnapshot } from "@/lib/cloud/upload-queue"
import { formatBytes } from "@/lib/storage-quota"
import { trackSyncKey } from "@/lib/sync/song-match"

/**
 * Uploading to the cloud library: a folder, loose files, or every song this
 * device has that the cloud does not. Lives in the cloud panel; the batch
 * itself runs in `cloudUploads`, so closing the panel does not stop it.
 */

/** Failures listed by name; the rest are counted. */
const FAILURES_SHOWN = 5

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`
}

function formatRemaining(seconds: number): string {
  if (seconds < 60) return "under a minute left"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `about ${minutes} min left`
  return `about ${Math.floor(minutes / 60)} h ${minutes % 60} min left`
}

interface CloudUploadSectionProps {
  songs: readonly Song[]
}

export function CloudUploadSection({ songs }: CloudUploadSectionProps) {
  const uploads = useSyncExternalStore(cloudUploads.subscribe, cloudUploads.getSnapshot, cloudUploads.getSnapshot)
  const folderInput = useRef<HTMLInputElement>(null)
  const filesInput = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // What the cloud already holds, and the songs only this device has.
  const { inCloud, localOnly, localOnlyBytes } = useMemo(() => {
    const inCloud = new Set<string>()
    const localOnly: File[] = []
    let localOnlyBytes = 0
    for (const song of songs) {
      if (song.cloud) {
        const track = trackSyncKey(song)
        if (track) inCloud.add(track)
      } else if (song.file && isAudioFileName(song.file.name)) {
        localOnly.push(song.file)
        localOnlyBytes += song.file.size
      }
    }
    return { inCloud, localOnly, localOnlyBytes }
  }, [songs])

  const upload = (files: Iterable<File>) => {
    const audio = cloudUploads.add(files, (track) => inCloud.has(track))
    setNotice(audio === 0 ? "No music files there — pick FLAC, MP3, M4A, AAC, WAV, OGG or Opus." : null)
  }

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    // Reset, so picking the same folder again still fires a change.
    event.target.value = ""
    if (files.length > 0) upload(files)
  }

  return (
    <section className="space-y-3 border-t pt-4" aria-label="Upload to the cloud">
      <div className="flex items-center gap-2">
        <CloudUpload className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Add to your cloud</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => folderInput.current?.click()}>
          <FolderUp className="mr-2 h-4 w-4" />
          Upload folder
        </Button>
        <Button variant="secondary" onClick={() => filesInput.current?.click()}>
          <FileAudio className="mr-2 h-4 w-4" />
          Upload files
        </Button>
      </div>

      {localOnly.length > 0 && !uploads.active ? (
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <p className="text-sm text-muted-foreground">
            {plural(localOnly.length, "song")} on this device {localOnly.length === 1 ? "isn't" : "aren't"} in
            your cloud yet ({formatBytes(localOnlyBytes)}).
          </p>
          <Button size="sm" className="shrink-0" onClick={() => upload(localOnly)}>
            Sync now
          </Button>
        </div>
      ) : null}

      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {uploads.total > 0 ? <UploadStatus uploads={uploads} /> : null}

      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        onChange={onPick}
        {...({ webkitdirectory: "" } as Record<string, string>)}
      />
      <input ref={filesInput} type="file" multiple hidden accept={AUDIO_FILE_ACCEPT} onChange={onPick} />
    </section>
  )
}

function UploadStatus({ uploads }: { uploads: UploadSnapshot }) {
  const percent = uploads.bytesTotal > 0 ? (uploads.bytesSent / uploads.bytesTotal) * 100 : 100
  const finished = uploads.uploaded + uploads.skipped + uploads.failed.length
  const canRetry = uploads.failed.some((failure) => failure.retryable)
  const remaining = uploads.bytesPerSecond > 0 ? (uploads.bytesTotal - uploads.bytesSent) / uploads.bytesPerSecond : 0

  const outcome = [
    uploads.uploaded > 0 ? `${uploads.uploaded} uploaded` : null,
    uploads.skipped > 0 ? `${uploads.skipped} already in your cloud` : null,
    uploads.failed.length > 0 ? `${uploads.failed.length} failed` : null,
  ].filter(Boolean)

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">
          {uploads.active ? `Uploading — ${finished} of ${uploads.total} done` : "Upload finished"}
        </span>
        {uploads.active && uploads.bytesPerSecond > 0 ? (
          <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(uploads.bytesPerSecond)}/s</span>
        ) : null}
      </div>

      <Progress value={percent} className="h-2" aria-label="Upload progress" />

      <p className="text-xs text-muted-foreground">
        {uploads.active
          ? `${formatBytes(uploads.bytesSent)} of ${formatBytes(uploads.bytesTotal)}${
              remaining > 0 ? ` · ${formatRemaining(remaining)}` : ""
            }`
          : outcome.join(" · ")}
      </p>

      {uploads.inProgress.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {uploads.inProgress.map((file, index) => (
            <li key={`${index}:${file.name}`} className="flex justify-between gap-2">
              <span className="truncate">{file.name}</span>
              <span className="shrink-0 tabular-nums">{Math.floor((file.sent / file.size) * 100)}%</span>
            </li>
          ))}
        </ul>
      ) : null}

      {uploads.failed.length > 0 && !uploads.active ? (
        <ul className="space-y-0.5 text-xs">
          {uploads.failed.slice(0, FAILURES_SHOWN).map((failure, index) => (
            <li key={`${index}:${failure.name}`} className="flex justify-between gap-2">
              <span className="truncate">{failure.name}</span>
              <span className="shrink-0 text-destructive">{failure.reason}</span>
            </li>
          ))}
          {uploads.failed.length > FAILURES_SHOWN ? (
            <li className="text-muted-foreground">and {uploads.failed.length - FAILURES_SHOWN} more</li>
          ) : null}
        </ul>
      ) : null}

      <div className="flex justify-end gap-2">
        {uploads.active ? (
          <Button size="sm" variant="ghost" onClick={() => cloudUploads.cancel()}>
            <X className="mr-1 h-4 w-4" />
            Cancel
          </Button>
        ) : (
          <>
            {canRetry ? (
              <Button size="sm" variant="secondary" onClick={() => cloudUploads.retryFailed()}>
                <RotateCcw className="mr-1 h-4 w-4" />
                Retry failed
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => cloudUploads.clear()}>
              Dismiss
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
