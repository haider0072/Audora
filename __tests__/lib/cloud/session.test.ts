/**
 * @jest-environment node
 */
import type { CloudConfig } from "@/lib/cloud/config"
import {
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  isCorrectPassword,
  isValidSessionToken,
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

  it("round-trips a freshly issued token", () => {
    const token = createSessionToken(config, now)
    expect(isValidSessionToken(config, token, now)).toBe(true)
  })

  it("expires after the max age", () => {
    const token = createSessionToken(config, now)
    const later = now + (SESSION_MAX_AGE_SECONDS + 1) * 1000
    expect(isValidSessionToken(config, token, later)).toBe(false)
  })

  it("rejects a token whose expiry was edited", () => {
    const [version, expires, signature] = createSessionToken(config, now).split(".")
    const forged = `${version}.${Number(expires) + 86_400}.${signature}`
    expect(isValidSessionToken(config, forged, now)).toBe(false)
  })

  it("rejects a token signed with another secret", () => {
    const token = createSessionToken({ ...config, sessionSecret: "t".repeat(32) }, now)
    expect(isValidSessionToken(config, token, now)).toBe(false)
  })

  it("rejects malformed and missing tokens", () => {
    expect(isValidSessionToken(config, undefined, now)).toBe(false)
    expect(isValidSessionToken(config, "", now)).toBe(false)
    expect(isValidSessionToken(config, "v1.123", now)).toBe(false)
    expect(isValidSessionToken(config, "v2.9999999999.abc", now)).toBe(false)
  })
})
