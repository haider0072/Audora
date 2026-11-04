/**
 * @jest-environment node
 */
import type { CloudUploadPlan } from "@/lib/cloud/types"
import { UploadError, UploadQueue, type UploadTransport } from "@/lib/cloud/upload-queue"
import { trackSyncKey } from "@/lib/sync/song-match"

interface PendingSend {
  name: string
  onProgress: (sent: number) => void
  resolve: (outcome: "stored" | "exists") => void
  reject: (error: unknown) => void
}

/** A transport whose sends stay open until the test settles them. */
function controlledTransport() {
  const sends: PendingSend[] = []
  const plans: string[] = []
  const waits: number[] = []
  let planFor: (name: string) => Promise<CloudUploadPlan> = async (name) => ({
    status: "upload",
    key: `library/${name}`,
    url: `https://r2.test/${name}`,
    headers: { "If-None-Match": "*" },
  })

  const transport: UploadTransport = {
    plan(name) {
      plans.push(name)
      return planFor(name)
    },
    send(plan, _file, onProgress, signal) {
      return new Promise((resolve, reject) => {
        const name = decodeURIComponent(new URL(plan.url).pathname.slice(1))
        const send = { name, onProgress, resolve, reject }
        sends.push(send)
        signal.addEventListener("abort", () => {
          sends.splice(sends.indexOf(send), 1)
          reject(new DOMException("cancelled", "AbortError"))
        })
      })
    },
    async wait(ms) {
      waits.push(ms)
    },
  }

  return {
    transport,
    sends,
    plans,
    waits,
    setPlan(next: typeof planFor) {
      planFor = next
    },
    /** Settle the open send for `name`. */
    finish(name: string, outcome: "stored" | "exists" = "stored") {
      const index = sends.findIndex((send) => send.name === name)
      const [send] = sends.splice(index, 1)
      send.resolve(outcome)
    },
    fail(name: string, error: unknown) {
      const index = sends.findIndex((send) => send.name === name)
      const [send] = sends.splice(index, 1)
      send.reject(error)
    },
  }
}

const file = (name: string, size = 100) => new File([new Uint8Array(size)], name)
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup() {
  const fake = controlledTransport()
  const queue = new UploadQueue({ transport: fake.transport, emitIntervalMs: 0 })
  return { fake, queue }
}

describe("UploadQueue", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("sends audio files three at a time and ignores everything else in a folder", async () => {
    const { fake, queue } = setup()
    const audio = queue.add([
      file("1.flac"),
      file("cover.jpg"),
      file("2.flac"),
      file("3.mp3"),
      file("4.flac"),
      file(".DS_Store"),
    ])
    expect(audio).toBe(4)
    await flush()

    expect(fake.sends.map((send) => send.name)).toEqual(["1.flac", "2.flac", "3.mp3"])
    expect(queue.getSnapshot()).toMatchObject({ active: true, total: 4, uploaded: 0, bytesTotal: 400 })

    fake.finish("2.flac")
    await flush()
    expect(fake.sends.map((send) => send.name)).toEqual(["1.flac", "3.mp3", "4.flac"])

    for (const name of ["1.flac", "3.mp3", "4.flac"]) fake.finish(name)
    await flush()
    expect(queue.getSnapshot()).toMatchObject({
      active: false,
      total: 4,
      uploaded: 4,
      bytesSent: 400,
      bytesTotal: 400,
      bytesPerSecond: 0,
    })
  })

  it("reports progress as bytes leave", async () => {
    const { fake, queue } = setup()
    queue.add([file("a.flac", 1000)])
    await flush()

    fake.sends[0].onProgress(250)
    expect(queue.getSnapshot()).toMatchObject({
      bytesSent: 250,
      inProgress: [{ name: "a.flac", sent: 250, size: 1000 }],
    })
  })

  it("skips tracks already in the cloud, by what the caller knows and by what the server or R2 says", async () => {
    const { fake, queue } = setup()
    const known = trackSyncKey({ fileName: "known.flac", fileSize: 100 })
    fake.setPlan(async (name) =>
      name === "listed.flac"
        ? { status: "exists", key: `library/${name}` }
        : { status: "upload", key: `library/${name}`, url: `https://r2.test/${name}`, headers: {} },
    )

    queue.add([file("known.flac"), file("listed.flac"), file("raced.flac")], (track) => track === known)
    await flush()
    expect(fake.plans).toEqual(["listed.flac", "raced.flac"])

    fake.finish("raced.flac", "exists")
    await flush()
    expect(queue.getSnapshot()).toMatchObject({ active: false, uploaded: 0, skipped: 3, bytesTotal: 0 })
  })

  it("retries what a second try can fix, signing again each time, then gives up", async () => {
    const { fake, queue } = setup()
    queue.add([file("a.flac")])
    for (let attempt = 0; attempt < 4; attempt++) {
      await flush()
      fake.fail("a.flac", new UploadError("Upload failed (503)", true))
    }
    await flush()

    expect(fake.plans).toEqual(["a.flac", "a.flac", "a.flac", "a.flac"])
    expect(fake.waits).toEqual([2000, 4000, 8000])
    expect(queue.getSnapshot()).toMatchObject({
      active: false,
      failed: [{ name: "a.flac", reason: "Upload failed (503)", retryable: true }],
    })
  })

  it("fails at once on what a retry cannot fix", async () => {
    const { fake, queue } = setup()
    fake.setPlan(async () => {
      throw new UploadError("Signed out — sign in again, then retry", false)
    })
    queue.add([file("a.flac")])
    await flush()

    expect(fake.plans).toHaveLength(1)
    expect(queue.getSnapshot().failed).toEqual([
      { name: "a.flac", reason: "Signed out — sign in again, then retry", retryable: true },
    ])
  })

  it("turns away files the library cannot take without asking the server", async () => {
    const { fake, queue } = setup()
    queue.add([file("empty.flac", 0), file(`${"x".repeat(300)}.flac`)])
    await flush()

    expect(fake.plans).toEqual([])
    expect(queue.getSnapshot()).toMatchObject({ active: false, total: 2 })
    expect(queue.getSnapshot().failed).toEqual([
      { name: "empty.flac", reason: "The file is empty", retryable: false },
      { name: `${"x".repeat(300)}.flac`, reason: "The file name is too long", retryable: false },
    ])

    // Neither retrying nor picking them again sends them.
    queue.retryFailed()
    queue.add([file("empty.flac", 0)])
    await flush()
    expect(fake.plans).toEqual([])
  })

  it("queues a track once per batch, but takes a failed one back", async () => {
    const { fake, queue } = setup()
    queue.add([file("a.flac"), file("a.flac")])
    await flush()
    expect(fake.sends).toHaveLength(1)

    fake.fail("a.flac", new UploadError("Upload failed (400)", false))
    await flush()
    queue.add([file("a.flac")])
    await flush()
    expect(fake.sends).toHaveLength(1)
    expect(queue.getSnapshot()).toMatchObject({ total: 1, failed: [] })
  })

  it("cancels every unfinished file, and resumes them on retry", async () => {
    const { fake, queue } = setup()
    queue.add([file("1.flac"), file("2.flac"), file("3.flac"), file("4.flac")])
    await flush()
    fake.finish("1.flac")
    await flush()

    queue.cancel()
    await flush()
    expect(queue.getSnapshot()).toMatchObject({ active: false, uploaded: 1 })
    expect(queue.getSnapshot().failed).toEqual([
      { name: "2.flac", reason: "Cancelled", retryable: true },
      { name: "3.flac", reason: "Cancelled", retryable: true },
      { name: "4.flac", reason: "Cancelled", retryable: true },
    ])

    queue.retryFailed()
    await flush()
    expect(fake.sends.map((send) => send.name)).toEqual(["2.flac", "3.flac", "4.flac"])
    for (const name of ["2.flac", "3.flac", "4.flac"]) fake.finish(name)
    await flush()
    expect(queue.getSnapshot()).toMatchObject({ active: false, uploaded: 4, failed: [] })
  })

  it("can still cancel a file retried before its cancelled run wound down", async () => {
    const { fake, queue } = setup()
    queue.add([file("a.flac")])
    await flush()

    queue.cancel()
    queue.retryFailed()
    await flush()
    expect(fake.sends.map((send) => send.name)).toEqual(["a.flac"])

    queue.cancel()
    await flush()
    expect(fake.sends).toHaveLength(0)
    expect(queue.getSnapshot()).toMatchObject({ active: false, failed: [{ name: "a.flac", reason: "Cancelled" }] })
  })

  it("clears a finished batch, but never one in progress", async () => {
    const { fake, queue } = setup()
    queue.add([file("a.flac")])
    await flush()

    queue.clear()
    expect(queue.getSnapshot().total).toBe(1)

    fake.finish("a.flac")
    await flush()
    queue.clear()
    expect(queue.getSnapshot()).toMatchObject({ active: false, total: 0 })
  })

  it("notifies subscribers and keeps one snapshot object between changes", async () => {
    const { fake, queue } = setup()
    const listener = jest.fn()
    const unsubscribe = queue.subscribe(listener)

    queue.add([file("a.flac")])
    await flush()
    expect(listener).toHaveBeenCalled()
    expect(queue.getSnapshot()).toBe(queue.getSnapshot())

    unsubscribe()
    listener.mockClear()
    fake.finish("a.flac")
    await flush()
    expect(listener).not.toHaveBeenCalled()
  })
})
