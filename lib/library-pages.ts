/**
 * Album and artist pages: what each one holds, and the stack of them that
 * opens over the library list.
 */

import { albumKey, albumOf, artistKey, artistOf, trackNumberOf, yearOf } from "@/lib/library-groups"
import type { Song } from "@/lib/song"

/** A page over the library list: an artist, or one of their albums, named as the library shows them. */
export type LibraryPage =
  | { kind: "artist"; artist: string }
  | { kind: "album"; artist: string; album: string }

export function artistPage(song: Song): LibraryPage {
  return { kind: "artist", artist: artistOf(song) }
}

export function albumPage(song: Song): LibraryPage {
  return { kind: "album", artist: artistOf(song), album: albumOf(song) }
}

/** The same for every description of one page, whatever its casing. */
export function pageKey(page: LibraryPage): string {
  return page.kind === "artist" ? `artist:${artistKey(page.artist)}` : `album:${albumKey(page.artist, page.album)}`
}

export function pageTitle(page: LibraryPage): string {
  return page.kind === "artist" ? page.artist : page.album
}

/** Whether a song is on a page. */
function onPage(page: LibraryPage): (song: Song) => boolean {
  if (page.kind === "artist") {
    const artist = artistKey(page.artist)
    return (song) => artistKey(artistOf(song)) === artist
  }
  const album = albumKey(page.artist, page.album)
  return (song) => albumKey(artistOf(song), albumOf(song)) === album
}

export function pageHasSongs(songs: readonly Song[], page: LibraryPage): boolean {
  return songs.some(onPage(page))
}

/** One album on a page. */
export interface AlbumSection {
  key: string
  album: string
  /** The first year any of its songs gives. */
  year?: number
  /** In playback order. */
  songs: Song[]
  /** Shown before each song: its track number, or its place in the album without one. */
  numbers: number[]
  /** Seconds. */
  duration: number
}

/**
 * The albums a page shows: all of an artist's, or the one. `songs` must be in
 * playback order, as `sortedSongs` is, and the albums keep it.
 */
export function pageSections(songs: readonly Song[], page: LibraryPage): AlbumSection[] {
  const sections = new Map<string, AlbumSection>()
  for (const song of songs.filter(onPage(page))) {
    const album = albumOf(song)
    const key = albumKey(artistOf(song), album)
    let section = sections.get(key)
    if (!section) {
      section = { key, album, songs: [], numbers: [], duration: 0 }
      sections.set(key, section)
    }
    section.songs.push(song)
    section.numbers.push(trackNumberOf(song) ?? section.songs.length)
    section.duration += song.duration ?? 0
    section.year ??= yearOf(song)
  }
  return [...sections.values()]
}

/**
 * The stack once `page` is opened from inside the library. A page already on
 * the stack is gone back to rather than opened again, so moving between an
 * artist and their albums never piles pages up.
 */
export function openPage(stack: readonly LibraryPage[], page: LibraryPage): readonly LibraryPage[] {
  const key = pageKey(page)
  const at = stack.findIndex((open) => pageKey(open) === key)
  if (at === -1) return [...stack, page]
  return at === stack.length - 1 ? stack : stack.slice(0, at + 1)
}
