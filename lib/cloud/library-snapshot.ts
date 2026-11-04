import type { CloudLibraryResponse } from "./types"

/**
 * The last cloud listing this device saw, kept so the library is on screen
 * the moment the app opens instead of after a round trip through the server
 * to R2. Client only.
 *
 * Its signed URLs stay valid for days, so a snapshot is playable as-is; the
 * fresh listing replaces it as soon as it arrives. It is cleared on sign-out
 * and whenever the server reports this device signed out, so it never
 * outlives the session that fetched it.
 */

const CACHE_NAME = "audora-cloud-library-v1"
/** A key in this origin's Cache Storage only; nothing ever fetches it. */
const SNAPSHOT_PATH = "/__cloud-library/snapshot"

/** A snapshot whose URLs expire sooner than this is not worth showing. */
const MIN_REMAINING_VALIDITY_MS = 60 * 60 * 1000

function snapshotRequest(): Request {
  return new Request(new URL(SNAPSHOT_PATH, window.location.origin))
}

function hasCacheStorage(): boolean {
  return typeof window !== "undefined" && "caches" in window
}

function isLibrary(value: unknown): value is CloudLibraryResponse {
  const library = value as CloudLibraryResponse | null
  return (
    !!library &&
    Array.isArray(library.songs) &&
    typeof library.urlsExpireAt === "number" &&
    typeof library.pending === "number"
  )
}

export async function readLibrarySnapshot(now: number = Date.now()): Promise<CloudLibraryResponse | null> {
  if (!hasCacheStorage()) return null
  try {
    const response = await (await caches.open(CACHE_NAME)).match(snapshotRequest())
    if (!response) return null
    const library: unknown = await response.json()
    if (!isLibrary(library) || library.urlsExpireAt - now < MIN_REMAINING_VALIDITY_MS) return null
    return library
  } catch (error) {
    console.warn("Cloud library snapshot could not be read; loading from the server:", error)
    return null
  }
}

export async function saveLibrarySnapshot(library: CloudLibraryResponse): Promise<void> {
  if (!hasCacheStorage()) return
  try {
    const body = JSON.stringify(library)
    await (await caches.open(CACHE_NAME)).put(
      snapshotRequest(),
      new Response(body, { headers: { "Content-Type": "application/json" } }),
    )
  } catch (error) {
    // Only startup speed depends on it; the next save tries again.
    console.warn("Cloud library snapshot could not be saved:", error)
  }
}

export async function clearLibrarySnapshot(): Promise<void> {
  if (!hasCacheStorage()) return
  try {
    await caches.delete(CACHE_NAME)
  } catch (error) {
    console.error("Cloud library snapshot could not be cleared:", error)
  }
}
