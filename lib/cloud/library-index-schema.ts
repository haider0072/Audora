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

/** Tag fields kept per song: everything on `CloudSong` the listing does not already know. */
export type SongTags = Omit<CloudSong, "id" | "key" | "fileName" | "fileSize" | "streamUrl" | "artUrl">

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
  isHiRes: z.boolean().optional(),
  format: text.optional(),
})

const entrySchema = z.object({
  etag: z.string(),
  size: z.number().int().nonnegative(),
  tags: tagsSchema,
  /** Key of the extracted cover, when the file embeds one. */
  artKey: z.string().startsWith(ART_PREFIX).optional(),
  /** Set when the object is not audio at all; it stays out of the library until replaced. */
  rejected: z.literal(true).optional(),
})

export type IndexEntry = z.infer<typeof entrySchema>

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
