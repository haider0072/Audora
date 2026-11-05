"use client"

import { useEffect, useState } from "react"

import { LyricsService, type LyricsData } from "@/lib/lyrics-service"
import type { Song } from "@/lib/song"
import { songInfoKey, useSongResource, type SongResource } from "./use-song-resource"

/**
 * Lyrics already looked up this session, so switching tabs or coming back to
 * a song does not ask again. Null records a song with no lyrics. Bounded by
 * the library itself.
 */
const lyricsBySong = new Map<string, LyricsData | null>()
/** Each song's translation, asked for once and shared by whatever shows its lyrics. */
const translations = new Map<string, Promise<LyricsData | null>>()

/** Lyrics are matched on duration too, so a song needs all three. */
function lyricsKey(song: Song | null): string | null {
  const key = songInfoKey(song)
  return key && song?.duration ? `${key}\u0000${Math.round(song.duration)}` : null
}

async function lookUp(key: string, song: Song): Promise<LyricsData | null> {
  if (lyricsBySong.has(key)) return lyricsBySong.get(key) ?? null
  const data = await LyricsService.fetchLyrics(song.artist!, song.title!, song.duration!)
  const found = data && (data.synced?.length || data.plain) ? data : null
  lyricsBySong.set(key, found)
  return found
}

/** The lyrics with English under lines in other languages; null when nothing needed translating. */
function translate(key: string, lyrics: LyricsData): Promise<LyricsData | null> {
  let pending = translations.get(key)
  if (!pending) {
    pending = LyricsService.withTranslations(lyrics).then((translated) => {
      if (translated) lyricsBySong.set(key, translated)
      return translated
    })
    translations.set(key, pending)
  }
  return pending
}

/**
 * The song's lyrics, null when there are none. They show as soon as they are
 * found; English translations of lines in other languages fill in when ready.
 */
export function useLyrics(song: Song | null): { lyrics: SongResource<LyricsData | null>; retry: () => void } {
  const key = lyricsKey(song)
  const { resource, retry } = useSongResource(key, () => lookUp(key!, song!))
  const [translated, setTranslated] = useState<{ key: string; data: LyricsData } | null>(null)

  const found = resource.status === "ready" ? resource.value : null
  useEffect(() => {
    if (!key || !found) return
    let current = true
    translate(key, found).then((data) => {
      if (data && current) setTranslated({ key, data })
    })
    return () => {
      current = false
    }
  }, [key, found])

  if (found && translated?.key === key) return { lyrics: { status: "ready", value: translated.data }, retry }
  return { lyrics: resource, retry }
}
