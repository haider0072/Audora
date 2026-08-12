import {
  StorageFullError,
  assertRoomFor,
  getQuotaStatus,
  hasRoomFor,
  isQuotaExceededError,
  requestPersistentStorage,
  resetPersistenceRequestForTests,
  withQuotaRejection,
} from "@/lib/storage-quota"

const GB = 1024 * 1024 * 1024
const MB = 1024 * 1024

/** The flat figure Brave and Firefox report in place of the real quota. */
const CLAMPED_QUOTA = 2 * GB

function mockStorage(value: unknown): void {
  Object.defineProperty(navigator, "storage", {
    value,
    writable: true,
    configurable: true,
  })
}

function mockEstimate(estimate: { usage?: number; quota?: number }, persisted = false): void {
  mockStorage({
    estimate: jest.fn().mockResolvedValue(estimate),
    persisted: jest.fn().mockResolvedValue(persisted),
  })
}

describe("storage-quota", () => {
  beforeEach(() => {
    resetPersistenceRequestForTests()
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe("getQuotaStatus", () => {
    it("reports nothing when the Storage API is absent", async () => {
      mockStorage(undefined)

      const status = await getQuotaStatus()

      expect(status.supported).toBe(false)
      expect(status.reliable).toBe(false)
      expect(status.available).toBe(0)
    })

    it("reports nothing when estimate() is missing", async () => {
      mockStorage({ persisted: jest.fn().mockResolvedValue(true) })

      const status = await getQuotaStatus()

      expect(status.supported).toBe(false)
      expect(status.reliable).toBe(false)
    })

    it("trusts a self-consistent quota", async () => {
      mockEstimate({ usage: 10 * GB, quota: 100 * GB }, true)

      const status = await getQuotaStatus()

      expect(status.supported).toBe(true)
      expect(status.reliable).toBe(true)
      expect(status.usage).toBe(10 * GB)
      expect(status.quota).toBe(100 * GB)
      expect(status.percentUsed).toBeCloseTo(0.1)
      expect(status.persisted).toBe(true)
    })

    it("holds back a flat 250 MB margin on a large quota", async () => {
      mockEstimate({ usage: 10 * GB, quota: 100 * GB })

      const status = await getQuotaStatus()

      expect(status.available).toBe(90 * GB - 250 * MB)
    })

    it("caps the margin at 2% of a small quota", async () => {
      mockEstimate({ usage: 0, quota: 1 * GB })

      const status = await getQuotaStatus()

      // A flat 250 MB would be a quarter of this quota.
      expect(status.available).toBe(1 * GB - 0.02 * GB)
    })

    it("distrusts the flat 2 GiB that privacy browsers substitute", async () => {
      mockEstimate({ usage: 500 * MB, quota: CLAMPED_QUOTA })

      const status = await getQuotaStatus()

      expect(status.supported).toBe(true)
      expect(status.reliable).toBe(false)
      expect(status.available).toBe(0)
      expect(status.percentUsed).toBe(0)
      // Usage is still honest and worth showing.
      expect(status.usage).toBe(500 * MB)
    })

    it("distrusts a quota the store has already exceeded", async () => {
      // Brave against a 29 GB library: real usage, clamped ceiling.
      mockEstimate({ usage: 29 * GB, quota: CLAMPED_QUOTA })

      const status = await getQuotaStatus()

      expect(status.reliable).toBe(false)
      expect(status.available).toBe(0)
    })

    it("distrusts a zero quota but keeps the usage figure", async () => {
      mockEstimate({ usage: 5 * GB, quota: 0 })

      const status = await getQuotaStatus()

      expect(status.supported).toBe(true)
      expect(status.reliable).toBe(false)
      expect(status.usage).toBe(5 * GB)
    })

    it("survives estimate() rejecting", async () => {
      mockStorage({
        estimate: jest.fn().mockRejectedValue(new Error("nope")),
        persisted: jest.fn().mockResolvedValue(false),
      })

      const status = await getQuotaStatus()

      expect(status.supported).toBe(false)
      expect(status.reliable).toBe(false)
    })
  })

  describe("hasRoomFor", () => {
    it("accepts a write that fits under a trustworthy quota", async () => {
      mockEstimate({ usage: 10 * GB, quota: 100 * GB })

      const room = await hasRoomFor(50 * MB)

      expect(room.ok).toBe(true)
      expect(room.measured).toBe(true)
      expect(room.shortfall).toBe(0)
    })

    it("refuses a write that does not fit under a trustworthy quota", async () => {
      mockEstimate({ usage: 99 * GB, quota: 100 * GB })

      const room = await hasRoomFor(2 * GB)

      expect(room.ok).toBe(false)
      expect(room.measured).toBe(true)
      expect(room.shortfall).toBeGreaterThan(0)
    })

    it("does not refuse against a clamped quota", async () => {
      // The regression: a 26 MB import blocked forever on a machine with 100 GB free.
      mockEstimate({ usage: 29 * GB, quota: CLAMPED_QUOTA })

      const room = await hasRoomFor(26 * MB)

      expect(room.ok).toBe(true)
      expect(room.measured).toBe(false)
    })

    it("does not refuse when the browser reports nothing", async () => {
      mockStorage(undefined)

      const room = await hasRoomFor(26 * MB)

      expect(room.ok).toBe(true)
      expect(room.measured).toBe(false)
    })
  })

  describe("assertRoomFor", () => {
    it("throws with the measured shortfall when the quota is trustworthy", async () => {
      mockEstimate({ usage: 99 * GB, quota: 100 * GB })

      await expect(assertRoomFor(2 * GB)).rejects.toThrow(StorageFullError)
    })

    it("stays quiet against a clamped quota", async () => {
      mockEstimate({ usage: 29 * GB, quota: CLAMPED_QUOTA })

      await expect(assertRoomFor(26 * MB)).resolves.toBeUndefined()
    })
  })

  describe("StorageFullError", () => {
    it("describes a pre-flight refusal with both figures", () => {
      const error = new StorageFullError(100 * MB, 40 * MB)

      expect(error.detail).toBe("Needed 100 MB, but only 40 MB available.")
      expect(error.shortfallLabel).toBe("60 MB")
    })

    it("describes a write rejection without inventing an available figure", () => {
      const error = new StorageFullError(100 * MB, null)

      expect(error.available).toBeNull()
      expect(error.detail).toContain("browser rejected a 100 MB write")
      expect(error.detail).not.toContain("available")
      expect(error.shortfallLabel).toBe("100 MB")
    })

    it("never reports a negative shortfall", () => {
      const error = new StorageFullError(10 * MB, 40 * MB)

      expect(error.shortfallLabel).toBe("0 B")
    })
  })

  describe("isQuotaExceededError", () => {
    it("recognises the standard DOMException", () => {
      expect(isQuotaExceededError(new DOMException("full", "QuotaExceededError"))).toBe(true)
    })

    it("recognises the Firefox name", () => {
      expect(isQuotaExceededError(new DOMException("full", "NS_ERROR_DOM_QUOTA_REACHED"))).toBe(
        true
      )
    })

    it("ignores unrelated failures", () => {
      expect(isQuotaExceededError(new DOMException("gone", "NotFoundError"))).toBe(false)
      expect(isQuotaExceededError(new Error("QuotaExceededError"))).toBe(false)
      expect(isQuotaExceededError(null)).toBe(false)
    })
  })

  describe("withQuotaRejection", () => {
    it("passes the result through", async () => {
      await expect(withQuotaRejection(1, async () => "written")).resolves.toBe("written")
    })

    it("translates the browser's quota rejection", async () => {
      const write = async () => {
        throw new DOMException("full", "QuotaExceededError")
      }

      await expect(withQuotaRejection(26 * MB, write)).rejects.toMatchObject({
        name: "StorageFullError",
        needed: 26 * MB,
        available: null,
      })
    })

    it("translates a rejection thrown synchronously", async () => {
      const write = () => {
        throw new DOMException("full", "QuotaExceededError")
      }

      await expect(withQuotaRejection(26 * MB, write as () => Promise<void>)).rejects.toThrow(
        StorageFullError
      )
    })

    it("leaves unrelated failures alone", async () => {
      const write = async () => {
        throw new Error("transaction aborted")
      }

      await expect(withQuotaRejection(1, write)).rejects.toThrow("transaction aborted")
    })
  })

  describe("requestPersistentStorage", () => {
    it("returns false when the browser cannot persist", async () => {
      mockStorage({ estimate: jest.fn() })

      await expect(requestPersistentStorage()).resolves.toBe(false)
    })

    it("does not re-ask once already persisted", async () => {
      const persist = jest.fn().mockResolvedValue(true)
      mockStorage({ persisted: jest.fn().mockResolvedValue(true), persist })

      await expect(requestPersistentStorage()).resolves.toBe(true)
      expect(persist).not.toHaveBeenCalled()
    })

    it("asks once per session and memoises the answer", async () => {
      const persist = jest.fn().mockResolvedValue(true)
      mockStorage({ persisted: jest.fn().mockResolvedValue(false), persist })

      await Promise.all([requestPersistentStorage(), requestPersistentStorage()])
      await requestPersistentStorage()

      expect(persist).toHaveBeenCalledTimes(1)
    })

    it("reports false when the request throws", async () => {
      mockStorage({
        persisted: jest.fn().mockResolvedValue(false),
        persist: jest.fn().mockRejectedValue(new Error("denied")),
      })

      await expect(requestPersistentStorage()).resolves.toBe(false)
    })
  })
})
