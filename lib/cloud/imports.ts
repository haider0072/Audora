import { allowedCoverUrl, fetchCover } from "@/lib/cover-art-url"
import {
  downloadContentType,
  downloadExtension,
  downloadFileName,
  downloadTags,
  type DownloadExtension,
  type DownloadTrack,
} from "@/lib/download-file"
import { withFlacMetadata, type FlacPicture } from "@/lib/flac-art-embedder"
import { fetchLucidaTrackAudio } from "@/lib/lucida-client"
import { decodeId } from "@/lib/lucida-ids"

import { audioContentType } from "./audio-files"
import { AUDIO_SIGNATURE_BYTES, looksLikeAudio } from "./audio-signature"
import type { CloudConfig } from "./config"
import { R2Client } from "./r2"
import type { CloudImportResult } from "./types"
import { placeUpload } from "./uploads"

/**
 * Save an online track straight to the cloud library. Server only.
 *
 * The function fetches the song from the source itself and writes it into
 * the library, so nothing is kept on the device and the audio never crosses
 * the browser's connection. It is named and tagged exactly as a download to
 * the device is, and placed by the same rule as an upload, so the library
 * takes either copy of a track as the same one.
 *
 * The whole file is held in memory while it is tagged, so the function's
 * memory bounds how large a song can be saved this way: hundreds of
 * megabytes are fine, a file near the function's memory is not.
 */

/** A track that could not be saved, with the reason the app shows. */
export class CloudImportError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 502,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = "CloudImportError"
  }
}

export async function importTrack(
  config: CloudConfig,
  track: DownloadTrack,
  signal: AbortSignal,
): Promise<CloudImportResult> {
  const source = decodeId(track.id)
  if (source?.k !== "t") throw new CloudImportError("Not a track this app can fetch", 400)

  const { bytes, extension } = await fetchSong(source.u, signal)
  const file = extension === "flac" ? withFlacMetadata(bytes, downloadTags(track), await loadCover(track.albumCover)) : bytes
  const name = downloadFileName(track.artist, track.title, extension)

  const client = new R2Client(config)
  const place = await placeUpload(client, name, file.length)
  if (place.status === "exists") return { status: "exists", key: place.key }

  // As with an upload, a write that loses a race for its key leaves the copy
  // that won it, which is taken as this track.
  const written = await client.write(place.key, file, { contentType: audioContentType(name), ifNoneMatch: true, signal })
  return { status: written ? "stored" : "exists", key: place.key }
}

/**
 * The song's bytes from the source, and the type they came as. A failure
 * there is the source's, and is reported as one, so the app can tell it
 * apart from the cloud's.
 */
async function fetchSong(
  url: string,
  signal: AbortSignal,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; extension: DownloadExtension }> {
  let audio: Response
  let bytes: Uint8Array<ArrayBuffer>
  try {
    audio = await fetchLucidaTrackAudio(url, { signal })
    if (!audio.ok) throw new CloudImportError(`The source did not send the song (${audio.status})`, 502)
    bytes = new Uint8Array(await audio.arrayBuffer())
  } catch (error) {
    if (error instanceof CloudImportError || signal.aborted) throw error
    throw new CloudImportError("The source could not send the song", 502, { cause: error })
  }

  // The library only takes what opens as audio, so an error page sent as a song stops here.
  if (!looksLikeAudio(bytes.subarray(0, AUDIO_SIGNATURE_BYTES))) {
    throw new CloudImportError("The source sent something that is not a song", 502)
  }
  return { bytes, extension: downloadExtension(downloadContentType(audio.headers)) }
}

/**
 * The cover to embed, or null when the track has none the server may fetch
 * or fetching it failed: a song is saved without its cover rather than not
 * at all, as a download to the device is.
 */
async function loadCover(raw: string | undefined): Promise<FlacPicture | null> {
  if (!raw) return null
  const url = allowedCoverUrl(raw)
  if (!url) {
    console.warn("Not fetching a cover from outside the catalogs; saving the song without it")
    return null
  }

  try {
    const response = await fetchCover(url)
    if (!response.ok) {
      console.warn(`Could not fetch the cover (${response.status}); saving the song without it`)
      return null
    }
    return { data: new Uint8Array(await response.arrayBuffer()), type: response.headers.get("content-type") ?? "" }
  } catch (error) {
    console.warn("Could not fetch the cover; saving the song without it:", error)
    return null
  }
}
