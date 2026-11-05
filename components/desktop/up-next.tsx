"use client"

import { useId, useMemo } from "react"

import type { SongActions } from "@/components/library/song-menu"
import { SongRow } from "@/components/library/song-row"
import type { Song } from "@/lib/song"
import { formatCount } from "@/lib/utils"

interface UpNextProps {
  /** Songs queued with Play next or Add to queue, in the order they will play. */
  queued: readonly Song[]
  /** A queued song picked: it plays now, and the library carries on from where it was. */
  onPlayQueued: (song: Song) => void
  playNext: (song: Song) => void
  addToQueue: (song: Song) => void
  onDequeue: (songId: string) => void
  onClear: () => void
}

/**
 * What you queued, over the library, and only while there is any: the songs
 * in the order they will play, each one off the queue from its menu, or all
 * of them at once. Styled by `.up-next`.
 */
export function UpNext({ queued, onPlayQueued, playNext, addToQueue, onDequeue, onClear }: UpNextProps) {
  const headingId = useId()
  const actions = useMemo<SongActions>(
    () => ({ playNext, addToQueue, dequeue: (song) => onDequeue(song.id) }),
    [playNext, addToQueue, onDequeue],
  )

  if (queued.length === 0) return null
  return (
    <section className="up-next" aria-labelledby={headingId}>
      <div className="up-next-head">
        <h2 id={headingId} className="up-next-title">
          Up next <span className="type-data">{formatCount(queued.length, "song")}</span>
        </h2>
        <button type="button" className="text-button" onClick={onClear}>
          Clear
        </button>
      </div>
      <ol className="up-next-list">
        {queued.map((song, index) => (
          <li key={song.id}>
            <SongRow song={song} number={index + 1} detailed layout="desktop" onSelect={onPlayQueued} actions={actions} />
          </li>
        ))}
      </ol>
    </section>
  )
}
