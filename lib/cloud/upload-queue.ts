import { trackSyncKey } from "@/lib/sync/song-match"

import { isAudioFileName } from "./audio-files"
import type { CloudUploadPlan } from "./types"
import { MAX_UPLOAD_BYTES, checkUploadName } from "./upload-rules"

/**
 * Uploads to the cloud library, one batch at a time. Client only.
 *
 * Each file is signed just before it starts — one request to
 * `/api/cloud/uploads` — then PUT straight to R2, a few at a time. Failures
 * that a second try can fix (the network, R2 being busy) are retried with
 * backoff and a fresh signature; the rest are reported per file and can be
 * retried by hand. Nothing here touches React: views read it through
 * `subscribe` / `getSnapshot`, so progress events re-render only what shows
 * them.
 */

/** Files sent at once. Enough to fill most uplinks without starving playback. */
const CONCURRENCY = 3

/** Tries per file before it is reported as failed. */
const MAX_ATTEMPTS = 4
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000]

/** Progress reaches views at most this often. */
const EMIT_INTERVAL_MS = 200

/** The upload rate is averaged over this much recent time. */
const RATE_WINDOW_MS = 5_000

/** Reported for files the person stopped; `retryFailed` picks them up again. */
const CANCELLED = "Cancelled"

export class UploadError extends Error {
  constructor(
    message: string,
    /** Whether trying the same file again could succeed. */
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = "UploadError"
  }
}

/** R2 busy or unreachable, or a signature that went stale: worth another try. */
export function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 403 || status === 408 || status === 429 || status >= 500
}

/** How the queue reaches the server and R2. Swapped out in tests. */
export interface UploadTransport {
  plan(name: string, size: number, signal: AbortSignal): Promise<CloudUploadPlan>
  /** PUT `file` as `plan` says. Resolves to "exists" when R2 already had the key. */
  send(
    plan: { url: string; headers: Record<string, string> },
    file: Blob,
    onProgress: (sent: number) => void,
    signal: AbortSignal,
  ): Promise<"stored" | "exists">
  wait(ms: number, signal: AbortSignal): Promise<void>
}

export interface UploadProgress {
  name: string
  sent: number
  size: number
}

export interface UploadFailure {
  name: string
  reason: string
  /** False for files the library can never take, which `retryFailed` leaves alone. */
  retryable: boolean
}

export interface UploadSnapshot {
  /** True while any file is waiting or being sent. */
  active: boolean
  /** Files in this batch, counting the ones skipped and failed. */
  total: number
  uploaded: number
  /** Already in the cloud, so not sent. */
  skipped: number
  failed: readonly UploadFailure[]
  inProgress: readonly UploadProgress[]
  /** Bytes this batch sends: the uploaded, the in-progress and the waiting files. */
  bytesTotal: number
  bytesSent: number
  bytesPerSecond: number
}

type ItemStatus = "queued" | "uploading" | "uploaded" | "skipped" | "failed"

interface UploadItem {
  /** Dropped once the file is stored, so a finished batch holds no file handles. */
  file: File | null
  name: string
  size: number
  track: string
  status: ItemStatus
  sent: number
  reason?: string
  /** Failed a check no retry can pass: not a valid name, empty, too large. */
  final?: boolean
  abort?: AbortController
}

export interface UploadQueueOptions {
  transport?: UploadTransport
  now?: () => number
  emitIntervalMs?: number
}

const IDLE: UploadSnapshot = {
  active: false,
  total: 0,
  uploaded: 0,
  skipped: 0,
  failed: [],
  inProgress: [],
  bytesTotal: 0,
  bytesSent: 0,
  bytesPerSecond: 0,
}

function describe(error: unknown): string {
  if (error instanceof UploadError) return error.message
  return "Could not reach the cloud library"
}

function isRetryable(error: unknown): boolean {
  // Anything not classified is a network-level failure (fetch rejects with a
  // TypeError when it cannot connect), which is exactly what a retry is for.
  return error instanceof UploadError ? error.retryable : true
}

export class UploadQueue {
  private readonly transport: UploadTransport
  private readonly now: () => number
  private readonly emitIntervalMs: number

  private items: UploadItem[] = []
  private waiting: UploadItem[] = []
  private running = 0

  /** Bytes put on the wire, never decreasing — the basis of the rate. */
  private transferred = 0
  private samples: { at: number; bytes: number }[] = []

  private snapshot: UploadSnapshot = IDLE
  private readonly listeners = new Set<() => void>()
  private lastEmit = Number.NEGATIVE_INFINITY
  private emitTimer: ReturnType<typeof setTimeout> | undefined

  constructor(options: UploadQueueOptions = {}) {
    this.transport = options.transport ?? browserTransport
    this.now = options.now ?? (() => performance.now())
    this.emitIntervalMs = options.emitIntervalMs ?? EMIT_INTERVAL_MS
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): UploadSnapshot => this.snapshot

  /**
   * Queue `files`. Anything that is not audio is ignored — a picked folder
   * holds covers and playlists too — and a track already in this batch is
   * not queued twice. `isInCloud` lets the caller skip, without a request,
   * tracks it already knows the library holds.
   *
   * Returns how many of `files` were audio, so a picker that found none can say so.
   */
  add(files: Iterable<File>, isInCloud: (track: string) => boolean = () => false): number {
    let audio = 0
    const inBatch = new Map(this.items.map((item) => [item.track, item]))

    for (const file of files) {
      if (!isAudioFileName(file.name)) continue
      audio++
      const check = checkUploadName(file.name)
      const name = check.ok ? check.name : file.name
      const track = trackSyncKey({ fileName: name, fileSize: file.size }) ?? `${file.size}:${name}`

      const existing = inBatch.get(track)
      if (existing) {
        if (existing.status === "failed" && !existing.final) this.requeue(existing, file)
        continue
      }

      const item: UploadItem = { file, name, size: file.size, track, status: "queued", sent: 0 }
      if (!check.ok) this.reject(item, check.reason)
      else if (file.size === 0) this.reject(item, "The file is empty")
      else if (file.size > MAX_UPLOAD_BYTES) this.reject(item, "Larger than the 5 GB upload limit")
      else if (isInCloud(track)) this.finish(item, "skipped")
      else this.waiting.push(item)

      this.items.push(item)
      inBatch.set(track, item)
    }

    this.changed(true)
    this.pump()
    return audio
  }

  /** Stop every file not yet stored. They are reported as failed, so `retryFailed` resumes them. */
  cancel(): void {
    this.waiting = []
    for (const item of this.items) {
      if (item.status !== "queued" && item.status !== "uploading") continue
      item.abort?.abort()
      this.fail(item, CANCELLED)
    }
    this.changed(true)
  }

  retryFailed(): void {
    for (const item of this.items) {
      if (item.status === "failed" && !item.final && item.file) this.requeue(item, item.file)
    }
    this.changed(true)
    this.pump()
  }

  /** Forget a finished batch. Does nothing while files are still going. */
  clear(): void {
    if (this.snapshot.active) return
    this.items = []
    this.samples = []
    this.changed(true)
  }

  private requeue(item: UploadItem, file: File): void {
    item.file = file
    item.status = "queued"
    item.sent = 0
    item.reason = undefined
    this.waiting.push(item)
  }

  private fail(item: UploadItem, reason: string): void {
    item.status = "failed"
    item.reason = reason
    item.sent = 0
  }

  /** Fail a file the library can never take, for good. */
  private reject(item: UploadItem, reason: string): void {
    this.fail(item, reason)
    item.final = true
    item.file = null
  }

  private finish(item: UploadItem, status: "uploaded" | "skipped"): void {
    item.status = status
    item.sent = status === "uploaded" ? item.size : 0
    item.file = null
  }

  private pump(): void {
    while (this.running < CONCURRENCY && this.waiting.length > 0) {
      void this.run(this.waiting.shift()!)
    }
  }

  private async run(item: UploadItem): Promise<void> {
    const abort = new AbortController()
    item.abort = abort
    item.status = "uploading"
    item.sent = 0
    this.running++
    this.changed(true)

    try {
      this.finish(item, await this.upload(item, abort.signal))
    } catch (error) {
      // A cancelled file was already marked by `cancel`.
      if (!abort.signal.aborted) {
        console.error(`Upload of ${item.name} failed:`, error)
        this.fail(item, describe(error))
      }
    } finally {
      // A cancelled file may already be running again after a retry.
      if (item.abort === abort) item.abort = undefined
      this.running--
      this.changed(true)
      this.pump()
    }
  }

  private async upload(item: UploadItem, signal: AbortSignal): Promise<"uploaded" | "skipped"> {
    const file = item.file!
    for (let attempt = 1; ; attempt++) {
      try {
        const plan = await this.transport.plan(item.name, item.size, signal)
        if (plan.status === "exists") return "skipped"
        const outcome = await this.transport.send(plan, file, (sent) => this.progress(item, sent), signal)
        return outcome === "stored" ? "uploaded" : "skipped"
      } catch (error) {
        if (signal.aborted || !isRetryable(error) || attempt >= MAX_ATTEMPTS) throw error
        item.sent = 0
        this.changed()
        await this.transport.wait(RETRY_DELAYS_MS[attempt - 1], signal)
      }
    }
  }

  private progress(item: UploadItem, sent: number): void {
    if (sent > item.sent) this.transferred += sent - item.sent
    item.sent = sent
    this.changed()
  }

  /** Publish a new snapshot: now for a change of state, at most every `emitIntervalMs` for progress. */
  private changed(immediate = false): void {
    if (this.emitTimer !== undefined) {
      if (!immediate) return
      clearTimeout(this.emitTimer)
      this.emitTimer = undefined
    }
    const wait = this.lastEmit + this.emitIntervalMs - this.now()
    if (immediate || wait <= 0) {
      this.emit()
      return
    }
    this.emitTimer = setTimeout(() => {
      this.emitTimer = undefined
      this.emit()
    }, wait)
  }

  private emit(): void {
    const at = this.now()
    this.lastEmit = at
    this.snapshot = this.summarize(at)
    for (const listener of this.listeners) listener()
  }

  private summarize(at: number): UploadSnapshot {
    if (this.items.length === 0) return IDLE

    let uploaded = 0
    let skipped = 0
    let bytesTotal = 0
    let bytesSent = 0
    const failed: UploadFailure[] = []
    const inProgress: UploadProgress[] = []

    for (const item of this.items) {
      switch (item.status) {
        case "uploaded":
          uploaded++
          bytesTotal += item.size
          bytesSent += item.size
          break
        case "skipped":
          skipped++
          break
        case "failed":
          failed.push({ name: item.name, reason: item.reason ?? "Upload failed", retryable: !item.final })
          break
        case "uploading":
          inProgress.push({ name: item.name, sent: item.sent, size: item.size })
          bytesTotal += item.size
          bytesSent += item.sent
          break
        case "queued":
          bytesTotal += item.size
          break
      }
    }

    const active = this.running > 0 || this.waiting.length > 0
    // A later batch measures its rate from its own start.
    if (!active) this.samples = []
    return {
      active,
      total: this.items.length,
      uploaded,
      skipped,
      failed,
      inProgress,
      bytesTotal,
      bytesSent,
      bytesPerSecond: active ? this.rate(at) : 0,
    }
  }

  private rate(at: number): number {
    this.samples.push({ at, bytes: this.transferred })
    while (this.samples.length > 2 && this.samples[0].at < at - RATE_WINDOW_MS) this.samples.shift()
    const first = this.samples[0]
    const elapsed = at - first.at
    return elapsed > 0 ? ((this.transferred - first.bytes) * 1000) / elapsed : 0
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string }
    return body.error ?? `Request failed (${response.status})`
  } catch {
    return `Request failed (${response.status})`
  }
}

/** No progress for this long means the connection has stalled. */
const STALL_TIMEOUT_MS = 60_000

/** Exported for tests; the queue uses it unless given another. */
export const browserTransport: UploadTransport = {
  async plan(name, size, signal) {
    const response = await fetch("/api/cloud/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, size }),
      cache: "no-store",
      signal,
    })
    if (!response.ok) {
      const message = response.status === 401 ? "Signed out — sign in again, then retry" : await readError(response)
      // 403 here is the origin check, which a retry cannot change.
      throw new UploadError(message, response.status !== 403 && isRetryableStatus(response.status))
    }
    return (await response.json()) as CloudUploadPlan
  },

  // XHR rather than fetch: only XHR reports upload progress.
  send(plan, file, onProgress, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException("Upload cancelled", "AbortError"))
      const xhr = new XMLHttpRequest()
      let stalled: ReturnType<typeof setTimeout> | undefined
      const watch = () => {
        clearTimeout(stalled)
        stalled = setTimeout(() => xhr.abort(), STALL_TIMEOUT_MS)
      }
      const settle = () => {
        clearTimeout(stalled)
        signal.removeEventListener("abort", onAbort)
      }
      const onAbort = () => xhr.abort()

      xhr.open("PUT", plan.url)
      for (const [name, value] of Object.entries(plan.headers)) xhr.setRequestHeader(name, value)
      xhr.upload.onprogress = (event) => {
        watch()
        onProgress(event.loaded)
      }
      xhr.onload = () => {
        settle()
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(file.size)
          resolve("stored")
        } else if (xhr.status === 412) {
          resolve("exists")
        } else {
          reject(new UploadError(`Upload failed (${xhr.status})`, isRetryableStatus(xhr.status)))
        }
      }
      xhr.onerror = () => {
        settle()
        reject(new UploadError("The connection to the cloud dropped", true))
      }
      xhr.onabort = () => {
        settle()
        reject(
          signal.aborted
            ? new DOMException("Upload cancelled", "AbortError")
            : new UploadError("The upload stalled", true),
        )
      }

      signal.addEventListener("abort", onAbort, { once: true })
      watch()
      xhr.send(file)
    })
  },

  wait(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException("Upload cancelled", "AbortError"))
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort)
        resolve()
      }, ms)
      const onAbort = () => {
        clearTimeout(timer)
        reject(new DOMException("Upload cancelled", "AbortError"))
      }
      signal.addEventListener("abort", onAbort, { once: true })
    })
  },
}

/** The page's upload queue, shared by every view so a batch outlives the dialog that started it. */
export const cloudUploads = new UploadQueue()
