/**
 * @jest-environment node
 */
import { NextRequest } from "next/server"

import { MAX_UPLOAD_BYTES } from "@/lib/cloud/uploads"
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

type SessionRoute = typeof import("@/app/api/cloud/session/route")
type UploadsRoute = typeof import("@/app/api/cloud/uploads/route")

function loadRoutes(): { session: SessionRoute; uploads: UploadsRoute } {
  let routes!: { session: SessionRoute; uploads: UploadsRoute }
  jest.isolateModules(() => {
    routes = {
      session: jest.requireActual<SessionRoute>("@/app/api/cloud/session/route"),
      uploads: jest.requireActual<UploadsRoute>("@/app/api/cloud/uploads/route"),
    }
  })
  return routes
}

function request(path: string, init: { body?: unknown; cookie?: string; site?: string } = {}) {
  const headers = new Headers({ "sec-fetch-site": init.site ?? "same-origin", "x-real-ip": "203.0.113.7" })
  headers.set("content-type", "application/json")
  if (init.cookie) headers.set("cookie", init.cookie)
  return new NextRequest(`${ORIGIN}${path}`, {
    method: "POST",
    headers,
    body: typeof init.body === "string" ? init.body : JSON.stringify(init.body ?? {}),
  })
}

describe("/api/cloud/uploads", () => {
  let r2: FakeR2
  let routes: ReturnType<typeof loadRoutes>
  let cookie: string
  const savedEnv = { ...process.env }

  const plan = (body: unknown, options: { site?: string; signedIn?: boolean } = {}) =>
    routes.uploads.POST(
      request("/api/cloud/uploads", {
        body,
        site: options.site,
        cookie: options.signedIn === false ? undefined : cookie,
      }),
    )

  beforeEach(async () => {
    Object.assign(process.env, env)
    r2 = installFakeR2()
    routes = loadRoutes()
    const login = await routes.session.POST(request("/api/cloud/session", { body: { password: PASSWORD } }))
    cookie = (login.headers.get("set-cookie") ?? "").split(";")[0]
  })

  afterEach(() => {
    r2.restore()
    process.env = { ...savedEnv }
  })

  it("refuses callers who are not signed in, or not this app", async () => {
    expect((await plan({ name: "a.flac", size: 10 }, { signedIn: false })).status).toBe(401)
    expect((await plan({ name: "a.flac", size: 10 }, { site: "cross-site" })).status).toBe(403)
  })

  it("signs an upload of a new song to library/<name>, never cached", async () => {
    const response = await plan({ name: "01 Song.flac", size: 1234 })
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")

    const body = await response.json()
    expect(body.status).toBe("upload")
    expect(body.key).toBe("library/01 Song.flac")
    expect(new URL(body.url).pathname).toBe("/bucket/library/01%20Song.flac")
    expect(body.headers).toEqual({ "Content-Type": "audio/flac", "If-None-Match": "*" })
  })

  it("reports a song already in the library instead of uploading it again", async () => {
    r2.put("library/01 Song.flac", new Uint8Array(1234))
    expect(await (await plan({ name: "01 Song.flac", size: 1234 })).json()).toEqual({
      status: "exists",
      key: "library/01 Song.flac",
    })
  })

  it("gives a different file with a taken name its own key, without touching the other", async () => {
    r2.put("library/01 Song.flac", new Uint8Array(1000))
    const first = await (await plan({ name: "01 Song.flac", size: 1234 })).json()
    expect(first.status).toBe("upload")
    expect(first.key).toMatch(/^library\/[0-9a-f]{12}\/01 Song\.flac$/)

    r2.put(first.key, new Uint8Array(1234))
    expect(await (await plan({ name: "01 Song.flac", size: 1234 })).json()).toEqual({
      status: "exists",
      key: first.key,
    })
  })

  it.each([
    ["a path", { name: "../index/library-v1.json", size: 10 }],
    ["not audio", { name: "page.html", size: 10 }],
    ["empty", { name: "a.flac", size: 0 }],
    ["fractional", { name: "a.flac", size: 1.5 }],
    ["over R2's limit", { name: "a.flac", size: MAX_UPLOAD_BYTES + 1 }],
    ["extra fields", { name: "a.flac", size: 10, key: "index/library-v1.json" }],
  ])("rejects %s", async (_label, body) => {
    const response = await plan(body)
    expect(response.status).toBe(400)
    expect(r2.requests.filter((entry) => entry.startsWith("HEAD"))).toEqual([])
  })

  it("rejects a body that is not JSON", async () => {
    expect((await plan("{not json")).status).toBe(400)
  })
})
