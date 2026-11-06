/**
 * Shapes shared by the cloud library's server routes and its client.
 *
 * Nothing in this module may import server code: it is pulled into the
 * browser bundle by the client hook.
 */

/** Everything the client needs to list and play one cloud song. */
export interface CloudSong {
  /** Stable id derived from the object key; prefixed so it never collides with a local id. */
  id: string
  /** Object key in the bucket, e.g. `library/Artist/Album/01 Song.flac`. */
  key: string
  /** Last path segment of `key` — the file name as it was uploaded. */
  fileName: string
  fileSize: number
  title?: string
  artist?: string
  artists?: string[]
  albumArtist?: string
  album?: string
  year?: string
  genre?: string
  trackNumber?: string
  discNumber?: string
  duration?: number
  bitrate?: number
  /** From the file's header, for lossless formats. */
  sampleRate?: number
  bitDepth?: number
  format?: string
  /** Signed GET for the audio. */
  streamUrl: string
  /** Signed GET for the cover at now-playing size, when the file embeds one. */
  artUrl?: string
  /** Signed GET for the cover at list-row size. Absent until the song is re-indexed. */
  thumbUrl?: string
}

export interface CloudLibraryResponse {
  songs: CloudSong[]
  /** Objects in the bucket not yet indexed, so not in `songs`. */
  pending: number
  /**
   * Songs in `songs` indexed by an older version of the indexer. They play
   * as they are; the client keeps indexing while this or `pending` is non-zero.
   */
  outdated: number
  /** Milliseconds since epoch after which `streamUrl`/`artUrl` stop working. */
  urlsExpireAt: number
}

export interface CloudIndexResponse {
  indexed: number
  pending: number
}

/** The answer to asking where one file should be uploaded. */
export type CloudUploadPlan =
  /** Send the file with a PUT to `url`, with exactly these headers. */
  | { status: "upload"; key: string; url: string; headers: Record<string, string> }
  /** The library already holds this track; nothing to send. */
  | { status: "exists"; key: string }

/** The answer to saving an online track straight to the cloud library. */
export interface CloudImportResult {
  /** `stored` when the song was written now; `exists` when the library already held it. */
  status: "stored" | "exists"
  key: string
}

/** The cloud side of a song, attached to `Song.cloud`. */
export interface CloudSongRef {
  key: string
  streamUrl: string
}
