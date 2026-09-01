/**
 * A stable, storable way to say "this song has album art in IndexedDB".
 *
 * Album art used to travel as a live `blob:` URL. That forced every producer to
 * mint an object URL the moment it knew art existed — restore alone created one
 * per song in the library — and each of those URLs pins its blob in memory
 * until it is revoked, which nothing did. A reference costs nothing to hold and
 * resolves to a real URL only when something is about to display it.
 *
 * It also survives a reload, which a `blob:` URL does not: the old value was
 * written to localStorage and was already dead by the time it was read back.
 */

const SCHEME = "audora-art:"

/** Reference to the art stored for `songId`. */
export function storedArtRef(songId: string): string {
  return `${SCHEME}${songId}`
}

export function isStoredArtRef(value: string): boolean {
  return value.startsWith(SCHEME)
}

/** The song whose art this refers to, or null if it is not a reference. */
export function songIdFromArtRef(value: string): string | null {
  return isStoredArtRef(value) ? value.slice(SCHEME.length) : null
}
