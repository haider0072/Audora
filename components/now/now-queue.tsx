"use client"

import { useMemo, useState, type ReactNode } from "react"

import { SONG_ROW_HEIGHT, SongRow, type LibraryLayout } from "@/components/library/song-row"
import type { SongActions } from "@/components/library/song-menu"
import { StatusMessage } from "@/components/status-message"
import { ScrollArea } from "@/components/ui/scroll-area"
import { rowOffsets, useRowWindow } from "@/hooks/use-row-window"
import type { Song } from "@/lib/song"
import { formatCount } from "@/lib/utils"

/** A heading's height in pixels; songs are as tall as the library's. */
const HEADING_HEIGHT = 44
/** Rows kept rendered past each edge of the viewport, as in the library list. */
const OVERSCAN = 8

type QueueRow =
  | { kind: "heading"; key: string; title: string; clearable: boolean }
  | { kind: "song"; key: string; song: Song; number: number; queued: boolean }

/** The queue as rows: what you queued, then what the library plays after it. */
export function queueRows(queued: readonly Song[], upNext: readonly Song[], shuffle: boolean): QueueRow[] {
  const rows: QueueRow[] = []
  if (queued.length > 0) {
    rows.push({ kind: "heading", key: "queued", title: `Queued · ${formatCount(queued.length, "song")}`, clearable: true })
    queued.forEach((song, index) => rows.push({ kind: "song", key: `queued:${song.id}`, song, number: index + 1, queued: true }))
  }
  if (upNext.length > 0) {
    const title = shuffle ? "Then, shuffled" : "Then, from your library"
    rows.push({ kind: "heading", key: "next", title, clearable: false })
    upNext.forEach((song, index) => rows.push({ kind: "song", key: `next:${song.id}`, song, number: index + 1, queued: false }))
  }
  return rows
}

export interface NowQueueProps {
  /** Songs queued with Play next or Add to queue, in the order they will play. */
  queued: readonly Song[]
  /** What plays once they are done. */
  upNext: readonly Song[]
  shuffle: boolean
  layout: LibraryLayout
  /** A song from the library's part of the queue picked: the library carries on from it. */
  onSelect: (song: Song) => void
  /** A queued song picked: it plays now, and the library carries on from where it was. */
  onPlayQueued: (song: Song) => void
  playNext: (song: Song) => void
  addToQueue: (song: Song) => void
  onDequeue: (songId: string) => void
  onClear: () => void
}

/**
 * What plays next, in order: the songs you queued, which you can take off
 * the queue or clear, then the library's own order or the shuffle. It can
 * run to the whole library, so only the rows in view are rendered.
 */
export function NowQueue({
  queued,
  upNext,
  shuffle,
  layout,
  onSelect,
  onPlayQueued,
  playNext,
  addToQueue,
  onDequeue,
  onClear,
}: NowQueueProps) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const rows = useMemo(() => queueRows(queued, upNext, shuffle), [queued, upNext, shuffle])
  const offsets = useMemo(
    () => rowOffsets(rows.map((row) => (row.kind === "heading" ? HEADING_HEIGHT : SONG_ROW_HEIGHT[layout]))),
    [rows, layout],
  )
  const view = useRowWindow(viewport, offsets, OVERSCAN)

  const queuedActions = useMemo<SongActions>(
    () => ({ playNext, addToQueue, dequeue: (song) => onDequeue(song.id) }),
    [playNext, addToQueue, onDequeue],
  )
  const nextActions = useMemo<SongActions>(() => ({ playNext, addToQueue }), [playNext, addToQueue])

  if (rows.length === 0) {
    return <StatusMessage title="Nothing to play next" detail="Songs you add with Play next or Add to queue show here." />
  }

  const rowContent = (row: QueueRow): ReactNode => {
    if (row.kind === "heading") {
      return (
        <div className="queue-heading">
          <h3 className="queue-heading-title">{row.title}</h3>
          {row.clearable && (
            <button type="button" className="queue-clear" onClick={onClear}>
              Clear
            </button>
          )}
        </div>
      )
    }
    return (
      <SongRow
        song={row.song}
        number={row.number}
        detailed
        layout={layout}
        onSelect={row.queued ? onPlayQueued : onSelect}
        actions={row.queued ? queuedActions : nextActions}
      />
    )
  }

  const placed: ReactNode[] = []
  for (let index = view.start; index < view.end; index++) {
    const row = rows[index]
    placed.push(
      <div
        key={row.key}
        className="library-slot"
        style={{ top: offsets[index], height: offsets[index + 1] - offsets[index] }}
      >
        {rowContent(row)}
      </div>,
    )
  }

  return (
    <div className="queue" data-layout={layout}>
      <ScrollArea className="queue-scroll" viewportRef={setViewport}>
        <div className="library-canvas" style={{ height: offsets[rows.length] }}>
          {placed}
        </div>
      </ScrollArea>
    </div>
  )
}
