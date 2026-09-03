/**
 * Server-side backing store for the pairing handshake.
 *
 * Server only — it reads credentials from `process.env` and is imported by the
 * signaling route handler alone. Nothing here may be pulled into a client
 * component.
 *
 * Two browsers cannot describe themselves to each other without somewhere to
 * leave the description, so a room holds a short append-only list of handshake
 * messages — SDP offers, answers, and ICE candidates — until both peers have
 * read what they need. Nothing about playback, the library, or the audio ever
 * passes through here; once the peer connection is up the room is dead weight
 * and expires on its own.
 *
 * Upstash's REST API is spoken directly rather than through its client package.
 * The whole surface used is two pipelined commands, and keeping it dependency
 * free means the handshake cannot break on an unrelated package upgrade.
 */

/** Rooms outlive a handshake by a wide margin but never linger. */
const ROOM_TTL_SECONDS = 300

/** Upper bound on a room's message list, so a room cannot become storage. */
const MAX_ROOM_MESSAGES = 200

interface UpstashCredentials {
  url: string
  token: string
}

/**
 * Read Upstash credentials from the environment.
 *
 * Both naming conventions are accepted: Upstash's own `UPSTASH_REDIS_REST_*`
 * and the `KV_REST_API_*` pair that Vercel's Marketplace integration injects.
 * Which one appears depends on how the store was connected, and a sync feature
 * that silently fails because the integration used the other name is a bad
 * afternoon.
 */
function credentials(): UpstashCredentials | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ""), token }
}

/** Whether the signaling endpoint is configured to run at all. */
export function isSignalingConfigured(): boolean {
  return credentials() !== null
}

export class SignalingUnavailableError extends Error {
  constructor() {
    super("Signaling store is not configured")
    this.name = "SignalingUnavailableError"
  }
}

type RedisCommand = (string | number)[]

async function pipeline(commands: RedisCommand[]): Promise<unknown[]> {
  const creds = credentials()
  if (!creds) throw new SignalingUnavailableError()

  const response = await fetch(`${creds.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Signaling store returned ${response.status}`)
  }

  const results = (await response.json()) as Array<{ result?: unknown; error?: string }>
  const failed = results.find((entry) => entry.error)
  if (failed) throw new Error(`Signaling store error: ${failed.error}`)

  return results.map((entry) => entry.result)
}

function roomKey(room: string): string {
  return `audora:sync:${room}`
}

/**
 * Append one handshake message and return the room's resulting length.
 *
 * The trim and the expiry ride along in the same pipeline so a room can never
 * be left unbounded or immortal by a request that dies midway.
 */
export async function appendMessage(room: string, message: unknown): Promise<number> {
  const key = roomKey(room)
  const results = await pipeline([
    ["RPUSH", key, JSON.stringify(message)],
    ["LTRIM", key, -MAX_ROOM_MESSAGES, -1],
    ["EXPIRE", key, ROOM_TTL_SECONDS],
  ])
  const length = results[0]
  return typeof length === "number" ? length : 0
}

export interface RoomSlice {
  messages: unknown[]
  /** Index to pass as `since` on the next read. */
  next: number
}

/**
 * Read everything appended to a room at or after `since`.
 *
 * Reading also refreshes the expiry: a room is alive while either peer is
 * still listening, and dies once both have stopped.
 */
export async function readMessages(room: string, since: number): Promise<RoomSlice> {
  const key = roomKey(room)
  const from = Math.max(0, Math.floor(since))
  const results = await pipeline([
    ["LRANGE", key, from, -1],
    ["EXPIRE", key, ROOM_TTL_SECONDS],
  ])

  const raw = Array.isArray(results[0]) ? (results[0] as string[]) : []
  const messages: unknown[] = []
  for (const entry of raw) {
    try {
      messages.push(JSON.parse(entry))
    } catch {
      // A malformed entry is not worth failing the whole poll over; the peer
      // simply never sees it and the handshake retries.
    }
  }

  return { messages, next: from + raw.length }
}
