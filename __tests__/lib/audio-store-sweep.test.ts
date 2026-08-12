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
import { countOrphans, sweepAudioStore, type SweepResult } from "@/lib/audio-store-sweep"

// Polyfill structuredClone if missing in jsdom environment
if (typeof global.structuredClone === "undefined") {
  global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj))
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

function createAudioRecord(
  id: string,
  fileSize: number = 1024,
  storedAt?: number
): AudioRecord {
  const file = new File(["x".repeat(fileSize)], `${id}.mp3`, { type: "audio/mpeg" })
  return {
    id,
    file,
    fileName: `${id}.mp3`,
    fileSize,
    fileType: "audio/mpeg",
    lastModified: Date.now(),
    storedAt,
  }
}

function createArtPointerRecord(
  songId: string,
  artHash?: string,
  storedAt?: number
): ArtPointerRecord {
  const id = artPointerKey(songId)
  if (artHash) {
    return {
      id,
      type: "albumart",
      songId,
      artHash,
      mimeType: "image/jpeg",
      size: 512,
      storedAt,
    }
  }
  // Legacy inline art
  const blob = new Blob(["fake-image"], { type: "image/jpeg" })
  return {
    id,
    type: "albumart",
    songId,
    blob,
    mimeType: "image/jpeg",
    size: 512,
    storedAt,
  }
}

function createArtBlobRecord(hash: string, refCount: number = 1, storedAt?: number): ArtBlobRecord {
  const blob = new Blob(["fake-image"], { type: "image/jpeg" })
  return {
    id: artBlobKey(hash),
    type: "albumart-blob",
    blob,
    mimeType: "image/jpeg",
    size: 512,
    refCount,
    storedAt: storedAt ?? Date.now(),
  }
}

async function insertRecords(db: IDBDatabase, records: any[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AUDIO_STORE_NAME], "readwrite")
    const store = transaction.objectStore(AUDIO_STORE_NAME)

    for (const record of records) {
      store.put(record)
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
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

describe("sweepAudioStore & countOrphans", () => {
  let db: IDBDatabase

  beforeEach(async () => {
    indexedDB.deleteDatabase(AUDIO_DB_NAME)
    db = await initTestDB()
  })

  afterEach(() => {
    db.close()
    indexedDB.deleteDatabase(AUDIO_DB_NAME)
  })

  describe("sweepAudioStore - refusal on empty knownSongIds", () => {
    it("refuses to sweep when knownSongIds is empty, even with orphaned records", async () => {
      // Insert orphaned records
      const oldNow = Date.now() - ORPHAN_GRACE_MS - 1000
      const orphanedAudio = createAudioRecord("orphan1", 1024, oldNow)
      const orphanedArt = createArtPointerRecord("orphan1", "hash1", oldNow)
      const orphanedBlob = createArtBlobRecord("hash1", 1, oldNow)

      await insertRecords(db, [orphanedAudio, orphanedArt, orphanedBlob])

      // Sweep with empty set
      const result = await sweepAudioStore(db, new Set())

      // Nothing was deleted
      expect(result.removedRecords).toBe(0)
      expect(result.bytesReclaimed).toBe(0)

      // Records still exist
      const all = await getAllRecords(db)
      expect(all).toHaveLength(3)
    })

    it("countOrphans also refuses on empty set", async () => {
      const oldNow = Date.now() - ORPHAN_GRACE_MS - 1000
      const orphanedAudio = createAudioRecord("orphan1", 1024, oldNow)
      await insertRecords(db, [orphanedAudio])

      const report = await countOrphans(db, new Set())

      expect(report.records).toBe(0)
      expect(report.bytes).toBe(0)
    })
  })

  describe("sweepAudioStore - audio records", () => {
    it("deletes audio records not in knownSongIds", async () => {
      const baseNow = Date.now()
      const oldNow = baseNow - ORPHAN_GRACE_MS - 1000
      const known = createAudioRecord("song1", 2048, baseNow)
      const orphan = createAudioRecord("orphan", 1024, oldNow)

      await insertRecords(db, [known, orphan])

      const result = await sweepAudioStore(db, new Set(["song1"]), baseNow + 100)

      expect(result.removedRecords).toBe(1)
      expect(result.bytesReclaimed).toBe(1024)

      const remaining = await getAllRecords(db)
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).toBe("song1")
    })

    it("keeps audio records in knownSongIds", async () => {
      const baseNow = Date.now()
      const oldNow = baseNow - ORPHAN_GRACE_MS - 1000
      const kept1 = createAudioRecord("song1", 2048, oldNow)
      const kept2 = createAudioRecord("song2", 3072, oldNow)

      await insertRecords(db, [kept1, kept2])

      const result = await sweepAudioStore(db, new Set(["song1", "song2"]), baseNow)

      expect(result.removedRecords).toBe(0)
      expect(result.bytesReclaimed).toBe(0)

      const all = await getAllRecords(db)
      expect(all).toHaveLength(2)
    })

    it("skips recent orphans within grace period", async () => {
      const baseNow = Date.now()
      const recentNow = baseNow - ORPHAN_GRACE_MS / 2
      const knownSong = createAudioRecord("known", 512, baseNow)
      const recent = createAudioRecord("recent", 1024, recentNow)
      const oldOrphan = createAudioRecord("old", 1024, baseNow - ORPHAN_GRACE_MS - 1000)

      await insertRecords(db, [knownSong, recent, oldOrphan])

      const result = await sweepAudioStore(db, new Set(["known"]), baseNow)

      expect(result.skippedRecent).toBe(1)
      expect(result.removedRecords).toBe(1) // Only the old one is deleted
      expect(result.bytesReclaimed).toBe(1024)

      const remaining = await getAllRecords(db)
      expect(remaining).toHaveLength(2) // known and recent
      expect(remaining.some((r) => r.id === "recent")).toBe(true)
    })

    it("reports zero for empty store", async () => {
      const result = await sweepAudioStore(db, new Set(["song1"]))

      expect(result.removedRecords).toBe(0)
      expect(result.bytesReclaimed).toBe(0)
      expect(result.skippedRecent).toBe(0)
    })
  })

  describe("sweepAudioStore - shared album art", () => {
    it("deletes orphaned art pointer and shared blob at zero references", async () => {
      const baseNow = Date.now()
      const oldNow = baseNow - ORPHAN_GRACE_MS - 1000
      const hash1 = "abc123"
      const knownSong = createAudioRecord("known", 512, baseNow)
      const pointer = createArtPointerRecord("orphan", hash1, oldNow)
      const blob = createArtBlobRecord(hash1, 1, oldNow)

      await insertRecords(db, [knownSong, pointer, blob])

      const result = await sweepAudioStore(db, new Set(["known"]), baseNow)

      expect(result.removedRecords).toBe(2) // pointer + blob
      // Pointer with artHash counts 0 bytes, blob counts 512 bytes
      expect(result.bytesReclaimed).toBe(512) // blob size only
    })

    it("keeps shared blob alive while referenced", async () => {
      const baseNow = Date.now()
      const oldNow = baseNow - ORPHAN_GRACE_MS - 1000
      const hash1 = "abc123"
      const song1 = createAudioRecord("song1", 1024, baseNow)
      const song2 = createAudioRecord("song2", 1024, baseNow)
      const pointer1 = createArtPointerRecord("song1", hash1, baseNow)
      const pointer2 = createArtPointerRecord("song2", hash1, baseNow)
      const blob = createArtBlobRecord(hash1, 2, oldNow)

      // Orphan song2 and its pointer
      const orphanPointer2 = createArtPointerRecord("song2", hash1, oldNow)

      await insertRecords(db, [song1, song2, pointer1, orphanPointer2, blob])

      const result = await sweepAudioStore(db, new Set(["song1"]), baseNow)

      // Orphan pointer is deleted, but blob survives because song1 still points to it
      expect(result.removedRecords).toBe(1) // only orphan pointer2
      // Pointer with artHash counts 0 bytes
      expect(result.bytesReclaimed).toBe(0) // pointer doesn't count bytes (shared blob counted separately)

      const blobRecord = await getRecord(db, artBlobKey(hash1))
      expect(blobRecord).not.toBeUndefined()
      expect(blobRecord.refCount).toBe(1) // still referenced by song1
    })

    it("deletes shared blob when all pointers are orphaned", async () => {
      const baseNow = Date.now()
      const oldNow = baseNow - ORPHAN_GRACE_MS - 1000
      const hash1 = "abc123"
      const knownSong = createAudioRecord("known", 512, baseNow)
      const pointer1 = createArtPointerRecord("song1", hash1, oldNow)
      const pointer2 = createArtPointerRecord("song2", hash1, oldNow)
      const blob = createArtBlobRecord(hash1, 2, oldNow)

      await insertRecords(db, [knownSong, pointer1, pointer2, blob])

      const result = await sweepAudioStore(db, new Set(["known"]), baseNow)

      // Both pointers and blob deleted
      expect(result.removedRecords).toBe(3)

      const all = await getAllRecords(db)
      expect(all).toHaveLength(1) // Only the known song remains
    })

    it("repairs drifted refCount on shared blob", async () => {
      const baseNow = Date.now()
      const oldNow = baseNow - ORPHAN_GRACE_MS - 1000
      const hash1 = "abc123"
      const pointer1 = createArtPointerRecord("song1", hash1, baseNow)
      const blob = createArtBlobRecord(hash1, 5, oldNow) // refCount is 5 but only 1 pointer

      await insertRecords(db, [pointer1, blob])

      const result = await sweepAudioStore(db, new Set(["song1"]), baseNow)

      expect(result.repairedRefCounts).toBe(1)

      const blobRecord = await getRecord(db, artBlobKey(hash1))
      expect(blobRecord.refCount).toBe(1)
    })

    it("skips shared blobs written recently even if orphaned", async () => {
      const baseNow = Date.now()
      const recentNow = baseNow - ORPHAN_GRACE_MS / 2
      const hash1 = "abc123"
      const knownSong = createAudioRecord("known", 512, baseNow)
      const pointer = createArtPointerRecord("orphan", hash1, recentNow)
      const blob = createArtBlobRecord(hash1, 1, recentNow)

      await insertRecords(db, [knownSong, pointer, blob])

      const result = await sweepAudioStore(db, new Set(["known"]), baseNow)

      // Pointer is skipped as recent orphan. Blob survives because pointer references it (even though skipped),
      // so blob is not considered orphaned.
      expect(result.skippedRecent).toBe(1) // pointer only
      expect(result.removedRecords).toBe(0)
    })

    it("handles album art with multiple songs pointing to same blob", async () => {
      const baseNow = Date.now()
      const oldNow = baseNow - ORPHAN_GRACE_MS - 1000
      const hash1 = "abc123"
      const song1 = createAudioRecord("song1", 1024, baseNow)
      const song2 = createAudioRecord("song2", 1024, baseNow)
      const song3 = createAudioRecord("song3", 1024, baseNow)

      const pointer1 = createArtPointerRecord("song1", hash1, baseNow)
      const pointer2 = createArtPointerRecord("song2", hash1, baseNow)
      const pointer3 = createArtPointerRecord("song3", hash1, oldNow) // orphaned

      const blob = createArtBlobRecord(hash1, 3, oldNow)

      await insertRecords(db, [song1, song2, song3, pointer1, pointer2, pointer3, blob])

      const result = await sweepAudioStore(db, new Set(["song1", "song2"]), baseNow)

      // Only orphan pointer3 is deleted
      expect(result.removedRecords).toBe(1)
      expect(result.repairedRefCounts).toBe(1)

      const blobRecord = await getRecord(db, artBlobKey(hash1))
      expect(blobRecord.refCount).toBe(2)
    })
  })

  describe("sweepAudioStore - legacy inline art", () => {
    it("deletes legacy art record and counts its size", async () => {
      const baseNow = Date.now()
      const oldNow = baseNow - ORPHAN_GRACE_MS - 1000
      // Need to provide at least one known song for the sweep to run
      const knownSong = createAudioRecord("known", 512, baseNow)
      const legacyPointer = createArtPointerRecord("orphan", undefined, oldNow) // no artHash = legacy

      await insertRecords(db, [knownSong, legacyPointer])

      const result = await sweepAudioStore(db, new Set(["known"]), baseNow)

      expect(result.removedRecords).toBe(1)
      expect(result.bytesReclaimed).toBe(512) // the inline blob size
    })

    it("content-addressed pointers don't count bytes when deleted (blob counted separately)", async () => {
      const baseNow = Date.now()
      const oldNow = baseNow - ORPHAN_GRACE_MS - 1000
      const hash1 = "abc123"
      const knownSong = createAudioRecord("known", 512, baseNow)
      const pointer = createArtPointerRecord("orphan", hash1, oldNow)
      const blob = createArtBlobRecord(hash1, 1, oldNow)

      await insertRecords(db, [knownSong, pointer, blob])

      const result = await sweepAudioStore(db, new Set(["known"]), baseNow)

      // pointer counts 0 bytes (shared), blob counts 512
      expect(result.bytesReclaimed).toBe(512)
    })
  })

  describe("countOrphans", () => {
    it("reports same records/bytes as sweep without deleting", async () => {
      const baseNow = Date.now()
      const oldNow = baseNow - ORPHAN_GRACE_MS - 1000
      const song1 = createAudioRecord("song1", 2048, baseNow)
      const orphan1 = createAudioRecord("orphan1", 1024, oldNow)
      const orphan2 = createAudioRecord("orphan2", 512, oldNow)

      await insertRecords(db, [song1, orphan1, orphan2])

      const countBefore = await getAllRecords(db)
      const report = await countOrphans(db, new Set(["song1"]), baseNow)

      expect(report.records).toBe(2)
      expect(report.bytes).toBe(1536)

      // Verify nothing was deleted
      const countAfter = await getAllRecords(db)
      expect(countAfter).toHaveLength(countBefore.length)
    })

    it("counts with art records", async () => {
      const baseNow = Date.now()
      const oldNow = baseNow - ORPHAN_GRACE_MS - 1000
      const hash1 = "abc123"
      const knownSong = createAudioRecord("known", 512, baseNow)
      const pointer = createArtPointerRecord("orphan", hash1, oldNow)
      const blob = createArtBlobRecord(hash1, 1, oldNow)

      await insertRecords(db, [knownSong, pointer, blob])

      const report = await countOrphans(db, new Set(["known"]), baseNow)

      expect(report.records).toBe(2)
      // Pointer with artHash counts 0 bytes, blob counts 512
      expect(report.bytes).toBe(512) // 0 (pointer) + 512 (blob)
    })

    it("countOrphans returns 0/0 on empty knownSongIds", async () => {
      const baseNow = Date.now()
      const oldNow = baseNow - ORPHAN_GRACE_MS - 1000
      const orphan = createAudioRecord("orphan", 1024, oldNow)
      await insertRecords(db, [orphan])

      const report = await countOrphans(db, new Set(), baseNow)

      expect(report.records).toBe(0)
      expect(report.bytes).toBe(0)
    })
  })

  describe("sweep with explicit now parameter", () => {
    it("uses provided now timestamp for grace period check", async () => {
      const baseTime = Date.now()
      const withinGrace = baseTime - ORPHAN_GRACE_MS + 10000 // within grace
      const beyondGrace = baseTime - ORPHAN_GRACE_MS - 10000 // beyond grace

      const knownSong = createAudioRecord("known", 512, baseTime)
      const recent = createAudioRecord("recent", 1024, withinGrace)
      const old = createAudioRecord("old", 1024, beyondGrace)

      await insertRecords(db, [knownSong, recent, old])

      const result = await sweepAudioStore(db, new Set(["known"]), baseTime)

      expect(result.removedRecords).toBe(1) // only old
      expect(result.skippedRecent).toBe(1) // recent
    })
  })

  describe("edge cases", () => {
    it("handles records with missing fileSize", async () => {
      const baseNow = Date.now()
      const oldNow = baseNow - ORPHAN_GRACE_MS - 1000
      const knownSong = createAudioRecord("known", 512, baseNow)
      const record: AudioRecord = {
        id: "orphan",
        file: new File(["x"], "test.mp3", { type: "audio/mpeg" }),
        fileName: "test.mp3",
        fileSize: 1024,
        fileType: "audio/mpeg",
        lastModified: Date.now(),
        storedAt: oldNow,
      }
      delete (record as any).fileSize

      await insertRecords(db, [knownSong, record])

      const result = await sweepAudioStore(db, new Set(["known"]), baseNow)

      expect(result.removedRecords).toBe(1)
      // Should use file.size or 0 as fallback
      expect(result.bytesReclaimed).toBeGreaterThanOrEqual(0)
    })

    it("handles mixed record types in single sweep", async () => {
      const baseNow = Date.now()
      const oldNow = baseNow - ORPHAN_GRACE_MS - 1000
      const hash1 = "hash1"

      const audio1 = createAudioRecord("song1", 2048, baseNow)
      const audio2 = createAudioRecord("orphan_audio", 1024, oldNow)
      const pointer1 = createArtPointerRecord("song1", hash1, baseNow)
      const pointer2 = createArtPointerRecord("orphan_art", hash1, oldNow)
      const blob = createArtBlobRecord(hash1, 2, oldNow)

      await insertRecords(db, [audio1, audio2, pointer1, pointer2, blob])

      const result = await sweepAudioStore(db, new Set(["song1"]), baseNow)

      // audio2 and pointer2 are deleted, blob is repaired (not deleted because pointer1 still references it)
      // Content-addressed pointers (with artHash) don't count bytes — only the blob counts
      expect(result.removedRecords).toBe(2) // audio2, pointer2
      expect(result.bytesReclaimed).toBe(1024) // only audio2 bytes (pointer2 has artHash so counts 0)
      expect(result.repairedRefCounts).toBe(1) // blob refCount repaired from 2 to 1
    })
  })
})
