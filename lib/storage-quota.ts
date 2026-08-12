/**
 * Browser storage quota + persistence helpers.
 *
 * The audio store deliberately has no app-invented size cap: a music library is
 * allowed to be as large as the user's disk permits.
 *
 * What it cannot have is blind faith in `navigator.storage.estimate()`. That
 * figure is an estimate by specification, and privacy-focused browsers
 * deliberately misreport it — Brave and Firefox both substitute a flat 2 GiB
 * for the real ceiling so disk size cannot be fingerprinted, with no way for a
 * page to opt out. Against a multi-gigabyte library that reads as "already over
 * budget, nothing available", permanently, so a pre-flight check that trusts it
 * refuses every import and download on a machine with 100 GB free.
 *
 * The reported numbers are therefore used only while they stay self-consistent,
 * and the authority on whether a write fits is the write itself: IndexedDB
 * raises `QuotaExceededError` when the bytes genuinely do not fit, and that is
 * the one signal that is true in every browser.
 */

/**
 * Never let the origin run itself to a hard zero. Wedging the quota makes even
 * metadata writes fail, which is a far worse state than refusing one download.
 *
 * Bounded as a share of the quota as well: a flat margin is sensible against
 * the ~100 GB a desktop browser hands out and disproportionate against a small
 * one, where it would quietly eat a double-digit percentage of the room.
 */
const SAFETY_MARGIN_BYTES = 250 * 1024 * 1024
const SAFETY_MARGIN_SHARE = 0.02

/**
 * The value Brave and Firefox report in place of the real quota, to keep disk
 * size out of a fingerprint. Exactly 2 GiB and identical on every machine — a
 * genuine Chromium quota is a share of disk size and does not land on a power
 * of two. Treating it as unmeasured costs nothing: the write still decides.
 */
const CLAMPED_QUOTA_BYTES = 2 * 1024 * 1024 * 1024

/** Surface a warning in the storage UI once usage crosses this share of quota. */
export const STORAGE_WARN_THRESHOLD = 0.8

export interface QuotaStatus {
  usage: number
  quota: number
  /** Bytes we are willing to hand out. Always 0 when `reliable` is false. */
  available: number
  /** Share of `quota` in use. Only meaningful when `reliable`. */
  percentUsed: number
  persisted: boolean
  /** False when the browser exposes no Storage API, in which case nothing is known. */
  supported: boolean
  /**
   * True when the reported quota can be treated as a real ceiling. False for a
   * browser that clamps the figure — `usage` may still be honest there, but no
   * write may be refused on the strength of it.
   */
  reliable: boolean
}

export interface RoomCheck {
  ok: boolean
  needed: number
  available: number
  /** How many bytes short we are; 0 when the write fits. */
  shortfall: number
  /** False when quota could not be trusted — the caller should proceed. */
  measured: boolean
}

export class StorageFullError extends Error {
  readonly needed: number
  /**
   * Bytes the browser said were free, or null when the write itself was
   * rejected and no trustworthy figure exists.
   */
  readonly available: number | null

  constructor(needed: number, available: number | null) {
    super(
      available === null
        ? `Not enough storage: the browser rejected a ${formatBytes(needed)} write`
        : `Not enough storage: need ${formatBytes(needed)}, only ${formatBytes(available)} available`
    )
    this.name = "StorageFullError"
    this.needed = needed
    this.available = available
  }

  /** User-facing explanation for a toast body. */
  get detail(): string {
    return this.available === null
      ? `The browser rejected a ${formatBytes(this.needed)} write. Free up space and try again.`
      : `Needed ${formatBytes(this.needed)}, but only ${formatBytes(this.available)} available.`
  }

  /** Compact form for inline status rows, e.g. a download list. */
  get shortfallLabel(): string {
    return formatBytes(
      this.available === null ? this.needed : Math.max(0, this.needed - this.available)
    )
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${Number.parseFloat((bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1))} ${units[i]}`
}

/** True for the quota-exceeded DOMException across browsers and storage APIs. */
export function isQuotaExceededError(error: unknown): boolean {
  return (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error.code === 22 ||
      error.code === 1014)
  )
}

/**
 * Run a write, translating the browser's own quota rejection into a
 * `StorageFullError`.
 *
 * This is where a genuine refusal comes from. The pre-flight check below can
 * only ever be advisory, so a full store has to be discovered at the write —
 * which works identically whether or not the browser tells the truth about its
 * quota.
 */
export async function withQuotaRejection<T>(
  needed: number,
  write: () => Promise<T>
): Promise<T> {
  try {
    return await write()
  } catch (error) {
    if (isQuotaExceededError(error)) throw new StorageFullError(needed, null)
    throw error
  }
}

function storageManager(): StorageManager | null {
  if (typeof navigator === "undefined") return null
  return navigator.storage ?? null
}

/**
 * Can the reported quota be used as a ceiling?
 *
 * Two ways it cannot: the store already holds more than the stated maximum, so
 * the maximum is plainly not one; or the figure is the flat value privacy
 * browsers hand out in place of the truth.
 */
function isCredibleQuota(usage: number, quota: number): boolean {
  if (quota <= 0) return false
  if (usage >= quota) return false
  if (quota === CLAMPED_QUOTA_BYTES) return false
  return true
}

function safetyMargin(quota: number): number {
  return Math.min(SAFETY_MARGIN_BYTES, quota * SAFETY_MARGIN_SHARE)
}

export async function getQuotaStatus(): Promise<QuotaStatus> {
  const storage = storageManager()
  const unknown: QuotaStatus = {
    usage: 0,
    quota: 0,
    available: 0,
    percentUsed: 0,
    persisted: false,
    supported: false,
    reliable: false,
  }

  if (!storage?.estimate) return unknown

  try {
    const [estimate, persisted] = await Promise.all([
      storage.estimate(),
      storage.persisted ? storage.persisted() : Promise.resolve(false),
    ])

    const usage = estimate.usage ?? 0
    const quota = estimate.quota ?? 0
    const reliable = isCredibleQuota(usage, quota)

    return {
      usage,
      quota,
      available: reliable ? Math.max(0, quota - usage - safetyMargin(quota)) : 0,
      percentUsed: reliable ? usage / quota : 0,
      persisted,
      supported: true,
      reliable,
    }
  } catch (error) {
    console.error("Error reading storage quota:", error)
    return unknown
  }
}

/**
 * Can we take on `bytes` more?
 *
 * Advisory only, and deliberately biased towards yes: its job is to save the
 * user from paying for a several-hundred-megabyte download that cannot land,
 * not to gatekeep the library. Whenever the browser's numbers cannot be
 * trusted it answers yes and leaves the verdict to the write.
 */
export async function hasRoomFor(bytes: number): Promise<RoomCheck> {
  const status = await getQuotaStatus()

  if (!status.reliable) {
    return { ok: true, needed: bytes, available: 0, shortfall: 0, measured: false }
  }

  const shortfall = Math.max(0, bytes - status.available)
  return {
    ok: shortfall === 0,
    needed: bytes,
    available: status.available,
    shortfall,
    measured: true,
  }
}

/** Throwing variant for write paths that can refuse before doing the work. */
export async function assertRoomFor(bytes: number): Promise<void> {
  const room = await hasRoomFor(bytes)
  if (!room.ok) throw new StorageFullError(room.needed, room.available)
}

let persistenceRequest: Promise<boolean> | null = null

/**
 * Ask the browser to treat this origin's data as persistent.
 *
 * Without it the library sits in a "best-effort" bucket the browser may clear
 * on its own once the disk gets tight — no prompt, no notification, the whole
 * offline library simply gone on next launch. Installed PWAs are generally
 * granted this without a prompt.
 *
 * Memoised: the answer cannot change within a session, and repeat calls on
 * every mount would be pure noise.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  const storage = storageManager()
  if (!storage?.persist) return false

  if (!persistenceRequest) {
    persistenceRequest = (async () => {
      try {
        if (storage.persisted && (await storage.persisted())) return true
        return await storage.persist()
      } catch (error) {
        console.error("Error requesting persistent storage:", error)
        return false
      }
    })()
  }

  return persistenceRequest
}

/** Test seam — clears the memoised persistence request. */
export function resetPersistenceRequestForTests(): void {
  persistenceRequest = null
}
