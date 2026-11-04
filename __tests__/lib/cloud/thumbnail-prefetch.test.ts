import { prefetchThumbnails } from "@/lib/cloud/thumbnail-prefetch"

describe("prefetchThumbnails", () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    Object.assign(globalThis, { fetch: originalFetch })
  })

  function mockFetch() {
    let inFlight = 0
    let peak = 0
    const fetchMock = jest.fn(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await Promise.resolve()
      inFlight--
      return { ok: true, blob: async () => new Blob() }
    })
    Object.assign(globalThis, { fetch: fetchMock })
    return { fetchMock, peak: () => peak }
  }

  it("fetches every thumbnail at low priority, a few at a time", async () => {
    const { fetchMock, peak } = mockFetch()
    const urls = Array.from({ length: 10 }, (_, i) => `https://r2.test/t${i}.webp`)
    await prefetchThumbnails(urls, new AbortController().signal)

    expect(fetchMock).toHaveBeenCalledTimes(10)
    expect(fetchMock.mock.calls[0]).toEqual([urls[0], expect.objectContaining({ priority: "low" })])
    expect(peak()).toBeLessThanOrEqual(4)
  })

  it("does not fetch a thumbnail twice in one page", async () => {
    const { fetchMock } = mockFetch()
    await prefetchThumbnails(["https://r2.test/once.webp"], new AbortController().signal)
    await prefetchThumbnails(["https://r2.test/once.webp"], new AbortController().signal)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("stops when aborted", async () => {
    const { fetchMock } = mockFetch()
    const controller = new AbortController()
    controller.abort()
    await prefetchThumbnails(["https://r2.test/never.webp"], controller.signal)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
