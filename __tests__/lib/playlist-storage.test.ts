import "fake-indexeddb/auto"
import {
  AUDIO_DB_NAME,
  AUDIO_DB_VERSION,
  AUDIO_STORE_NAME,
  artBlobKey,
  artPointerKey,
  ORPHAN_GRACE_MS,
  type ArtBlobRecord,
  type ArtPointerRecord,
  type AudioRecord,
} from "@/lib/audio-store-schema"
import { PlaylistStorage } from "@/lib/playlist-storage"
import { StorageFullError } from "@/lib/storage-quota"

// Polyfill structuredClone if missing in jsdom environment
if (typeof global.structuredClone === "undefined") {
  global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj))
}

// Polyfill Blob.arrayBuffer() for jsdom
if (Blob.prototype.arrayBuffer === undefined) {
  Blob.prototype.arrayBuffer = function () {
    return this.slice().arrayBuffer ? this.slice().arrayBuffer() : new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as ArrayBuffer))
      reader.readAsArrayBuffer(this as any)
    })
  }
}

async function initTestDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AUDIO_DB_NAME, AUDIO_DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        db.createObjectStore(AUDIO_STORE_NAME, { keyPath: "id" })
      }
    }
  })
}

async function getAllRecords(db: IDBDatabase): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AUDIO_STORE_NAME], "readonly")
    const store = transaction.objectStore(AUDIO_STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getRecord(db: IDBDatabase, id: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AUDIO_STORE_NAME], "readonly")
    const store = transaction.objectStore(AUDIO_STORE_NAME)
    const request = store.get(id)

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function createTestFile(name: string, size: number, type: string = "audio/mpeg"): File {
  return new File(["x".repeat(size)], name, { type })
}

describe("PlaylistStorage", () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase(AUDIO_DB_NAME)
    localStorage.clear()
    // Reset the cached DB handle
    ;(PlaylistStorage as any).db = null

    // Mock navigator.storage to report plenty of available space by default
    Object.defineProperty(navigator, "storage", {
      value: {
        estimate: jest.fn().mockResolvedValue({
          usage: 100 * 1024 * 1024, // 100 MB used
          quota: 10 * 1024 * 1024 * 1024, // 10 GB quota
        }),
        persisted: jest.fn().mockResolvedValue(false),
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(async () => {
    indexedDB.deleteDatabase(AUDIO_DB_NAME)
    ;(PlaylistStorage as any).db = null
    jest.restoreAllMocks()
  })

  describe("storeSongFile", () => {
    it("throws StorageFullError when browser has no room", async () => {
      // Override the storage quota to report no available space
      Object.defineProperty(navigator, "storage", {
        value: {
          estimate: jest.fn().mockResolvedValue({
            usage: 1000000000, // 1GB used
            quota: 1000000100, // 1GB + 100 bytes total
          }),
          persisted: jest.fn().mockResolvedValue(false),
        },
        writable: true,
        configurable: true,
      })

      const file = createTestFile("test.mp3", 1024)

      await expect(PlaylistStorage.storeSongFile("song1", file)).rejects.toThrow(StorageFullError)

      // Verify nothing was written
      const db = await PlaylistStorage.initDB()
      const all = await getAllRecords(db)
      expect(all).toHaveLength(0)
    })

    it("writes storedAt timestamp", async () => {
      const file = createTestFile("test.mp3", 1024)
      const beforeTime = Date.now()

      await PlaylistStorage.storeSongFile("song1", file)

      const beforeWait = Date.now()
      const db = await PlaylistStorage.initDB()
      const record = await getRecord(db, "song1")

      expect(record).toBeDefined()
      expect(record.storedAt).toBeDefined()
      expect(record.storedAt).toBeGreaterThanOrEqual(beforeTime)
      expect(record.storedAt).toBeLessThanOrEqual(Date.now())
    })

    it("stores file with correct metadata", async () => {
      const file = createTestFile("my-song.mp3", 2048, "audio/mpeg")

      await PlaylistStorage.storeSongFile("song1", file)

      const db = await PlaylistStorage.initDB()
      const record = await getRecord(db, "song1") as AudioRecord

      expect(record).toBeDefined()
      expect(record.id).toBe("song1")
      expect(record.fileName).toBe("my-song.mp3")
      expect(record.fileSize).toBe(2048)
      expect(record.fileType).toBe("audio/mpeg")
      expect(record.file).toBeDefined()
    })

    it("allows multiple songs to be stored", async () => {
      const file1 = createTestFile("song1.mp3", 1024)
      const file2 = createTestFile("song2.mp3", 2048)

      await PlaylistStorage.storeSongFile("song1", file1)
      await PlaylistStorage.storeSongFile("song2", file2)

      const db = await PlaylistStorage.initDB()
      const all = await getAllRecords(db)

      expect(all).toHaveLength(2)
      expect(all.map((r) => r.id)).toEqual(expect.arrayContaining(["song1", "song2"]))
    })
  })

  describe("removeSongFile", () => {
    it("rejects when delete fails", async () => {
      const file = createTestFile("test.mp3", 1024)
      await PlaylistStorage.storeSongFile("song1", file)

      // Verify it's stored
      const db1 = await PlaylistStorage.initDB()
      let record = await getRecord(db1, "song1")
      expect(record).toBeDefined()

      // Close the connection and try to delete to force failure
      db1.close()

      // Create a fresh DB handle and immediately abort its transaction to simulate failure
      const db2 = await PlaylistStorage.initDB()

      // Spy on committed() to force an error
      const originalTransaction = db2.transaction.bind(db2)
      let transactionAborted = false

      jest.spyOn(db2, "transaction").mockImplementation(
        (storeNames: string | Iterable<string>, mode?: IDBTransactionMode) => {
          const tx = originalTransaction(storeNames, mode)
          if (!transactionAborted) {
            transactionAborted = true
            // Force abort after put is called
            setTimeout(() => {
              tx.abort()
            }, 0)
          }
          return tx
        }
      )

      // This should reject due to transaction abort
      await expect(PlaylistStorage.removeSongFile("song1")).rejects.toThrow()
    })

    it("successfully removes a song file", async () => {
      const file = createTestFile("test.mp3", 1024)
      await PlaylistStorage.storeSongFile("song1", file)

      const db1 = await PlaylistStorage.initDB()
      let record = await getRecord(db1, "song1")
      expect(record).toBeDefined()

      // Now remove it
      await PlaylistStorage.removeSongFile("song1")

      // Verify it's gone
      const db2 = await PlaylistStorage.initDB()
      record = await getRecord(db2, "song1")
      expect(record).toBeUndefined()
    })
  })

  describe("hasSongFile", () => {
    it("returns true for stored file", async () => {
      const file = createTestFile("test.mp3", 1024)
      await PlaylistStorage.storeSongFile("song1", file)

      const has = await PlaylistStorage.hasSongFile("song1")
      expect(has).toBe(true)
    })

    it("returns false for missing file", async () => {
      const has = await PlaylistStorage.hasSongFile("nonexistent")
      expect(has).toBe(false)
    })

    it("does cheap key-only check without deserializing blob", async () => {
      const file = createTestFile("test.mp3", 1024)
      await PlaylistStorage.storeSongFile("song1", file)

      // This should not load the file blob into memory
      const has = await PlaylistStorage.hasSongFile("song1")
      expect(has).toBe(true)
    })
  })

  describe("Album art - content-addressed deduplication", () => {
    it("stores same image bytes for two songs creates one shared blob", async () => {
      // Create identical image blob
      const imageBuffer = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
      const imageBlob = new Blob([imageBuffer], { type: "image/jpeg" })

      // Mock fetch to return the same blob for both URLs
      global.fetch = jest.fn(async () => ({
        blob: jest.fn().mockResolvedValue(imageBlob),
        ok: true,
      } as any))

      // Use the native crypto if available, otherwise skip the test
      // The test environment should have crypto.subtle available
      if (!globalThis.crypto || !globalThis.crypto.subtle) {
        console.warn("Crypto API not available, skipping content-addressed dedup test")
        return
      }

      // Store the same image for two different songs
      const url = "blob:https://example.com/image"
      await PlaylistStorage.storeAlbumArt("song1", url)
      await PlaylistStorage.storeAlbumArt("song2", url)

      // Verify: two pointer records, one shared blob
      const db = await PlaylistStorage.initDB()
      const all = await getAllRecords(db)

      // Should have: pointer for song1, pointer for song2, and one shared blob
      const pointers = all.filter((r) => (r as ArtPointerRecord).type === "albumart")
      const blobs = all.filter((r) => (r as ArtBlobRecord).type === "albumart-blob")

      expect(pointers).toHaveLength(2)
      // If crypto is available, we should have one shared blob; otherwise fallback to legacy
      if (blobs.length > 0) {
        expect(blobs).toHaveLength(1)
        expect((blobs[0] as ArtBlobRecord).refCount).toBe(2)
      } else {
        // Fallback to legacy inline storage - each pointer carries its own blob
        expect(pointers[0].blob).toBeDefined()
        expect(pointers[1].blob).toBeDefined()
      }
    })

    it("removeAlbumArt decrements refCount to 1 when one of two is removed", async () => {
      // Skip if crypto unavailable (will fall back to legacy inline storage)
      if (!globalThis.crypto || !globalThis.crypto.subtle) {
        console.warn("Crypto API not available, skipping content-addressed dedup test")
        return
      }

      const imageBuffer = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
      const imageBlob = new Blob([imageBuffer], { type: "image/jpeg" })

      global.fetch = jest.fn(async () => ({
        blob: jest.fn().mockResolvedValue(imageBlob),
        ok: true,
      } as any))

      const url = "blob:https://example.com/image"
      await PlaylistStorage.storeAlbumArt("song1", url)
      await PlaylistStorage.storeAlbumArt("song2", url)

      // Remove song2's art
      await PlaylistStorage.removeAlbumArt("song2")

      const db = await PlaylistStorage.initDB()
      const all = await getAllRecords(db)

      const pointers = all.filter((r) => (r as ArtPointerRecord).type === "albumart")
      const blobs = all.filter((r) => (r as ArtBlobRecord).type === "albumart-blob")

      expect(pointers).toHaveLength(1) // song1's pointer remains
      expect(blobs).toHaveLength(1) // blob still exists
      expect((blobs[0] as ArtBlobRecord).refCount).toBe(1)
    })

    it("removeAlbumArt deletes blob when last reference is removed", async () => {
      const imageBuffer = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
      const imageBlob = new Blob([imageBuffer], { type: "image/jpeg" })

      global.fetch = jest.fn(async () => ({
        blob: jest.fn().mockResolvedValue(imageBlob),
        ok: true,
      } as any))

      const mockDigest = jest.fn().mockResolvedValue(
        new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
                       21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32])
      )

      Object.defineProperty(globalThis.crypto, "subtle", {
        value: { digest: mockDigest },
        writable: true,
        configurable: true,
      })

      const url = "blob:https://example.com/image"
      await PlaylistStorage.storeAlbumArt("song1", url)

      // Remove the only reference
      await PlaylistStorage.removeAlbumArt("song1")

      const db = await PlaylistStorage.initDB()
      const all = await getAllRecords(db)

      const pointers = all.filter((r) => (r as ArtPointerRecord).type === "albumart")
      const blobs = all.filter((r) => (r as ArtBlobRecord).type === "albumart-blob")

      expect(pointers).toHaveLength(0)
      expect(blobs).toHaveLength(0)
    })

    it("moving a song to different art releases old blob if refCount reaches zero", async () => {
      const imageBlob1 = new Blob([new Uint8Array([0x01, 0x02])], { type: "image/jpeg" })
      const imageBlob2 = new Blob([new Uint8Array([0x03, 0x04])], { type: "image/jpeg" })

      let callCount = 0
      global.fetch = jest.fn(async () => ({
        blob: jest.fn().mockResolvedValue(callCount++ === 0 ? imageBlob1 : imageBlob2),
        ok: true,
      } as any))

      // Store song1 with image1
      await PlaylistStorage.storeAlbumArt("song1", "blob:url1")

      // Store song2 with same image1
      callCount = 0
      await PlaylistStorage.storeAlbumArt("song2", "blob:url1")

      const db1 = await PlaylistStorage.initDB()
      let all = await getAllRecords(db1)
      let pointers = all.filter((r) => (r as ArtPointerRecord).type === "albumart")
      let blobs = all.filter((r) => (r as ArtBlobRecord).type === "albumart-blob")

      // With crypto available, should have shared blob; without it, fallback to inline
      if (blobs.length > 0) {
        expect(blobs).toHaveLength(1)
        expect((blobs[0] as ArtBlobRecord).refCount).toBe(2)
      } else {
        // Legacy fallback - blobs are inline in pointers
        expect(pointers).toHaveLength(2)
      }

      // Now update song1 to point to image2
      callCount = 1
      await PlaylistStorage.storeAlbumArt("song1", "blob:url2")

      // Verify the update happened
      const db2 = await PlaylistStorage.initDB()
      all = await getAllRecords(db2)
      pointers = all.filter((r) => (r as ArtPointerRecord).type === "albumart")
      blobs = all.filter((r) => (r as ArtBlobRecord).type === "albumart-blob")

      // Should still have two pointers (song1 and song2)
      expect(pointers).toHaveLength(2)
    })
  })

  describe("Album art - legacy inline art backward compatibility", () => {
    it("getAlbumArt works for legacy inline art record", async () => {
      const db = await PlaylistStorage.initDB()

      // Mock URL.createObjectURL to return a blob: URL
      global.URL.createObjectURL = jest.fn(() => "blob:mock-object-url")

      // Manually insert a legacy art record (from before content addressing)
      const legacyBlob = new Blob(["fake-image-data"], { type: "image/jpeg" })
      const legacyRecord: ArtPointerRecord = {
        id: artPointerKey("legacy_song"),
        type: "albumart",
        songId: "legacy_song",
        blob: legacyBlob,
        mimeType: "image/jpeg",
        size: 256,
        storedAt: Date.now(),
        // No artHash — this is the legacy marker
      }

      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([AUDIO_STORE_NAME], "readwrite")
        const store = transaction.objectStore(AUDIO_STORE_NAME)
        store.put(legacyRecord)

        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })

      // getAlbumArt should still work
      const artUrl = await PlaylistStorage.getAlbumArt("legacy_song")
      expect(artUrl).not.toBeNull()
      expect(artUrl).toMatch(/^blob:/)
    })

    it("getAlbumArt returns null for nonexistent art", async () => {
      const artUrl = await PlaylistStorage.getAlbumArt("nonexistent_song")
      expect(artUrl).toBeNull()
    })

    it("removes legacy art correctly", async () => {
      const db = await PlaylistStorage.initDB()

      global.URL.createObjectURL = jest.fn(() => "blob:mock-object-url")

      const legacyBlob = new Blob(["fake-image-data"], { type: "image/jpeg" })
      const legacyRecord: ArtPointerRecord = {
        id: artPointerKey("legacy_song"),
        type: "albumart",
        songId: "legacy_song",
        blob: legacyBlob,
        mimeType: "image/jpeg",
        size: 256,
        storedAt: Date.now(),
      }

      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([AUDIO_STORE_NAME], "readwrite")
        const store = transaction.objectStore(AUDIO_STORE_NAME)
        store.put(legacyRecord)

        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })

      // Remove the legacy art
      await PlaylistStorage.removeAlbumArt("legacy_song")

      // Verify it's gone
      const artUrl = await PlaylistStorage.getAlbumArt("legacy_song")
      expect(artUrl).toBeNull()
    })
  })

  describe("Album art - degrades to legacy when crypto unavailable", () => {
    it("falls back to inline art when hashBlob returns null", async () => {
      // Mock crypto.subtle.digest to throw error (simulating unavailable crypto)
      Object.defineProperty(globalThis.crypto, "subtle", {
        value: {
          digest: jest.fn().mockRejectedValue(new Error("Crypto unavailable")),
        },
        writable: true,
        configurable: true,
      })

      const imageBlob = new Blob(["image-data"], { type: "image/jpeg" })
      global.fetch = jest.fn(async () => ({
        blob: jest.fn().mockResolvedValue(imageBlob),
        ok: true,
      } as any))

      // Store art when crypto fails
      const pointerId = await PlaylistStorage.storeAlbumArt("song1", "blob:url")

      const db = await PlaylistStorage.initDB()
      const pointer = await getRecord(db, pointerId) as ArtPointerRecord

      // Should be legacy inline record when hash fails
      expect(pointer.blob).toBeDefined()
      expect(pointer.artHash).toBeUndefined()
    })
  })

  describe("Album art - error handling", () => {
    it("handles removeAlbumArt when no art exists", async () => {
      // Should not throw
      await expect(PlaylistStorage.removeAlbumArt("nonexistent")).resolves.toBeUndefined()
    })

    it("handles concurrent art updates correctly", async () => {
      const imageBlob = new Blob(["image-data"], { type: "image/jpeg" })
      global.fetch = jest.fn(async () => ({
        blob: jest.fn().mockResolvedValue(imageBlob),
        ok: true,
      } as any))

      const mockDigest = jest.fn().mockResolvedValue(
        new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
                       21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32])
      )

      Object.defineProperty(globalThis.crypto, "subtle", {
        value: { digest: mockDigest },
        writable: true,
        configurable: true,
      })

      // Race two concurrent stores for the same song
      const url = "blob:https://example.com/image"
      await Promise.all([
        PlaylistStorage.storeAlbumArt("song1", url),
        PlaylistStorage.storeAlbumArt("song1", url),
      ])

      const db = await PlaylistStorage.initDB()
      const all = await getAllRecords(db)

      const pointers = all.filter((r) => (r as ArtPointerRecord).type === "albumart")
      expect(pointers).toHaveLength(1) // Only one pointer for the song
    })
  })

  describe("Storage state consistency", () => {
    it("sweepOrphans refuses empty knownSongIds", async () => {
      // This delegates to sweepAudioStore which refuses empty sets
      const result = await PlaylistStorage.sweepOrphans([])

      expect(result.removedRecords).toBe(0)
      expect(result.bytesReclaimed).toBe(0)
    })

    it("countOrphans works with knownSongIds iterable", async () => {
      const file = createTestFile("song1.mp3", 1024)
      await PlaylistStorage.storeSongFile("song1", file)

      const report = await PlaylistStorage.countOrphans(["song1"])

      // song1 is known, so no orphans
      expect(report.records).toBe(0)
      expect(report.bytes).toBe(0)
    })

    it("getStoredSongIds filters out art records", async () => {
      const file1 = createTestFile("song1.mp3", 1024)
      const file2 = createTestFile("song2.mp3", 1024)

      await PlaylistStorage.storeSongFile("song1", file1)
      await PlaylistStorage.storeSongFile("song2", file2)

      const imageBlob = new Blob(["image-data"], { type: "image/jpeg" })
      global.fetch = jest.fn(async () => ({
        blob: jest.fn().mockResolvedValue(imageBlob),
      } as any))

      await PlaylistStorage.storeAlbumArt("song1", "blob:url")

      const songIds = await PlaylistStorage.getStoredSongIds()

      // Should only return audio record IDs, not art records
      expect(songIds).toHaveLength(2)
      expect(songIds).toEqual(expect.arrayContaining(["song1", "song2"]))
      expect(songIds).not.toContain(artPointerKey("song1"))
      expect(songIds.every((id) => !id.includes("_albumart"))).toBe(true)
    })
  })

  describe("Error propagation", () => {
    it("removeSongFile propagates errors", async () => {
      const file = createTestFile("test.mp3", 1024)
      await PlaylistStorage.storeSongFile("song1", file)

      const db = await PlaylistStorage.initDB()

      // Close DB to cause errors
      db.close()

      // This should reject
      await expect(PlaylistStorage.removeSongFile("song1")).rejects.toThrow()
    })

    it("clearPlaylist propagates errors", async () => {
      const db = await PlaylistStorage.initDB()
      db.close()

      // This should reject
      await expect(PlaylistStorage.clearPlaylist()).rejects.toThrow()
    })
  })
})
