import { makeUploadName } from "@/lib/cloud/upload-rules"
import type { FlacMetadata } from "@/lib/flac-art-embedder"
import type { TidalTrack } from "@/lib/tidal-types"

/**
 * How an online download is named and tagged, wherever it is saved: on this
 * device, or by the server straight into the cloud library. Both ways give a
 * song the same name, so the library takes either copy as the same track.
 */

/** The file types a download arrives as: FLAC, or AAC in an MP4 file. */
export const DOWNLOAD_EXTENSIONS = ["flac", "m4a"] as const

export type DownloadExtension = (typeof DOWNLOAD_EXTENSIONS)[number]

/**
 * What saving a track needs to know of it: the id the source fetches it by,
 * what it is named after, and the catalog's details it is tagged with.
 * Everything past the name is optional, as the catalog does not always say.
 */
export interface DownloadTrack {
  id: string
  title: string
  artist: string
  albumTitle?: string
  albumCover?: string
  releaseDate?: string
  genre?: string
  trackNumber?: number
  discNumber?: number
  copyright?: string
  isrc?: string
}

/** The part of a catalog track that saving it needs, as the app sends it to the cloud import. */
export function downloadTrack(track: TidalTrack): DownloadTrack {
  const { id, title, artist, albumTitle, albumCover, releaseDate, genre, trackNumber, discNumber, copyright, isrc } =
    track
  return { id, title, artist, albumTitle, albumCover, releaseDate, genre, trackNumber, discNumber, copyright, isrc }
}

/**
 * The type a download came as. The source labels every file it sends; one
 * it did not is taken as FLAC, the format it sends most.
 */
export function downloadContentType(headers: Headers): string {
  return headers.get("content-type") || "audio/flac"
}

export function downloadExtension(contentType: string): DownloadExtension {
  return contentType.includes("flac") ? "flac" : "m4a"
}

export function downloadFileName(artist: string, title: string, extension: DownloadExtension): string {
  return makeUploadName(`${artist} - ${title}`, extension)
}

/** The tags a download carries: the catalog's own, as Vorbis comments. */
export function downloadTags(track: DownloadTrack): FlacMetadata {
  return {
    title: track.title,
    artist: track.artist,
    album: track.albumTitle,
    albumArtist: track.artist,
    date: track.releaseDate ? track.releaseDate.slice(0, 4) : undefined,
    genre: track.genre || undefined,
    trackNumber: track.trackNumber ? String(track.trackNumber) : undefined,
    discNumber: track.discNumber ? String(track.discNumber) : undefined,
    copyright: track.copyright || undefined,
    isrc: track.isrc || undefined,
  }
}
