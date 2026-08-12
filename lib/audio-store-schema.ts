/**
 * Shared shape of the `audio-files` object store.
 *
 * Three record kinds live in this one store, distinguished by `type`:
 *
 *   - audio          — the song file itself, keyed by songId
 *   - albumart       — a *pointer* from a song to its cover, keyed `${songId}_albumart`
 *   - albumart-blob  — the cover bytes, keyed by content hash and shared by every
 *                      song pointing at it (a 12-track album keeps one copy, not 12)
 *
 * Records written before content-addressed art existed carry the blob inline on the
 * `albumart` record and have no `artHash`. Those stay readable — see `isLegacyArt`.
 */

export const AUDIO_DB_NAME = "enhanced-music-player-db"
export const AUDIO_DB_VERSION = 1
export const AUDIO_STORE_NAME = "audio-files"

const ART_SUFFIX = "_albumart"
const ART_BLOB_PREFIX = "albumart-blob-"

/**
 * A record written this recently is assumed to belong to an in-flight import or
 * download whose playlist metadata has not been persisted yet, so orphan
 * collection leaves it alone. The auto-save debounce is 1s; this is generously
 * above that to also cover a slow multi-track batch.
 */
export const ORPHAN_GRACE_MS = 5 * 60 * 1000

export interface AudioRecord {
  id: string
  file: File
  fileName: string
  fileSize: number
  fileType: string
  lastModified: number
  /** Absent on records written before storedAt existed; treated as "old". */
  storedAt?: number
}

export interface ArtPointerRecord {
  id: string
  type: "albumart"
  songId: string
  mimeType: string
  size: number
  storedAt?: number
  /** Present on content-addressed records; absent on legacy inline ones. */
  artHash?: string
  /** Only on legacy records written before content addressing. */
  blob?: Blob
}

export interface ArtBlobRecord {
  id: string
  type: "albumart-blob"
  blob: Blob
  mimeType: string
  size: number
  refCount: number
  storedAt: number
}

export type AudioStoreRecord = AudioRecord | ArtPointerRecord | ArtBlobRecord

export const artPointerKey = (songId: string): string => `${songId}${ART_SUFFIX}`

export const artBlobKey = (hash: string): string => `${ART_BLOB_PREFIX}${hash}`

export const isArtPointerKey = (key: string): boolean => key.endsWith(ART_SUFFIX)

export const isArtBlobKey = (key: string): boolean => key.startsWith(ART_BLOB_PREFIX)

/** Recover the owning songId from an art pointer key. */
export const songIdFromArtPointerKey = (key: string): string => key.slice(0, -ART_SUFFIX.length)

export const isArtPointer = (r: AudioStoreRecord): r is ArtPointerRecord =>
  (r as ArtPointerRecord).type === "albumart"

export const isArtBlob = (r: AudioStoreRecord): r is ArtBlobRecord =>
  (r as ArtBlobRecord).type === "albumart-blob"

export const isAudio = (r: AudioStoreRecord): r is AudioRecord =>
  !isArtPointer(r) && !isArtBlob(r)

/** A pointer that still carries its own bytes, from before content addressing. */
export const isLegacyArt = (r: ArtPointerRecord): boolean => !r.artHash && !!r.blob

/**
 * Orphan collection only touches records old enough that no in-flight write can
 * own them. Records predating `storedAt` are by definition older than this run.
 */
export const isOrphanEligible = (storedAt: number | undefined, now: number): boolean =>
  !storedAt || now - storedAt > ORPHAN_GRACE_MS
