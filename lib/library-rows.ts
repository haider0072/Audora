/**
 * The library as the rows of one long list, built once for both players.
 *
 * The rows follow the playback order (`sortedSongs`: artist, album year,
 * track), so what you see is what plays next. The grouped view puts an
 * artist header before each artist's songs and an album header before each
 * album's; the list view is every song, with its artist and album beside the
 * title. Each row's kind fixes its height, which is what lets the list
 * render only the rows on screen.
 */

import { albumKey, albumOf, artistKey, artistOf, letterOf, matchesQuery, trackNumberOf } from "@/lib/library-groups"
import type { Song } from "@/lib/song"

export type LibraryViewMode = "grouped" | "list"

export type LibraryRow =
  | { kind: "artist"; key: string; artist: string; songCount: number }
  | { kind: "album"; key: string; artist: string; album: string; songCount: number }
  | {
      kind: "song"
      key: string
      song: Song
      /** Shown before the title: the track number in the grouped view, the position in the list view. */
      number: number
      /** Artist and album under the title, for the list view where no header names them. */
      detailed: boolean
    }

export type LibraryRowKind = LibraryRow["kind"]

/** One artist's rows, [start, end): from the header in the grouped view, from the first song in the list view. */
export interface ArtistRun {
  start: number
  end: number
}

export interface LibraryRows {
  rows: LibraryRow[]
  /** The A–Z letter of each row: its artist's. */
  rowLetters: string[]
  /** Each letter's first row. */
  letterRows: Map<string, number>
  /** Each song's row. */
  songRows: Map<string, number>
  /** Each artist's rows, in order. */
  artistRuns: ArtistRun[]
  /** For each row, its artist's index in `artistRuns`. */
  runOfRow: number[]
}

/**
 * Rows for `sortedSongs` (already in playback order) in the given view,
 * keeping only songs that match `query`.
 */
export function buildLibraryRows(sortedSongs: readonly Song[], viewMode: LibraryViewMode, query = ""): LibraryRows {
  const songs = query.trim() ? sortedSongs.filter((song) => matchesQuery(song, query)) : sortedSongs
  const result: LibraryRows = {
    rows: [],
    rowLetters: [],
    letterRows: new Map(),
    songRows: new Map(),
    artistRuns: [],
    runOfRow: [],
  }

  let lastArtist: string | undefined
  let lastAlbum: string | undefined
  let artistHeader: Extract<LibraryRow, { kind: "artist" }> | undefined
  let albumHeader: Extract<LibraryRow, { kind: "album" }> | undefined
  let positionInAlbum = 0

  const push = (row: LibraryRow, letter: string) => {
    const index = result.rows.length
    result.rows.push(row)
    result.rowLetters.push(letter)
    if (!result.letterRows.has(letter)) result.letterRows.set(letter, index)
    const run = result.artistRuns.length - 1
    result.artistRuns[run].end = index + 1
    result.runOfRow.push(run)
    return index
  }

  for (const song of songs) {
    const artist = artistOf(song)
    const album = albumOf(song)
    const letter = letterOf(artist)
    const nextArtistKey = artistKey(artist)
    const nextAlbumKey = albumKey(artist, album)
    const newArtist = nextArtistKey !== lastArtist
    const newAlbum = newArtist || nextAlbumKey !== lastAlbum
    lastArtist = nextArtistKey
    lastAlbum = nextAlbumKey
    if (newArtist) result.artistRuns.push({ start: result.rows.length, end: result.rows.length })

    if (viewMode === "grouped") {
      if (newArtist) {
        artistHeader = { kind: "artist", key: `artist:${nextArtistKey}`, artist, songCount: 0 }
        push(artistHeader, letter)
      }
      if (newAlbum) {
        albumHeader = { kind: "album", key: `album:${nextAlbumKey}`, artist, album, songCount: 0 }
        positionInAlbum = 0
        push(albumHeader, letter)
      }
      artistHeader!.songCount++
      albumHeader!.songCount++
      positionInAlbum++
      const index = push(
        { kind: "song", key: song.id, song, number: trackNumberOf(song) ?? positionInAlbum, detailed: false },
        letter,
      )
      result.songRows.set(song.id, index)
    } else {
      const index = push({ kind: "song", key: song.id, song, number: result.songRows.size + 1, detailed: true }, letter)
      result.songRows.set(song.id, index)
    }
  }

  return result
}
