/**
 * Browser storage quota + persistence helpers.
 *
 * The audio store deliberately has no app-invented size cap: a music library is
 * allowed to be as large as the user's disk permits. What it does have is an
 * honest relationship with the *real* ceiling the browser hands out — check
 * before writing, warn before it hurts, and refuse loudly rather than failing
 * after a multi-hundred-megabyte download has already been paid for.
 */

/**
 * Never let the origin run itself to a hard zero. Wedging the quota makes even
 * metadata writes fail, which is a far worse state than refusing one download.
 */
const SAFETY_MARGIN_BYTES = 250 * 1024 * 1024

/** Surface a warning in the storage UI once usage crosses this share of quota. */
export const STORAGE_WARN_THRESHOLD = 0.8

export interface QuotaStatus {
  usage: number
  quota: number
  /** Bytes we are willing to hand out, i.e. free space less the safety margin. */
  available: number
  percentUsed: number
  persisted: boolean
  /** False when the browser exposes no Storage API, in which case the numbers are unknown. */
  supported: boolean
}

export interface RoomCheck {
  ok: boolean
  needed: number
  available: number
  /** How many bytes short we are; 0 when the write fits. */
  shortfall: number
  /** False when quota could not be determined — the caller should proceed. */
  measured: boolean
}

export class StorageFullError extends Error {
  readonly needed: number
  readonly available: number

  constructor(needed: number, available: number) {
    super(
      `Not enough storage: need ${formatBytes(needed)}, only ${formatBytes(available)} available`
    )
    this.name = "StorageFullError"
    this.needed = needed
    this.available = available
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${Number.parseFloat((bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1))} ${units[i]}`
}

function storageManager(): StorageManager | null {
  if (typeof navigator === "undefined") return null
  return navigator.storage ?? null
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
  }

  if (!storage?.estimate) return unknown

  try {
    const [estimate, persisted] = await Promise.all([
      storage.estimate(),
      storage.persisted ? storage.persisted() : Promise.resolve(false),
    ])

    const usage = estimate.usage ?? 0
    const quota = estimate.quota ?? 0
    if (quota <= 0) return { ...unknown, usage, persisted }

    return {
      usage,
      quota,
      available: Math.max(0, quota - usage - SAFETY_MARGIN_BYTES),
      percentUsed: usage / quota,
      persisted,
      supported: true,
    }
  } catch (error) {
    console.error("Error reading storage quota:", error)
    return unknown
  }
}

/**
 * Can we take on `bytes` more? When the browser exposes no quota we say yes —
 * refusing on missing information would break otherwise-working browsers.
 */
export async function hasRoomFor(bytes: number): Promise<RoomCheck> {
  const status = await getQuotaStatus()

  if (!status.supported) {
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

/** Throwing variant for write paths that must not proceed without room. */
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
