/**
 * @jest-environment node
 */
import { R2Client } from "@/lib/cloud/r2"

const config = {
  accountId: "acct",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "secret",
  bucket: "audora-music",
  password: "x".repeat(12),
  sessionSecret: "s".repeat(32),
}

function mockFetch(response: Response) {
  const fetchMock = jest.fn(async () => response)
  Object.assign(globalThis, { fetch: fetchMock })
  return fetchMock
}

describe("R2Client", () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    Object.assign(globalThis, { fetch: originalFetch })
  })

  it("bypasses the fetch cache and asks for an uncompressed body when reading", async () => {
    const fetchMock = mockFetch(new Response("{}", { status: 200, headers: { etag: '"abc"' } }))
    const result = await new R2Client(config).read("index/library-v1.json")

    expect(result?.etag).toBe('"abc"')
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.cache).toBe("no-store")
    // Unbounded, one stalled read would hold an indexing pass open forever.
    expect(init.signal).toBeInstanceOf(AbortSignal)
    // A gzipped response carries a weak ETag that If-Match never matches.
    expect(new Headers(init.headers).get("accept-encoding")).toBe("identity")
  })

  it("sends the original body on writes so Node can set Content-Length", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 200 }))
    const body = new Uint8Array([1, 2, 3])
    await new R2Client(config).write("art/x", body, { contentType: "image/jpeg", ifMatch: '"abc"' })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://acct.r2.cloudflarestorage.com/audora-music/art/x")
    expect(init.method).toBe("PUT")
    expect(init.body).toBe(body)
    expect(new Headers(init.headers).get("if-match")).toBe('"abc"')
    expect(new Headers(init.headers).get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /)
  })

  it("reports a failed precondition as false rather than throwing", async () => {
    mockFetch(new Response("<Error/>", { status: 412 }))
    const written = await new R2Client(config).write("index/library-v1.json", "{}", {
      contentType: "application/json",
      ifMatch: '"stale"',
    })
    expect(written).toBe(false)
  })

  it("encodes keys per segment, including characters encodeURIComponent leaves alone", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 404 }))
    await new R2Client(config).read("library/Don't Stop (feat. A&B).flac")
    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toBe(
      "https://acct.r2.cloudflarestorage.com/audora-music/library/Don%27t%20Stop%20%28feat.%20A%26B%29.flac",
    )
  })
})
