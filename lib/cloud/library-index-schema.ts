import { z } from "zod"

import type { CloudSong } from "./types"

/**
 * The stored shape of the cloud library index, and the validation it passes
 * on every read. Pure — no credentials, no network.
 *
 * The index is written only by this app, but it lives in a bucket other
 * tools can write to, and its tags end up in the UI. So it is read as
 * untrusted: unknown fields are dropped, and an entry that does not fit is
 * discarded on its own — that file is simply indexed again — rather than
 * taking the whole library down with it.
 */

export const ART_PREFIX = "art/"

/**
 * What an entry written today records. Bumped whenever indexing learns to
 * capture something new; an entry from an older format is still served as it
 * is, and re-read in the background to bring it up to date.
 *
 * 1. Tags and the original embedded cover (`artKey`).
 * 2. Rendered covers (`covers`) in place of the original.
 * 3. Stream info (`sampleRate`, `bitDepth`) from the file's header, in place
 *    of the old `isHiRes` guess, and the `bitrate` of the audio alone. A
 *    format 2 entry needs only its file's headers read again to get there
 *    (see `canAddStreamInfo`).
 */
export const ENTRY_FORMAT = 3

/** The format whose entries already hold everything else format 3 records. */
const COVERS_FORMAT = 2

/** Tag fields kept per song: everything on `CloudSong` the listing does not already know. */
export type SongTags = Omit<CloudSong, "id" | "key" | "fileName" | "fileSize" | "streamUrl" | "artUrl" | "thumbUrl">

const text = z.string()

const tagsSchema: z.ZodType<SongTags> = z.object({
  title: text.optional(),
  artist: text.optional(),
  artists: z.array(text).optional(),
  albumArtist: text.optional(),
  album: text.optional(),
  year: text.optional(),
  genre: text.optional(),
  trackNumber: text.optional(),
  discNumber: text.optional(),
  duration: z.number().nonnegative().optional(),
  bitrate: z.number().nonnegative().optional(),
  sampleRate: z.number().int().positive().optional(),
  bitDepth: z.number().int().positive().optional(),
  format: text.optional(),
})

const artKey = z.string().startsWith(ART_PREFIX)

const entrySchema = z.object({
  /** Absent on entries written before formats were numbered, which are format 1. */
  format: z.number().int().positive().optional(),
  etag: z.string(),
  size: z.number().int().nonnegative(),
  tags: tagsSchema,
  /** Format 1: key of the original embedded cover. */
  artKey: artKey.optional(),
  /** Format 2: keys of the rendered covers, when the file embeds one. */
  covers: z.object({ small: artKey, large: artKey }).optional(),
  /** Set when the object is not audio at all; it stays out of the library until replaced. */
  rejected: z.literal(true).optional(),
})

export type IndexEntry = z.infer<typeof entrySchema>

/** Whether an entry was written by an older version of the indexer and should be re-read. */
export function isOutdated(entry: IndexEntry): boolean {
  return !entry.rejected && (entry.format ?? 1) < ENTRY_FORMAT
}

/**
 * Whether an outdated entry lacks only its stream info, so it can be brought
 * up to date from its file's headers rather than read and rendered again.
 */
export function canAddStreamInfo(entry: IndexEntry): boolean {
  return !entry.rejected && entry.format === COVERS_FORMAT
}

export interface LibraryIndex {
  version: 1
  entries: Record<string, IndexEntry>
}

const envelopeSchema = z.object({
  version: z.literal(1),
  entries: z.record(z.string(), z.unknown()),
})

export function emptyIndex(): LibraryIndex {
  return { version: 1, entries: {} }
}

/** The index in `raw`, minus anything that does not validate. `undefined` is a bucket with no index yet. */
export function parseLibraryIndex(raw: unknown): LibraryIndex {
  if (raw === undefined) return emptyIndex()

  const envelope = envelopeSchema.safeParse(raw)
  if (!envelope.success) {
    console.error("Cloud library index has an unknown shape; rebuilding it.")
    return emptyIndex()
  }

  const entries: Record<string, IndexEntry> = {}
  let dropped = 0
  for (const [key, value] of Object.entries(envelope.data.entries)) {
    const entry = entrySchema.safeParse(value)
    if (entry.success) entries[key] = entry.data
    else dropped++
  }
  if (dropped > 0) {
    console.error(`Dropped ${dropped} malformed cloud index entries; those files will be indexed again.`)
  }
  return { version: 1, entries }
}
