"use client"

import { useId, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react"

import type { Song } from "@/lib/song"
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
  const headingId = useId()
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
    <section className="surface-section" aria-labelledby={headingId}>
      <h3 id={headingId} className="surface-heading">
        Add to your cloud
      </h3>

      <div className="surface-actions">
        <button type="button" className="text-button" onClick={() => folderInput.current?.click()}>
          Upload folder
        </button>
        <button type="button" className="text-button" onClick={() => filesInput.current?.click()}>
          Upload files
        </button>
      </div>

      {localOnly.length > 0 && !uploads.active ? (
        <div className="surface-row">
          <p className="surface-hint">
            {plural(localOnly.length, "song")} on this device {localOnly.length === 1 ? "isn't" : "aren't"} in
            your cloud yet ({formatBytes(localOnlyBytes)}).
          </p>
          <button type="button" className="solid-button" onClick={() => upload(localOnly)}>
            Sync now
          </button>
        </div>
      ) : null}

      {notice ? <p className="surface-hint">{notice}</p> : null}
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
    <div className="upload-status">
      <div className="surface-row">
        <span className="upload-status-title">
          {uploads.active ? `Uploading — ${finished} of ${uploads.total} done` : "Upload finished"}
        </span>
        {uploads.active && uploads.bytesPerSecond > 0 ? (
          <span className="surface-meta type-data">{formatBytes(uploads.bytesPerSecond)}/s</span>
        ) : null}
      </div>

      <Progress value={percent} aria-label="Upload progress" />

      <p className="upload-status-detail type-data">
        {uploads.active
          ? `${formatBytes(uploads.bytesSent)} of ${formatBytes(uploads.bytesTotal)}${
              remaining > 0 ? ` · ${formatRemaining(remaining)}` : ""
            }`
          : outcome.join(" · ")}
      </p>

      {uploads.inProgress.length > 0 ? (
        <ul className="upload-files type-data">
          {uploads.inProgress.map((file, index) => (
            <li key={`${index}:${file.name}`}>
              <span>{file.name}</span>
              <span>{Math.floor((file.sent / file.size) * 100)}%</span>
            </li>
          ))}
        </ul>
      ) : null}

      {uploads.failed.length > 0 && !uploads.active ? (
        <ul className="upload-files type-data" aria-label="Failed uploads">
          {uploads.failed.slice(0, FAILURES_SHOWN).map((failure, index) => (
            <li key={`${index}:${failure.name}`}>
              <span>{failure.name}</span>
              <span>{failure.reason}</span>
            </li>
          ))}
          {uploads.failed.length > FAILURES_SHOWN ? (
            <li>and {uploads.failed.length - FAILURES_SHOWN} more</li>
          ) : null}
        </ul>
      ) : null}

      <div className="surface-actions upload-status-actions">
        {uploads.active ? (
          <button type="button" className="text-button" onClick={() => cloudUploads.cancel()}>
            Cancel
          </button>
        ) : (
          <>
            {canRetry ? (
              <button type="button" className="text-button" onClick={() => cloudUploads.retryFailed()}>
                Retry failed
              </button>
            ) : null}
            <button type="button" className="text-button" onClick={() => cloudUploads.clear()}>
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  )
}
