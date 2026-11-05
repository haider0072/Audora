/**
 * Which artist and album a song belongs to. The playback order, the library
 * list and the album and artist pages all group songs by these, so they agree
 * on what one artist or one album is.
 */

import type { Song } from "@/lib/song"

const UNKNOWN_ARTIST = "Unknown Artist"
const UNKNOWN_ALBUM = "Unknown Album"

/** The artist a song is grouped and sorted under: its first credited artist. */
export function artistOf(song: Song): string {
  return (song.artists?.[0] || song.artist || UNKNOWN_ARTIST).trim()
}

export function albumOf(song: Song): string {
  return (song.album || UNKNOWN_ALBUM).trim()
}

/** One artist, however their name is cased. */
export function artistKey(artist: string): string {
  return artist.toLowerCase()
}

/** One album of one artist, however either name is cased. */
export function albumKey(artist: string, album: string): string {
  return `${artistKey(artist)}::${album.toLowerCase()}`
}

/** The leading number of a track tag ("3", or "3/12"). */
export function trackNumberOf(song: Song): number | undefined {
  const n = Number.parseInt(song.trackNumber ?? "", 10)
  return Number.isNaN(n) ? undefined : n
}

/** The first four-digit run in a song's year tag ("2021", or "2021-05-03"). */
export function yearOf(song: Song): number | undefined {
  const match = song.year?.match(/\d{4}/)
  return match ? Number.parseInt(match[0], 10) : undefined
}

/** "#" for anything that does not start with a Latin letter. */
export function letterOf(artist: string): string {
  const first = artist.charAt(0).toUpperCase()
  return /[A-Z]/.test(first) ? first : "#"
}

/** Whether a song's title, artist, album or genre contains `query`, ignoring case. */
export function matchesQuery(song: Song, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [song.title, song.artist, song.album, song.genre].some((field) => field?.toLowerCase().includes(needle))
}
