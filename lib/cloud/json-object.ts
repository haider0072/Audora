import type { R2Client } from "./r2"

/**
 * Small JSON documents kept in the bucket — the library index, the session
 * epoch, the login throttle. Server only.
 *
 * Every write is conditional on the ETag that was read, so two functions
 * updating the same document at once cannot silently overwrite each other:
 * the loser re-reads and applies its change again.
 */

/** Turns whatever was stored into a document, or a fresh one when it is unusable. */
export type JsonParser<T> = (raw: unknown) => T

/** Read-modify-write attempts before a write is abandoned. */
const UPDATE_ATTEMPTS = 4

export class JsonConflictError extends Error {
  constructor(key: string) {
    super(`${key} kept changing during the update`)
    this.name = "JsonConflictError"
  }
}

/** The stored document and its ETag (null when it does not exist yet). */
export async function readJson<T>(
  client: R2Client,
  key: string,
  parse: JsonParser<T>,
  signal?: AbortSignal,
): Promise<{ value: T; etag: string | null }> {
  const stored = await client.read(key, signal)
  if (!stored) return { value: parse(undefined), etag: null }

  let raw: unknown
  try {
    raw = JSON.parse(new TextDecoder().decode(stored.body))
  } catch (error) {
    console.error(`${key} is not valid JSON; starting it afresh:`, error)
    raw = undefined
  }
  return { value: parse(raw), etag: stored.etag }
}

/**
 * Apply `change` to the stored document and write it back.
 *
 * `change` receives the latest version and returns the next one, or null
 * when there is nothing to write. It may run more than once — once per
 * conflicting writer — so it must be a pure function of its input. Resolves
 * to the document as stored.
 */
export async function updateJson<T>(
  client: R2Client,
  key: string,
  parse: JsonParser<T>,
  change: (current: T) => T | null,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; attempt < UPDATE_ATTEMPTS; attempt++) {
    const { value, etag } = await readJson(client, key, parse, signal)
    const next = change(value)
    if (next === null) return value

    const written = await client.write(key, JSON.stringify(next), {
      contentType: "application/json",
      ...(etag ? { ifMatch: etag } : { ifNoneMatch: true }),
      signal,
    })
    if (written) return next
  }
  throw new JsonConflictError(key)
}
