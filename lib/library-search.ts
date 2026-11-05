/**
 * The library's side of a search, at a glance: the best few songs, the
 * albums and artists whose names hold the words, and how many songs match in
 * all. The desktop's search shows these over the online results, with every
 * match a step away.
 */

import { albumKey, albumOf, artistKey, artistOf, matchesQuery, yearOf } from "@/lib/library-groups"
import type { LibraryPage } from "@/lib/library-pages"
import type { Song } from "@/lib/song"

/** Songs shown at a glance; the rest are a step away, under Show all. */
export const GLANCE_SONGS = 5
/** Albums, and artists, shown at a glance. */
export const GLANCE_PAGES = 3

/** An album or an artist whose name holds the words. */
export interface PageMatch {
  page: LibraryPage
  /** Its songs in the library. */
  count: number
  /** Its first song, whose cover stands for it. */
  cover: Song
  /** An album's year, where its songs say. */
  year?: number
}

export interface LibraryMatches {
  /** Every song that matches, in all. */
  total: number
  /** The best few: songs whose title holds the words first, then the rest, each in library order. */
  songs: readonly Song[]
  /** Albums whose title holds the words, the fullest first. */
  albums: readonly PageMatch[]
  /** Artists whose name holds the words, the fullest first. */
  artists: readonly PageMatch[]
}

const NO_MATCHES: LibraryMatches = { total: 0, songs: [], albums: [], artists: [] }

function count(pages: Map<string, PageMatch>, key: string, make: () => PageMatch) {
  const found = pages.get(key)
  if (found) found.count += 1
  else pages.set(key, make())
}

/** The fullest first; equals keep their library order. */
function fullest(pages: Map<string, PageMatch>): PageMatch[] {
  return [...pages.values()].sort((a, b) => b.count - a.count).slice(0, GLANCE_PAGES)
}

/** The library's matches for `query`, in one pass over `songs` (in library order). */
export function libraryMatches(songs: readonly Song[], query: string): LibraryMatches {
  const needle = query.trim().toLowerCase()
  if (!needle) return NO_MATCHES

  let total = 0
  const byTitle: Song[] = []
  const byOther: Song[] = []
  const albums = new Map<string, PageMatch>()
  const artists = new Map<string, PageMatch>()

  for (const song of songs) {
    if (!matchesQuery(song, needle)) continue
    total += 1
    if (song.title?.toLowerCase().includes(needle)) {
      if (byTitle.length < GLANCE_SONGS) byTitle.push(song)
    } else if (byOther.length < GLANCE_SONGS) {
      byOther.push(song)
    }

    const artist = artistOf(song)
    if (artist.toLowerCase().includes(needle)) {
      count(artists, artistKey(artist), () => ({ page: { kind: "artist", artist }, count: 1, cover: song }))
    }
    const album = albumOf(song)
    if (song.album && album.toLowerCase().includes(needle)) {
      count(albums, albumKey(artist, album), () => ({
        page: { kind: "album", artist, album },
        count: 1,
        cover: song,
        year: yearOf(song),
      }))
    }
  }

  return {
    total,
    songs: [...byTitle, ...byOther].slice(0, GLANCE_SONGS),
    albums: fullest(albums),
    artists: fullest(artists),
  }
}
