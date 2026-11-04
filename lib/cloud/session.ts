import { createHmac, timingSafeEqual } from "node:crypto"

import type { CloudConfig } from "./config"

/**
 * Single-user sessions for the cloud library.
 *
 * Server only. There is one user and no account table, so a session is not a
 * row anywhere: it is an expiry, a session epoch and an HMAC over both, held
 * in an HttpOnly cookie. A token is honoured only while its epoch matches the
 * one stored in the bucket (see `auth-store.ts`), which is what lets "sign
 * out everywhere" revoke every device at once without a session table.
 */

/**
 * `__Host-` makes the browser refuse the cookie unless it is Secure, has
 * Path=/ and no Domain — so no subdomain, and no plain-HTTP page, can set or
 * shadow it.
 */
export const SESSION_COOKIE = "__Host-audora_session"

/** An idle device is signed out after this long. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

/**
 * A token older than this is re-issued on the next session check, so a device
 * in regular use never reaches `SESSION_MAX_AGE_SECONDS`.
 */
export const SESSION_RENEW_AFTER_SECONDS = 60 * 60 * 24

const SESSION_VERSION = "v2"

/** What a verified token carries. */
export interface SessionClaims {
  /** Seconds since epoch. */
  expires: number
  /** Session epoch the token was issued under. */
  epoch: number
}

/** Attributes for the session cookie, shared by every route that sets it. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  // The cookie is only ever needed by the app's own fetches, never on a
  // navigation arriving from another site.
  sameSite: "strict",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
} as const

function sign(config: CloudConfig, value: string): string {
  return createHmac("sha256", config.sessionSecret).update(value).digest("base64url")
}

/**
 * Constant-time string equality.
 *
 * Both sides are hashed first so the comparison runs over equal-length input
 * regardless of what was typed — `timingSafeEqual` throws on a length
 * mismatch, and leaking the password length through that is still a leak.
 */
function safeEqual(config: CloudConfig, a: string, b: string): boolean {
  return timingSafeEqual(
    Buffer.from(sign(config, `cmp:${a}`), "base64url"),
    Buffer.from(sign(config, `cmp:${b}`), "base64url"),
  )
}

export function isCorrectPassword(config: CloudConfig, attempt: string): boolean {
  return safeEqual(config, attempt, config.password)
}

/** Issue a token under `epoch`, valid for `SESSION_MAX_AGE_SECONDS` from `now`. */
export function createSessionToken(config: CloudConfig, epoch: number, now: number = Date.now()): string {
  const expires = Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS
  const body = `${SESSION_VERSION}.${expires}.${epoch}`
  return `${body}.${sign(config, body)}`
}

/**
 * The claims of a correctly signed, unexpired token, or null.
 *
 * This checks only what the token itself can prove. Whether its epoch is
 * still the current one is the caller's question — it needs the bucket.
 */
export function readSessionToken(
  config: CloudConfig,
  token: string | undefined,
  now: number = Date.now(),
): SessionClaims | null {
  if (!token) return null

  const parts = token.split(".")
  if (parts.length !== 4) return null

  const [version, expiresRaw, epochRaw, signature] = parts
  if (version !== SESSION_VERSION) return null

  const body = `${version}.${expiresRaw}.${epochRaw}`
  if (!safeEqual(config, signature, sign(config, body))) return null

  const expires = Number(expiresRaw)
  const epoch = Number(epochRaw)
  if (!Number.isSafeInteger(expires) || !Number.isSafeInteger(epoch)) return null
  if (expires * 1000 <= now) return null

  return { expires, epoch }
}

/** Whether a valid token is old enough to be swapped for a fresh one. */
export function shouldRenewSession(claims: SessionClaims, now: number = Date.now()): boolean {
  const issuedAt = claims.expires - SESSION_MAX_AGE_SECONDS
  return Math.floor(now / 1000) - issuedAt >= SESSION_RENEW_AFTER_SECONDS
}
