/**
 * @jest-environment node
 */
import { NextRequest } from "next/server"

import { downloadTags, type DownloadTrack } from "@/lib/download-file"
import { withFlacMetadata } from "@/lib/flac-art-embedder"
import { encodeId } from "@/lib/lucida-ids"
import { installFakeR2, type FakeR2 } from "@/testing/fake-r2"

const mockFetchTrackAudio = jest.fn<Promise<Response>, [string, { signal?: AbortSignal }?]>()
jest.mock("@/lib/lucida-client", () => ({
  fetchLucidaTrackAudio: (url: string, opts?: { signal?: AbortSignal }) => mockFetchTrackAudio(url, opts),
}))

const mockFetchCover = jest.fn<Promise<Response>, [URL]>()
jest.mock("@/lib/cover-art-url", () => ({
  ...jest.requireActual("@/lib/cover-art-url"),
  fetchCover: (url: URL) => mockFetchCover(url),
}))

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

const SOURCE_URL = "https://play.qobuz.com/track/123"
const COVER_URL = "https://static.qobuz.com/images/covers/amnesia_600.jpg"

const TRACK: DownloadTrack = {
  id: encodeId({ k: "t", u: SOURCE_URL, t: "AMNESIA", a: "WOODZ" }),
  title: "AMNESIA",
  artist: "WOODZ",
  albumTitle: "AMNESIA",
  albumCover: COVER_URL,
  releaseDate: "2025-03-10",
  genre: "K-Pop",
  trackNumber: 1,
  discNumber: 1,
  isrc: "KRA382500001",
}

/** A FLAC with its STREAMINFO alone, then a few bytes of "audio". */
const SOURCE_FLAC = new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0x80, 0, 0, 34, ...new Array(34).fill(7), 9, 9, 9, 9])
const SOURCE_AAC = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20, 1, 2, 3])
const COVER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

const FLAC_KEY = "library/WOODZ - AMNESIA.flac"

function audio(body: Uint8Array<ArrayBuffer>, type: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": type } })
}

type SessionRoute = typeof import("@/app/api/cloud/session/route")
type ImportsRoute = typeof import("@/app/api/cloud/imports/route")

function loadRoutes(): { session: SessionRoute; imports: ImportsRoute } {
  let routes!: { session: SessionRoute; imports: ImportsRoute }
  jest.isolateModules(() => {
    routes = {
      session: jest.requireActual<SessionRoute>("@/app/api/cloud/session/route"),
      imports: jest.requireActual<ImportsRoute>("@/app/api/cloud/imports/route"),
    }
  })
  return routes
}

function request(path: string, init: { body?: unknown; cookie?: string; site?: string; signal?: AbortSignal } = {}) {
  const headers = new Headers({ "sec-fetch-site": init.site ?? "same-origin", "x-real-ip": "203.0.113.7" })
  headers.set("content-type", "application/json")
  if (init.cookie) headers.set("cookie", init.cookie)
  return new NextRequest(`${ORIGIN}${path}`, {
    method: "POST",
    headers,
    body: typeof init.body === "string" ? init.body : JSON.stringify(init.body ?? {}),
    signal: init.signal,
  })
}

describe("/api/cloud/imports", () => {
  let r2: FakeR2
  let routes: ReturnType<typeof loadRoutes>
  let cookie: string
  const savedEnv = { ...process.env }

  const save = (body: unknown, options: { site?: string; signedIn?: boolean; signal?: AbortSignal } = {}) =>
    routes.imports.POST(
      request("/api/cloud/imports", {
        body,
        site: options.site,
        cookie: options.signedIn === false ? undefined : cookie,
        signal: options.signal,
      }),
    )

  const puts = () => r2.requests.filter((entry) => entry.startsWith("PUT library/"))

  beforeEach(async () => {
    Object.assign(process.env, env)
    r2 = installFakeR2()
    routes = loadRoutes()
    const login = await routes.session.POST(request("/api/cloud/session", { body: { password: PASSWORD } }))
    cookie = (login.headers.get("set-cookie") ?? "").split(";")[0]

    mockFetchTrackAudio.mockReset().mockImplementation(async () => audio(SOURCE_FLAC, "audio/flac"))
    mockFetchCover.mockReset().mockImplementation(async () => audio(COVER, "image/jpeg"))
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    r2.restore()
    process.env = { ...savedEnv }
    jest.mocked(console.warn).mockRestore()
    jest.mocked(console.error).mockRestore()
  })

  it("refuses callers who are not signed in, or not this app, before fetching anything", async () => {
    expect((await save(TRACK, { signedIn: false })).status).toBe(401)
    expect((await save(TRACK, { site: "cross-site" })).status).toBe(403)
    expect(mockFetchTrackAudio).not.toHaveBeenCalled()
  })

  it("stores a FLAC under the name a download to the device gets, tagged the same way", async () => {
    const response = await save(TRACK)
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({ status: "stored", key: FLAC_KEY })

    expect(mockFetchTrackAudio).toHaveBeenCalledWith(SOURCE_URL, { signal: expect.any(AbortSignal) })
    expect(mockFetchCover.mock.calls[0][0].href).toBe(COVER_URL)
    const stored = r2.objects.get(FLAC_KEY)
    expect(stored?.contentType).toBe("audio/flac")
    const expected = withFlacMetadata(SOURCE_FLAC, downloadTags(TRACK), { data: COVER, type: "image/jpeg" })
    expect(Buffer.from(stored!.body)).toEqual(Buffer.from(expected))
  })

  it("reports a track the library already holds without writing it again", async () => {
    await save(TRACK)
    expect(await (await save(TRACK)).json()).toEqual({ status: "exists", key: FLAC_KEY })
    expect(puts()).toEqual([`PUT ${FLAC_KEY}`])
  })

  it("gives a different song with a taken name its own key, leaving the other alone", async () => {
    r2.put(FLAC_KEY, new Uint8Array(5))
    const body = await (await save(TRACK)).json()
    expect(body.status).toBe("stored")
    expect(body.key).toMatch(/^library\/[0-9a-f]{12}\/WOODZ - AMNESIA\.flac$/)
    expect(r2.objects.get(FLAC_KEY)?.body.length).toBe(5)
  })

  it("stores AAC as the source sent it, without fetching a cover it would not carry", async () => {
    mockFetchTrackAudio.mockImplementation(async () => audio(SOURCE_AAC, "audio/mp4"))
    expect(await (await save(TRACK)).json()).toEqual({ status: "stored", key: "library/WOODZ - AMNESIA.m4a" })

    const stored = r2.objects.get("library/WOODZ - AMNESIA.m4a")
    expect(stored?.contentType).toBe("audio/mp4")
    expect(Buffer.from(stored!.body)).toEqual(Buffer.from(SOURCE_AAC))
    expect(mockFetchCover).not.toHaveBeenCalled()
  })

  it.each([
    ["the cover fails to load", () => mockFetchCover.mockRejectedValue(new Error("timed out"))],
    [
      "the cover is missing",
      () => mockFetchCover.mockImplementation(async () => audio(new Uint8Array(), "text/plain", 404)),
    ],
  ])("saves the song without its cover when %s", async (_label, arrange) => {
    arrange()
    expect((await save(TRACK)).status).toBe(200)
    const expected = withFlacMetadata(SOURCE_FLAC, downloadTags(TRACK))
    expect(Buffer.from(r2.objects.get(FLAC_KEY)!.body)).toEqual(Buffer.from(expected))
  })

  it("never fetches a cover from outside the catalogs", async () => {
    expect((await save({ ...TRACK, albumCover: "https://example.com/cover.jpg" })).status).toBe(200)
    expect(mockFetchCover).not.toHaveBeenCalled()
  })

  it("takes details the catalog sends as null as missing", async () => {
    const response = await save({ ...TRACK, genre: null, trackNumber: null, discNumber: null, isrc: null })
    expect(response.status).toBe(200)

    const known: DownloadTrack = { ...TRACK, genre: undefined, trackNumber: undefined, discNumber: undefined, isrc: undefined }
    const expected = withFlacMetadata(SOURCE_FLAC, downloadTags(known), { data: COVER, type: "image/jpeg" })
    expect(Buffer.from(r2.objects.get(FLAC_KEY)!.body)).toEqual(Buffer.from(expected))
  })

  const notAudio = new TextEncoder().encode('{"error":"x"}')

  it.each([
    [
      "cannot prepare the song",
      () => mockFetchTrackAudio.mockRejectedValue(new Error("Lucida job timed out")),
      "The source could not send the song",
    ],
    [
      "answers with an error",
      () => mockFetchTrackAudio.mockImplementation(async () => audio(new Uint8Array(), "text/plain", 503)),
      "The source did not send the song (503)",
    ],
    [
      "sends something that is not audio",
      () => mockFetchTrackAudio.mockImplementation(async () => audio(notAudio, "audio/flac")),
      "The source sent something that is not a song",
    ],
  ])("says so, and writes nothing, when the source %s", async (_label, arrange, message) => {
    arrange()
    const response = await save(TRACK)
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: message })
    expect(puts()).toEqual([])
  })

  it.each([
    ["an id that is not a track", { ...TRACK, id: encodeId({ k: "al", u: "https://play.qobuz.com/album/1" }) }],
    ["no id", { ...TRACK, id: "" }],
    ["extra fields", { ...TRACK, key: "index/library-v1.json" }],
    ["a body that is not JSON", "{not json"],
  ])("rejects %s without fetching anything", async (_label, body) => {
    expect((await save(body)).status).toBe(400)
    expect(mockFetchTrackAudio).not.toHaveBeenCalled()
    expect(puts()).toEqual([])
  })

  it("stops, writing nothing, when the app cancels the save", async () => {
    const controller = new AbortController()
    mockFetchTrackAudio.mockImplementation(async () => {
      controller.abort()
      throw new DOMException("The operation was aborted", "AbortError")
    })
    expect((await save(TRACK, { signal: controller.signal })).status).toBe(499)
    expect(puts()).toEqual([])
  })
})
