/**
 * @jest-environment node
 */
import { NextRequest } from "next/server"

import { installFakeR2, type FakeR2 } from "@/testing/fake-r2"

const ORIGIN = "https://audora.test"
const PASSWORD = "a-long-test-passphrase"

const env = {
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "bucket",
  AUDORA_CLOUD_PASSWORD: PASSWORD,
  AUDORA_SESSION_SECRET: "s".repeat(32),
}

type Route = typeof import("@/app/api/cloud/session/route")

/** A fresh module graph per test, so the per-instance epoch cache never leaks between tests. */
function loadRoute(): Route {
  let route!: Route
  jest.isolateModules(() => {
    route = jest.requireActual<Route>("@/app/api/cloud/session/route")
  })
  return route
}

function request(method: string, init: { body?: unknown; cookie?: string; query?: string; site?: string } = {}) {
  const headers = new Headers({ "sec-fetch-site": init.site ?? "same-origin", "x-real-ip": "203.0.113.7" })
  if (init.body !== undefined) headers.set("content-type", "application/json")
  if (init.cookie) headers.set("cookie", init.cookie)
  return new NextRequest(`${ORIGIN}/api/cloud/session${init.query ?? ""}`, {
    method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

/** The `name=value` part of the session cookie a response set. */
function sessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie") ?? ""
  return header.split(";")[0]
}

describe("/api/cloud/session", () => {
  let r2: FakeR2
  const savedEnv = { ...process.env }

  beforeEach(() => {
    Object.assign(process.env, env)
    r2 = installFakeR2()
  })

  afterEach(() => {
    r2.restore()
    process.env = { ...savedEnv }
  })

  it("signs in with the right password and recognises the session", async () => {
    const route = loadRoute()
    const login = await route.POST(request("POST", { body: { password: PASSWORD } }))
    expect(login.status).toBe(200)
    const setCookie = login.headers.get("set-cookie") ?? ""
    expect(setCookie).toMatch(/^__Host-audora_session=/)
    expect(setCookie).toMatch(/Secure/i)
    expect(setCookie).toMatch(/SameSite=strict/i)

    const status = await route.GET(request("GET", { cookie: sessionCookie(login) }))
    expect(await status.json()).toEqual({ configured: true, authenticated: true })
  })

  it("locks a client out after repeated wrong passwords, without checking the password while locked", async () => {
    const route = loadRoute()
    for (let i = 0; i < 5; i++) {
      expect((await route.POST(request("POST", { body: { password: "wrong" } }))).status).toBe(401)
    }

    const locked = await route.POST(request("POST", { body: { password: PASSWORD } }))
    expect(locked.status).toBe(429)
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0)
  })

  it("refuses a sign-in posted from another site", async () => {
    const route = loadRoute()
    const response = await route.POST(request("POST", { body: { password: PASSWORD }, site: "cross-site" }))
    expect(response.status).toBe(403)
    expect(r2.requests).toHaveLength(0)
  })

  it("signs every device out with scope=all, and only for a signed-in caller", async () => {
    const route = loadRoute()
    const cookie = sessionCookie(await route.POST(request("POST", { body: { password: PASSWORD } })))

    const anonymous = await route.DELETE(request("DELETE", { query: "?scope=all" }))
    expect(anonymous.status).toBe(401)

    const everywhere = await route.DELETE(request("DELETE", { query: "?scope=all", cookie }))
    expect(everywhere.status).toBe(200)
    expect(everywhere.headers.get("set-cookie")).toMatch(/Max-Age=0/i)

    const status = await route.GET(request("GET", { cookie }))
    expect(await status.json()).toEqual({ configured: true, authenticated: false })
  })

  it("fails closed when the throttle cannot be read", async () => {
    r2.restore()
    Object.assign(globalThis, { fetch: jest.fn(async () => new Response("<Error/>", { status: 500 })) })
    const route = loadRoute()
    const response = await route.POST(request("POST", { body: { password: PASSWORD } }))
    expect(response.status).toBe(503)
    expect(response.headers.get("set-cookie")).toBeNull()
  })
})
