/**
 * Identifying the same track on two different machines.
 *
 * Library ids are `name-size-lastModified` (see `use-file-importer`), and the
 * modification time is a property of the copy rather than the recording: the
 * same album pulled onto a laptop and onto a desktop on different days carries
 * different timestamps, so ids do not agree across devices even when the bytes
 * are identical.
 *
 * The key here drops the timestamp and keeps name and byte size. Size alone is
 * a strong discriminator — two different encodes agreeing to the byte is rare —
 * and pairing it with the file name makes a collision within one library
 * effectively impossible. Names are normalized because the same file arriving
 * over different paths can differ in Unicode composition (macOS decomposes
 * accents, Windows does not) or in case on a case-insensitive volume.
 */

import type { TrackKey } from "./protocol"

/** The fields a track must expose to take part in a sync session. */
export interface SyncTrackFields {
  fileName?: string
  fileSize?: number
  file?: { name: string; size: number }
  title?: string
  artist?: string
}

/**
 * Cross-device key for a track, or null when the track lacks the fields to
 * make one. A null key means the track simply cannot be synced; callers
 * surface that rather than guessing at a weaker match.
 */
export function trackSyncKey(track: SyncTrackFields | null | undefined): TrackKey | null {
  if (!track) return null

  const name = track.fileName ?? track.file?.name
  const size = track.fileSize ?? track.file?.size

  if (!name || typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return null
  }

  return `${size}:${normalizeName(name)}`
}

/**
 * Fold away the differences a file name can pick up in transit without its
 * contents changing: Unicode composition, case, and surrounding whitespace.
 */
function normalizeName(name: string): string {
  return name.normalize("NFC").trim().toLowerCase()
}

/** Find the local track matching a peer's key, or null when absent. */
export function findTrackByKey<T extends SyncTrackFields>(
  tracks: readonly T[],
  key: TrackKey | null,
): T | null {
  if (!key) return null
  return tracks.find((track) => trackSyncKey(track) === key) ?? null
}

/** Short "Title — Artist" label, shown when a follower cannot resolve a key. */
export function trackLabel(track: SyncTrackFields | null | undefined): string {
  if (!track) return "Nothing playing"
  const title = track.title?.trim() || track.fileName || track.file?.name || "Unknown track"
  const artist = track.artist?.trim()
  return artist ? `${title} — ${artist}` : title
}
