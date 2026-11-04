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
  isHiRes?: boolean
  format?: string
  /** Signed GET for the audio. */
  streamUrl: string
  /** Signed GET for the cover, when the file embeds one. */
  artUrl?: string
}

export interface CloudLibraryResponse {
  songs: CloudSong[]
  /** Objects in the bucket not yet indexed; the client asks for indexing while this is non-zero. */
  pending: number
  /** Milliseconds since epoch after which `streamUrl`/`artUrl` stop working. */
  urlsExpireAt: number
}

export interface CloudIndexResponse {
  indexed: number
  pending: number
}

/** The cloud side of a song, attached to `Song.cloud`. */
export interface CloudSongRef {
  key: string
  streamUrl: string
}
