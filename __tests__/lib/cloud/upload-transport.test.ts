import { UploadError, browserTransport } from "@/lib/cloud/upload-queue"

/** Just enough of XMLHttpRequest to drive the transport's PUT. */
class FakeXhr {
  static last: FakeXhr
  method = ""
  url = ""
  headers: Record<string, string> = {}
  status = 0
  body: unknown
  upload: { onprogress: ((event: { loaded: number }) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null

  constructor() {
    FakeXhr.last = this
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }
  send(body: unknown) {
    this.body = body
  }
  abort() {
    this.onabort?.()
  }
  respond(status: number) {
    this.status = status
    this.onload?.()
  }
}

const plan = { url: "https://r2.test/library/a.flac?X-Amz-Signature=x", headers: { "Content-Type": "audio/flac", "If-None-Match": "*" } }
const file = new File([new Uint8Array(10)], "a.flac")

describe("browserTransport.send", () => {
  const original = globalThis.XMLHttpRequest
  beforeEach(() => {
    Object.assign(globalThis, { XMLHttpRequest: FakeXhr })
  })
  afterEach(() => {
    Object.assign(globalThis, { XMLHttpRequest: original })
    jest.useRealTimers()
  })

  it("PUTs the file with exactly the signed headers and reports progress", async () => {
    const progress: number[] = []
    const sending = browserTransport.send(plan, file, (sent) => progress.push(sent), new AbortController().signal)
    const xhr = FakeXhr.last
    expect(xhr.method).toBe("PUT")
    expect(xhr.url).toBe(plan.url)
    expect(xhr.headers).toEqual(plan.headers)
    expect(xhr.body).toBe(file)

    xhr.upload.onprogress?.({ loaded: 4 })
    xhr.respond(200)
    await expect(sending).resolves.toBe("stored")
    expect(progress).toEqual([4, 10])
  })

  it("treats a failed If-None-Match as the file already being there", async () => {
    const sending = browserTransport.send(plan, file, () => {}, new AbortController().signal)
    FakeXhr.last.respond(412)
    await expect(sending).resolves.toBe("exists")
  })

  it.each([
    [503, true],
    [403, true],
    [400, false],
  ])("rejects status %i as retryable=%s", async (status, retryable) => {
    const sending = browserTransport.send(plan, file, () => {}, new AbortController().signal)
    FakeXhr.last.respond(status)
    await expect(sending).rejects.toMatchObject({ retryable })
  })

  it("retries a dropped connection", async () => {
    const sending = browserTransport.send(plan, file, () => {}, new AbortController().signal)
    FakeXhr.last.onerror?.()
    await expect(sending).rejects.toMatchObject({ retryable: true })
  })

  it("aborts on cancel, and tells a cancel from a stall", async () => {
    const controller = new AbortController()
    const cancelled = browserTransport.send(plan, file, () => {}, controller.signal)
    controller.abort()
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" })

    jest.useFakeTimers()
    const stalled = browserTransport.send(plan, file, () => {}, new AbortController().signal)
    jest.advanceTimersByTime(60_000)
    await expect(stalled).rejects.toEqual(new UploadError("The upload stalled", true))
  })
})

describe("browserTransport.plan", () => {
  const original = globalThis.fetch
  afterEach(() => {
    Object.assign(globalThis, { fetch: original })
  })

  const respond = (status: number, body: unknown) =>
    Object.assign(globalThis, {
      fetch: jest.fn(async () => ({ ok: status < 300, status, json: async () => body })),
    })

  it("asks the server where the file goes", async () => {
    respond(200, { status: "exists", key: "library/a.flac" })
    await expect(browserTransport.plan("a.flac", 10, new AbortController().signal)).resolves.toEqual({
      status: "exists",
      key: "library/a.flac",
    })
    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe("/api/cloud/uploads")
    expect(JSON.parse(init.body)).toEqual({ name: "a.flac", size: 10 })
  })

  it.each([
    [401, false, "Signed out — sign in again, then retry"],
    [403, false, "Cross-origin request refused"],
    [400, false, "Not an audio file"],
    [502, true, "Could not reach the cloud library"],
  ])("turns status %i into retryable=%s", async (status, retryable, message) => {
    respond(status, { error: message })
    await expect(browserTransport.plan("a.flac", 10, new AbortController().signal)).rejects.toEqual(
      new UploadError(message, retryable),
    )
  })
})
