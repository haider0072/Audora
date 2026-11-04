import { z } from "zod"

import type { CloudConfig } from "./config"
import { readJson, updateJson } from "./json-object"
import { R2Client } from "./r2"

/**
 * The session epoch: one number, stored in the bucket, that every session
 * token embeds. Server only.
 *
 * Tokens issued under an older epoch are refused, so bumping it signs every
 * device out at once. It is read on each authenticated request, which is why
 * it is cached briefly per function instance — revocation reaches other
 * instances within `EPOCH_CACHE_MS`, and the instance that revoked at once.
 */

const SESSION_STATE_KEY = "auth/session.json"

/** How stale another instance's view of a revocation may be. */
const EPOCH_CACHE_MS = 60_000

const sessionStateSchema = z.object({ epoch: z.number().int().nonnegative() })
type SessionState = z.infer<typeof sessionStateSchema>

function parseSessionState(raw: unknown): SessionState {
  const parsed = sessionStateSchema.safeParse(raw)
  return parsed.success ? parsed.data : { epoch: 0 }
}

/** Per bucket, so two configurations in one process never share an epoch. */
const cache = new Map<string, { epoch: number; readAt: number }>()

function cacheKey(config: CloudConfig): string {
  return `${config.accountId}/${config.bucket}`
}

export async function currentSessionEpoch(config: CloudConfig, now: number = Date.now()): Promise<number> {
  const cached = cache.get(cacheKey(config))
  if (cached && now - cached.readAt < EPOCH_CACHE_MS) return cached.epoch

  const { value } = await readJson(new R2Client(config), SESSION_STATE_KEY, parseSessionState)
  cache.set(cacheKey(config), { epoch: value.epoch, readAt: now })
  return value.epoch
}

/** Invalidate every session issued so far. Resolves to the new epoch. */
export async function revokeAllSessions(config: CloudConfig, now: number = Date.now()): Promise<number> {
  const { epoch } = await updateJson(new R2Client(config), SESSION_STATE_KEY, parseSessionState, (state) => ({
    epoch: state.epoch + 1,
  }))
  cache.set(cacheKey(config), { epoch, readAt: now })
  return epoch
}
