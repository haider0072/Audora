import { createHmac } from "node:crypto"

import { z } from "zod"

import type { CloudConfig } from "./config"
import { readJson, updateJson } from "./json-object"
import { R2Client } from "./r2"

/**
 * Brute-force protection for the cloud library's password. Server only.
 *
 * Two limits, both kept in one small document in the bucket so they hold
 * across every serverless instance:
 *
 * - Per client: a few free attempts, then a lockout that doubles with every
 *   further failure. A correct password clears the client's record.
 * - Global: past a ceiling of failures within the window, every client is
 *   locked until the window drains — which is what stops a guesser that
 *   rotates addresses. It can also delay a new sign-in by the owner, but
 *   devices already signed in are unaffected, and a delay is the right
 *   failure for a password under attack.
 *
 * While locked, the password is not checked at all, so a locked-out guesser
 * learns nothing from continuing.
 *
 * Clients are identified by an HMAC of their address, so the bucket never
 * holds a raw IP.
 */

const THROTTLE_KEY = "auth/login-throttle.json"

/** Failures allowed before the first lockout. */
export const FREE_ATTEMPTS = 5
/** First lockout; each further failure doubles it. */
const BASE_LOCK_MS = 60_000
const MAX_LOCK_MS = 24 * 60 * 60 * 1000
/** A client with no failure for this long is forgotten. */
const CLIENT_MEMORY_MS = 24 * 60 * 60 * 1000

export const GLOBAL_WINDOW_MS = 60 * 60 * 1000
/** Failures from all clients together, within the window, that lock every client. */
export const GLOBAL_MAX_FAILURES = 30

const clientSchema = z.object({
  failures: z.number().int().nonnegative(),
  lockedUntil: z.number(),
  lastFailureAt: z.number(),
})

const throttleSchema = z.object({
  clients: z.record(z.string(), clientSchema),
  /** Failure times across all clients, oldest first, within the window. */
  recent: z.array(z.number()),
})

export type ThrottleState = z.infer<typeof throttleSchema>

export function emptyThrottle(): ThrottleState {
  return { clients: {}, recent: [] }
}

function parseThrottle(raw: unknown): ThrottleState {
  const parsed = throttleSchema.safeParse(raw)
  return parsed.success ? parsed.data : emptyThrottle()
}

export type LoginVerdict = { allowed: true } | { allowed: false; retryAfterMs: number }

/** Whether `clientId` may try a password at `now`. */
export function checkLogin(state: ThrottleState, clientId: string, now: number): LoginVerdict {
  const recent = state.recent.filter((at) => now - at < GLOBAL_WINDOW_MS)
  if (recent.length >= GLOBAL_MAX_FAILURES) {
    return { allowed: false, retryAfterMs: recent[recent.length - GLOBAL_MAX_FAILURES] + GLOBAL_WINDOW_MS - now }
  }

  const client = state.clients[clientId]
  if (client && client.lockedUntil > now) {
    return { allowed: false, retryAfterMs: client.lockedUntil - now }
  }
  return { allowed: true }
}

function lockDuration(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0
  return Math.min(BASE_LOCK_MS * 2 ** (failures - FREE_ATTEMPTS), MAX_LOCK_MS)
}

/** Drop what no longer matters, so the document stays small. */
function prune(state: ThrottleState, now: number): ThrottleState {
  const clients: ThrottleState["clients"] = {}
  for (const [id, client] of Object.entries(state.clients)) {
    if (now - client.lastFailureAt < CLIENT_MEMORY_MS || client.lockedUntil > now) clients[id] = client
  }
  return { clients, recent: state.recent.filter((at) => now - at < GLOBAL_WINDOW_MS) }
}

export function recordFailure(state: ThrottleState, clientId: string, now: number): ThrottleState {
  const pruned = prune(state, now)
  const failures = (pruned.clients[clientId]?.failures ?? 0) + 1
  return {
    clients: {
      ...pruned.clients,
      [clientId]: { failures, lockedUntil: now + lockDuration(failures), lastFailureAt: now },
    },
    recent: [...pruned.recent, now],
  }
}

/** The state after a correct password, or null when there was nothing to clear. */
export function recordSuccess(state: ThrottleState, clientId: string): ThrottleState | null {
  if (!state.clients[clientId]) return null
  const { [clientId]: _cleared, ...clients } = state.clients
  return { ...state, clients }
}

/**
 * The address a request came from. On Vercel both headers are set by the
 * platform's edge from the connecting address, overwriting anything the
 * client sent; elsewhere (local development) they are usually absent and
 * every request shares one bucket, which only makes the throttle stricter.
 */
export function clientAddressOf(headers: Headers): string {
  return (
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  )
}

/** An opaque, stable id for the address a request came from. */
export function clientIdFor(config: CloudConfig, address: string): string {
  return createHmac("sha256", config.sessionSecret).update(`login-client:${address}`).digest("hex").slice(0, 32)
}

/** Stored state for the login throttle. */
export class LoginThrottleStore {
  private readonly client: R2Client

  constructor(config: CloudConfig) {
    this.client = new R2Client(config)
  }

  async read(): Promise<ThrottleState> {
    return (await readJson(this.client, THROTTLE_KEY, parseThrottle)).value
  }

  async recordFailure(clientId: string, now: number = Date.now()): Promise<void> {
    await updateJson(this.client, THROTTLE_KEY, parseThrottle, (state) => recordFailure(state, clientId, now))
  }

  async recordSuccess(clientId: string): Promise<void> {
    await updateJson(this.client, THROTTLE_KEY, parseThrottle, (state) => recordSuccess(state, clientId))
  }
}
