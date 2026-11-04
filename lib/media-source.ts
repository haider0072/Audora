/**
 * Where a song's audio comes from, and the URL an `<audio>` element plays it at.
 *
 * A local song carries its `File`, which is played through an object URL this
 * app creates and must later revoke. A cloud song carries a signed R2 URL,
 * which is played as-is and must never be passed to `revokeObjectURL`. Keeping
 * that distinction in one place is what lets the engine and both player
 * shells treat the two kinds of song identically everywhere else.
 */

/** A local file, or the URL of a remote one. */
export type PlayableSource = File | string

interface SourceFields {
  file?: File
  cloud?: { streamUrl: string }
}

/** The source to play a song from, preferring a local copy over the cloud. */
export function songSource(song: SourceFields | null | undefined): PlayableSource | null {
  if (!song) return null
  return song.file ?? song.cloud?.streamUrl ?? null
}

/** A URL an element can load. Object URLs created here are owned by the caller. */
export function createMediaUrl(source: PlayableSource): string {
  return typeof source === "string" ? source : URL.createObjectURL(source)
}

/**
 * Release a URL obtained from `createMediaUrl`. Only object URLs hold memory;
 * a remote URL is simply dropped.
 */
export function releaseMediaUrl(url: string | null | undefined): void {
  if (url && url.startsWith("blob:")) URL.revokeObjectURL(url)
}
