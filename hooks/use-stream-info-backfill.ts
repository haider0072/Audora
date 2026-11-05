"use client"

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react"

import type { Song } from "@/components/enhanced-playlist"
import { runBounded } from "@/lib/run-bounded"
import { readStreamDetails, STREAM_INFO_FORMATS, type StreamDetails } from "@/lib/stream-info"

/** Files read at once. Each read is a few headers from local storage; the bound only keeps them from queuing all together. */
const CONCURRENCY = 8

function lacksStreamInfo(song: Song): boolean {
  return (
    !!song.file &&
    (song.sampleRate === undefined || song.bitDepth === undefined) &&
    STREAM_INFO_FORMATS.has(song.format?.toUpperCase() ?? "")
  )
}

async function readStreamDetailsOf(songs: readonly Song[]): Promise<Map<string, StreamDetails>> {
  const found = new Map<string, StreamDetails>()
  await runBounded(songs, CONCURRENCY, async (song) => {
    const file = song.file!
    try {
      const details = await readStreamDetails(file, file.size, song.duration)
      if (details) found.set(song.id, details)
    } catch (error) {
      // The stored file could not be read now; it is tried again on the next visit.
      console.warn(`Could not read the stream info of ${file.name}:`, error)
    }
  })
  return found
}

/**
 * Songs stored before stream info was read have none. Read it from the
 * headers of each one's stored file and fold it into the list, which saves it
 * with the rest of the playlist, so each song is read once. A song is tried
 * once per visit: one whose headers say nothing is left as it is.
 */
export function useStreamInfoBackfill(songs: Song[], setSongs: Dispatch<SetStateAction<Song[]>>) {
  const attempted = useRef(new Set<string>())

  useEffect(() => {
    const due = songs.filter((song) => lacksStreamInfo(song) && !attempted.current.has(song.id))
    if (due.length === 0) return
    for (const song of due) attempted.current.add(song.id)

    void readStreamDetailsOf(due).then((found) => {
      if (found.size === 0) return
      setSongs((list) =>
        list.map((song) => {
          const details = found.get(song.id)
          if (!details) return song
          return {
            ...song,
            sampleRate: details.sampleRate,
            bitDepth: details.bitDepth,
            bitrate: details.bitrate ?? song.bitrate,
          }
        }),
      )
    })
  }, [songs, setSongs])
}
