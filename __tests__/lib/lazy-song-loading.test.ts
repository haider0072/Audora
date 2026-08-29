import "fake-indexeddb/auto"
import {
  AUDIO_DB_NAME,
  AUDIO_DB_VERSION,
  AUDIO_STORE_NAME,
} from "@/lib/audio-store-schema"
import { PlaylistStorage } from "@/lib/playlist-storage"

// Polyfill structuredClone if missing in jsdom environment
if (typeof global.structuredClone === "undefined") {
  global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj))
}

async function initTestDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AUDIO_DB_NAME, AUDIO_DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        db.createObjectStore(AUDIO_STORE_NAME, { keyPath: "id" })
      }
    }
  })
}

/**
 * Write an audio record straight to the store. The record carries no File:
 * that is the point — validation must answer from the flat columns alone, and
 * fake-indexeddb cannot clone a File anyway.
 */
async function putRecord(
  db: IDBDatabase,
  record: { id: string; fileName: string; fileSize: number }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AUDIO_STORE_NAME], "readwrite")
    transaction.objectStore(AUDIO_STORE_NAME).put({
      fileType: "audio/flac",
      lastModified: 0,
      storedAt: 0,
      ...record,
    })
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

async function wipe(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AUDIO_STORE_NAME], "readwrite")
    transaction.objectStore(AUDIO_STORE_NAME).clear()
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

/** The playlist-metadata shape a song has once its File is no longer held. */
const storedSong = (id: string, fileName: string, fileSize: number) =>
  ({ id, fileName, fileSize, fileLastModified: 0, fileType: "audio/flac" }) as never

describe("validateStoredFiles without in-memory Files", () => {
  let db: IDBDatabase

  beforeAll(async () => {
    db = await initTestDB()
  })

  beforeEach(async () => {
    await wipe(db)
  })

  it("accepts a song whose stored identity matches, without reading its blob", async () => {
    await putRecord(db, { id: "a.flac-5000-0", fileName: "a.flac", fileSize: 5000 })

    const valid = await PlaylistStorage.validateStoredFiles([
      storedSong("a.flac-5000-0", "a.flac", 5000),
    ])

    expect(valid).toHaveLength(1)
  })

  it("drops a song whose stored size disagrees with its metadata", async () => {
    await putRecord(db, { id: "b.flac-9-0", fileName: "b.flac", fileSize: 9 })

    const valid = await PlaylistStorage.validateStoredFiles([
      storedSong("b.flac-9-0", "b.flac", 4242),
    ])

    expect(valid).toHaveLength(0)
  })

  it("drops a song with no record at all", async () => {
    const valid = await PlaylistStorage.validateStoredFiles([
      storedSong("missing-1-0", "missing.flac", 1),
    ])

    expect(valid).toHaveLength(0)
  })

  it("keeps only the matching songs out of a mixed library", async () => {
    await putRecord(db, { id: "keep-10-0", fileName: "keep.flac", fileSize: 10 })
    await putRecord(db, { id: "stale-10-0", fileName: "stale.flac", fileSize: 10 })

    const valid = await PlaylistStorage.validateStoredFiles([
      storedSong("keep-10-0", "keep.flac", 10),
      storedSong("stale-10-0", "stale.flac", 99),
      storedSong("absent-10-0", "absent.flac", 10),
    ])

    expect(valid.map((song) => song.id)).toEqual(["keep-10-0"])
  })

  it("survives a library larger than one batch", async () => {
    const songs: never[] = []
    for (let i = 0; i < 50; i++) {
      await putRecord(db, { id: `t${i}-100-0`, fileName: `t${i}.flac`, fileSize: 100 })
      songs.push(storedSong(`t${i}-100-0`, `t${i}.flac`, 100))
    }

    const valid = await PlaylistStorage.validateStoredFiles(songs)
    expect(valid).toHaveLength(50)
  })
})
