/**
 * @jest-environment node
 */
import type { CloudConfig } from "@/lib/cloud/config"
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE_SECONDS,
  SESSION_RENEW_AFTER_SECONDS,
  createSessionToken,
  isCorrectPassword,
  readSessionToken,
  shouldRenewSession,
} from "@/lib/cloud/session"

const config: CloudConfig = {
  accountId: "acct",
  accessKeyId: "key",
  secretAccessKey: "secret",
  bucket: "bucket",
  password: "correct horse battery staple",
  sessionSecret: "s".repeat(32),
}

describe("isCorrectPassword", () => {
  it("accepts the configured password", () => {
    expect(isCorrectPassword(config, "correct horse battery staple")).toBe(true)
  })

  it("rejects anything else, including prefixes and different lengths", () => {
    expect(isCorrectPassword(config, "correct horse")).toBe(false)
    expect(isCorrectPassword(config, "correct horse battery staple!")).toBe(false)
    expect(isCorrectPassword(config, "")).toBe(false)
  })
})

describe("session tokens", () => {
  const now = Date.UTC(2026, 10, 4)

  it("round-trips a freshly issued token with its epoch", () => {
    const claims = readSessionToken(config, createSessionToken(config, 7, now), now)
    expect(claims?.epoch).toBe(7)
    expect(claims?.expires).toBe(now / 1000 + SESSION_MAX_AGE_SECONDS)
  })

  it("expires after the max age", () => {
    const token = createSessionToken(config, 0, now)
    const later = now + (SESSION_MAX_AGE_SECONDS + 1) * 1000
    expect(readSessionToken(config, token, later)).toBeNull()
  })

  it("rejects a token whose expiry or epoch was edited", () => {
    const [version, expires, epoch, signature] = createSessionToken(config, 3, now).split(".")
    expect(readSessionToken(config, `${version}.${Number(expires) + 86_400}.${epoch}.${signature}`, now)).toBeNull()
    expect(readSessionToken(config, `${version}.${expires}.4.${signature}`, now)).toBeNull()
  })

  it("rejects a token signed with another secret", () => {
    const token = createSessionToken({ ...config, sessionSecret: "t".repeat(32) }, 0, now)
    expect(readSessionToken(config, token, now)).toBeNull()
  })

  it("rejects malformed, missing and previous-format tokens", () => {
    expect(readSessionToken(config, undefined, now)).toBeNull()
    expect(readSessionToken(config, "", now)).toBeNull()
    expect(readSessionToken(config, "v1.9999999999.abc", now)).toBeNull()
    expect(readSessionToken(config, "v2.9999999999.x.abc", now)).toBeNull()
  })

  it("asks for renewal once a token has been in use for a day, and not before", () => {
    const claims = readSessionToken(config, createSessionToken(config, 0, now), now)!
    expect(shouldRenewSession(claims, now + (SESSION_RENEW_AFTER_SECONDS - 60) * 1000)).toBe(false)
    expect(shouldRenewSession(claims, now + SESSION_RENEW_AFTER_SECONDS * 1000)).toBe(true)
  })
})

describe("session cookie", () => {
  it("uses the __Host- prefix with the attributes that prefix demands", () => {
    expect(SESSION_COOKIE.startsWith("__Host-")).toBe(true)
    expect(SESSION_COOKIE_OPTIONS).toMatchObject({ secure: true, path: "/", httpOnly: true, sameSite: "strict" })
    expect(SESSION_COOKIE_OPTIONS).not.toHaveProperty("domain")
  })
})
