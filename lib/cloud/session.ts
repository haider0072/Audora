import { createHmac, timingSafeEqual } from "node:crypto"

import type { CloudConfig } from "./config"

/**
 * Single-user sessions for the cloud library.
 *
 * Server only. There is one user and no account table, so a session is not a
 * row anywhere: it is an expiry time and an HMAC over it, held in an HttpOnly
 * cookie. Anyone holding a valid cookie is the owner; anyone without one is
 * not. Rotating `AUDORA_SESSION_SECRET` signs every device out at once.
 */

export const SESSION_COOKIE = "audora_session"

/** A personal player is signed into once per device and left that way. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90

const SESSION_VERSION = "v1"

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

/** Issue a session token valid for `SESSION_MAX_AGE_SECONDS` from `now`. */
export function createSessionToken(config: CloudConfig, now: number = Date.now()): string {
  const expires = Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS
  const body = `${SESSION_VERSION}.${expires}`
  return `${body}.${sign(config, body)}`
}

export function isValidSessionToken(
  config: CloudConfig,
  token: string | undefined,
  now: number = Date.now(),
): boolean {
  if (!token) return false

  const parts = token.split(".")
  if (parts.length !== 3) return false

  const [version, expiresRaw, signature] = parts
  if (version !== SESSION_VERSION) return false

  const body = `${version}.${expiresRaw}`
  if (!safeEqual(config, signature, sign(config, body))) return false

  const expires = Number.parseInt(expiresRaw, 10)
  return Number.isFinite(expires) && expires * 1000 > now
}
