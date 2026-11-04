import { AlbumArtCache } from "@/lib/album-art-cache"
import { audioWarmer } from "@/lib/cloud/audio-warmer"
import { songSource } from "@/lib/media-source"

/**
 * Get a song ready to play the moment it is chosen. Client only.
 *
 * Only songs that would stream from the cloud need it — a local file starts
 * instantly — so for everything else these are no-ops. The cover is warmed
 * alongside the audio, so the now-playing view has it as the song starts.
 */

/** How long the pointer must rest on a song before it counts as intent. */
const HOVER_INTENT_MS = 150

let hoverTimer: ReturnType<typeof setTimeout> | null = null

interface WarmableSong {
  id: string
  file?: File
  cloud?: { streamUrl: string }
  albumArt?: string
}

function streamUrlOf(song: WarmableSong): string | null {
  const source = songSource(song)
  return typeof source === "string" ? source : null
}

/** Warm a song that is about to be played: pressed, or next in line. */
export function warmSong(song: WarmableSong | null | undefined): void {
  const url = song ? streamUrlOf(song) : null
  if (!song || !url) return
  audioWarmer.warm(url)
  void AlbumArtCache.warmAlbumArt(song.id, song.albumArt)
}

/** The pointer has come to rest on a song; warm it if it stays a moment. */
export function hoverSong(song: WarmableSong): void {
  leaveSong()
  if (!streamUrlOf(song)) return
  hoverTimer = setTimeout(() => warmSong(song), HOVER_INTENT_MS)
}

export function leaveSong(): void {
  if (hoverTimer) clearTimeout(hoverTimer)
  hoverTimer = null
}
