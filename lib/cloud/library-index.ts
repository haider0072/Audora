import { createHash } from "node:crypto"

import { MetadataExtractor } from "@/lib/metadata-extractor"

import { AUDIO_SIGNATURE_BYTES, looksLikeAudio } from "./audio-signature"
import type { CloudConfig } from "./config"
import { readJson, updateJson } from "./json-object"
import { ART_PREFIX, parseLibraryIndex, type IndexEntry, type LibraryIndex } from "./library-index-schema"
import type { R2Object } from "./list-parse"
import { R2Client } from "./r2"
import { R2RangeSource } from "./r2-source"
import type { CloudIndexResponse, CloudLibraryResponse, CloudSong } from "./types"

/**
 * The cloud library's catalogue. Server only.
 *
 * Audio lives under `library/`, put there by any tool — rclone, the AWS CLI,
 * the dashboard — so the bucket itself is the source of truth for *which*
 * songs exist. What it cannot answer cheaply is what each one *is*: tags,
 * duration, cover. Those are read once per object, from the head of the file
 * with ranged requests, and kept in a single JSON index in the same bucket so
 * every later load is one list plus one read.
 *
 * An object counts as indexed while its ETag matches the one recorded; a
 * re-uploaded file has a new ETag and is simply read again. Index entries for
 * objects that have disappeared are dropped on the next indexing pass.
 */

export const LIBRARY_PREFIX = "library/"
const INDEX_KEY = "index/library-v1.json"

const AUDIO_EXTENSIONS = new Set(["flac", "mp3", "m4a", "aac", "wav", "ogg", "opus"])

/** SigV4 allows at most seven days. */
const URL_LIFETIME_SECONDS = 7 * 24 * 60 * 60
const DAY_MS = 24 * 60 * 60 * 1000

/** Files read at once while indexing. Each holds a few MB of head in memory. */
const INDEX_CONCURRENCY = 8

/**
 * Stop starting new files after this long, so each indexing request returns
 * promptly and the client sees steady progress.
 */
const INDEX_START_BUDGET_MS = 20_000

/**
 * Abandon files still in flight after this long — they stay pending — so
 * the pass always gets to save what it finished. With the save itself (one
 * read, one write, each bounded by the R2 request timeout) this stays inside
 * the route's `maxDuration`.
 */
const INDEX_ABORT_AFTER_MS = 35_000

/** Stable, opaque, and never equal to a local song id. */
export function cloudSongId(key: string): string {
  return `cloud:${createHash("sha256").update(key).digest("hex").slice(0, 32)}`
}

function fileNameOf(key: string): string {
  return key.slice(key.lastIndexOf("/") + 1)
}

export function isAudioKey(key: string): boolean {
  const extension = key.split(".").pop()?.toLowerCase() ?? ""
  return key.startsWith(LIBRARY_PREFIX) && !key.endsWith("/") && AUDIO_EXTENSIONS.has(extension)
}

/** Content type of embedded art, from its magic bytes. Tags routinely mislabel it. */
function imageType(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png"
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif"
  if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp"
  return "image/jpeg"
}

async function listAudio(client: R2Client): Promise<R2Object[]> {
  return (await client.list(LIBRARY_PREFIX)).filter((object) => isAudioKey(object.key))
}

function isCurrent(entry: IndexEntry | undefined, object: R2Object): boolean {
  return !!entry && entry.etag === object.etag && entry.size === object.size
}

/** Start of the current UTC day: every URL signed today shares it. */
function signingWindowStart(now: number): Date {
  return new Date(Math.floor(now / DAY_MS) * DAY_MS)
}

/** Every indexed song with fresh signed URLs, plus how many objects still await indexing. */
export async function getLibrary(config: CloudConfig, now: number = Date.now()): Promise<CloudLibraryResponse> {
  const client = new R2Client(config)
  const [objects, { value: index }] = await Promise.all([
    listAudio(client),
    readJson(client, INDEX_KEY, parseLibraryIndex),
  ])

  const signedAt = signingWindowStart(now)
  let pending = 0
  const songs: CloudSong[] = []

  await Promise.all(
    objects.map(async (object) => {
      const entry = index.entries[object.key]
      if (!isCurrent(entry, object)) {
        pending++
        return
      }
      if (entry.rejected) return

      const [streamUrl, artUrl] = await Promise.all([
        client.presignGet(object.key, signedAt, URL_LIFETIME_SECONDS),
        entry.artKey ? client.presignGet(entry.artKey, signedAt, URL_LIFETIME_SECONDS) : undefined,
      ])

      songs.push({
        ...entry.tags,
        id: cloudSongId(object.key),
        key: object.key,
        fileName: fileNameOf(object.key),
        fileSize: object.size,
        streamUrl,
        artUrl,
      })
    }),
  )

  songs.sort((a, b) => a.key.localeCompare(b.key))

  return {
    songs,
    pending,
    urlsExpireAt: signedAt.getTime() + URL_LIFETIME_SECONDS * 1000,
  }
}

async function indexObject(client: R2Client, object: R2Object, signal: AbortSignal): Promise<IndexEntry> {
  const name = fileNameOf(object.key)
  const source = new R2RangeSource(client, object.key, name, object.size, signal)

  const head = new Uint8Array(await source.slice(0, AUDIO_SIGNATURE_BYTES).arrayBuffer())
  if (!looksLikeAudio(head)) {
    console.warn(`${object.key} does not look like audio; leaving it out of the library.`)
    return { etag: object.etag, size: object.size, tags: {}, rejected: true }
  }

  const { metadata, albumArt } = await MetadataExtractor.extractFromSource(source)

  let artKey: string | undefined
  if (albumArt && albumArt.data.length > 0) {
    artKey = `${ART_PREFIX}${cloudSongId(object.key).slice("cloud:".length)}`
    await client.write(artKey, albumArt.data, {
      contentType: imageType(albumArt.data),
      // The key changes whenever the audio does, so the bytes behind a key never change.
      cacheControl: "private, max-age=31536000, immutable",
      signal,
    })
  }

  return {
    etag: object.etag,
    size: object.size,
    tags: {
      title: metadata.title,
      artist: metadata.artist,
      artists: metadata.artists,
      albumArtist: metadata.albumArtist,
      album: metadata.album,
      year: metadata.year,
      genre: metadata.genre,
      trackNumber: metadata.trackNumber,
      discNumber: metadata.discNumber,
      duration: metadata.duration,
      bitrate: metadata.bitrate,
      isHiRes: metadata.isHiRes,
      format: metadata.format,
    },
    artKey,
  }
}

/** Run `task` over `items` with at most `limit` in flight, starting none after `deadline`. */
async function runBounded<T>(items: T[], limit: number, deadline: number, task: (item: T) => Promise<void>) {
  let next = 0
  const worker = async () => {
    while (next < items.length && Date.now() < deadline) {
      await task(items[next++])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

/**
 * Index objects that are new or changed since the last pass, starting files
 * for up to `INDEX_START_BUDGET_MS`, and save the result. Returns how many
 * were indexed and how many remain; the client calls again while any remain.
 */
export async function indexPending(config: CloudConfig): Promise<CloudIndexResponse> {
  const client = new R2Client(config)
  const startedAt = Date.now()
  const abandon = AbortSignal.timeout(INDEX_ABORT_AFTER_MS)
  const [objects, { value: index }] = await Promise.all([
    listAudio(client),
    readJson(client, INDEX_KEY, parseLibraryIndex),
  ])

  const todo = objects.filter((object) => !isCurrent(index.entries[object.key], object))
  const fresh: Record<string, IndexEntry> = {}

  await runBounded(todo, INDEX_CONCURRENCY, startedAt + INDEX_START_BUDGET_MS, async (object) => {
    try {
      fresh[object.key] = await indexObject(client, object, abandon)
    } catch (error) {
      // One unreadable file must not stall the library; it stays pending and
      // is retried on the next pass. A file abandoned at the time limit is
      // expected, not worth a log line.
      if (!abandon.aborted) console.error(`Could not index ${object.key}:`, error)
    }
  })

  const liveKeys = new Set(objects.map((object) => object.key))
  await saveIndex(client, fresh, liveKeys)

  const indexed = Object.keys(fresh).length
  return { indexed, pending: todo.length - indexed }
}

/**
 * Fold freshly indexed entries into the stored index, dropping entries for
 * objects that no longer exist. Conditional on the ETag read, so a concurrent
 * pass from another device is merged rather than overwritten.
 */
async function saveIndex(client: R2Client, fresh: Record<string, IndexEntry>, liveKeys: Set<string>) {
  await updateJson(client, INDEX_KEY, parseLibraryIndex, (index): LibraryIndex | null => {
    const entries: Record<string, IndexEntry> = {}
    for (const [key, entry] of Object.entries(index.entries)) {
      if (liveKeys.has(key)) entries[key] = entry
    }
    const pruned = Object.keys(entries).length !== Object.keys(index.entries).length
    if (!pruned && Object.keys(fresh).length === 0) return null
    return { version: 1, entries: { ...entries, ...fresh } }
  })
}
