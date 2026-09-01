import {
  artBlobKey,
  artPointerKey,
  AUDIO_DB_NAME,
  AUDIO_DB_VERSION,
  AUDIO_STORE_NAME,
  isArtBlob,
  isArtBlobKey,
  isArtPointer,
  isArtPointerKey,
  isLegacyArt,
  songIdFromArtPointerKey,
  type ArtBlobRecord,
  type ArtPointerRecord,
  type AudioRecord,
  type AudioStoreRecord,
} from "./audio-store-schema"
import {
  countOrphans as countStoreOrphans,
  sweepAudioStore,
  type OrphanReport,
  type SweepResult,
} from "./audio-store-sweep"
import {
  assertRoomFor,
  getQuotaStatus,
  withQuotaRejection,
  type QuotaStatus,
} from "./storage-quota"

interface StoredSong {
  id: string
  title?: string
  artist?: string
  artists?: string[]
  album?: string
  year?: string
  genre?: string
  bitrate?: number
  sampleRate?: number
  duration?: number
  isHiRes?: boolean
  albumArt?: string
  fileSize?: number
  format?: string
  fileName: string
  fileLastModified: number
  fileType: string
}

interface PlaylistData {
  songs: StoredSong[]
  currentSongId?: string
  lastUpdated: number
  version: string
}

export interface StorageInfo {
  /** Bytes this library occupies, measured by walking the store. */
  used: number
  songs: number
  albumArtCount: number
  albumArtSize: number
  /** What the browser says about the origin's ceiling — trustworthy or not. */
  quota: QuotaStatus
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Resolve only once the transaction has actually committed.
 *
 * A `put` request firing `onsuccess` is not durability — the transaction can
 * still abort afterwards (quota, a failed sibling request), and reporting
 * success before the commit is how callers end up trusting a write that never
 * landed.
 */
function committed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"))
  })
}

/**
 * Open a transaction together with its commit promise.
 *
 * The commit handlers are attached up front: registering them after the last
 * request has already settled can miss `oncomplete` entirely and hang. The
 * inert `catch` keeps that pre-registered promise from being reported as an
 * unhandled rejection during the window before the caller awaits it — the
 * rejection still surfaces at the real `await done`.
 */
function openTransaction(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode
): { store: IDBObjectStore; done: Promise<void> } {
  const transaction = db.transaction([storeName], mode)
  const done = committed(transaction)
  done.catch(() => {})
  return { store: transaction.objectStore(storeName), done }
}

export class PlaylistStorage {
  private static readonly DB_NAME = AUDIO_DB_NAME
  private static readonly DB_VERSION = AUDIO_DB_VERSION
  private static readonly STORE_NAME = AUDIO_STORE_NAME
  private static readonly METADATA_KEY = "playlist-metadata"
  private static readonly VERSION = "1.0"

  /**
   * Album art is re-embedded into downloaded FLACs and the download itself is
   * buffered before it lands, so reserve headroom beyond the raw byte count
   * when deciding whether an incoming file fits.
   */
  private static readonly WRITE_OVERHEAD = 1.15

  private static db: IDBDatabase | null = null

  // Initialize IndexedDB
  static async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        // Drop the cached handle if the connection goes away, otherwise every
        // later call reuses a dead database and fails with InvalidStateError.
        db.onclose = () => {
          if (this.db === db) this.db = null
        }
        db.onversionchange = () => {
          db.close()
          if (this.db === db) this.db = null
        }
        this.db = db
        resolve(db)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: "id" })
        }
      }
    })
  }

  /**
   * Store a song file.
   *
   * Throws `StorageFullError` when the bytes do not fit — refused up front when
   * the browser reports a quota worth trusting, and otherwise reported by
   * IndexedDB itself, which is the only verdict that holds in a browser that
   * clamps what it reports. Callers must surface that rather than swallowing
   * it: a silent failure here is how the playlist ends up referencing a file
   * that was never written.
   */
  static async storeSongFile(songId: string, file: File): Promise<void> {
    await assertRoomFor(file.size * this.WRITE_OVERHEAD)

    const db = await this.initDB()
    const record: AudioRecord = {
      id: songId,
      file,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      lastModified: file.lastModified,
      storedAt: Date.now(),
    }

    return withQuotaRejection(file.size, () => {
      const transaction = db.transaction([this.STORE_NAME], "readwrite")
      transaction.objectStore(this.STORE_NAME).put(record)
      return committed(transaction)
    })
  }

  // Retrieve a song file from IndexedDB
  static async getSongFile(songId: string): Promise<File | null> {
    try {
      const db = await this.initDB()
      const transaction = db.transaction([this.STORE_NAME], "readonly")
      const store = transaction.objectStore(this.STORE_NAME)
      const result = (await promisify(store.get(songId))) as AudioRecord | undefined
      return result?.file ?? null
    } catch (error) {
      console.error("Error retrieving song file:", error)
      return null
    }
  }

  /**
   * Cheap existence check — reads the key only, never deserialising the record
   * or its blob. Lets download paths detect an already-stored track without
   * pulling a 45 MB file into the page.
   */
  static async hasSongFile(songId: string): Promise<boolean> {
    try {
      const db = await this.initDB()
      const transaction = db.transaction([this.STORE_NAME], "readonly")
      const store = transaction.objectStore(this.STORE_NAME)
      const key = await promisify(store.getKey(songId))
      return key !== undefined
    } catch (error) {
      console.error("Error checking for song file:", error)
      return false
    }
  }

  /**
   * Remove a song file.
   *
   * Errors propagate on purpose. This used to catch-and-return, which resolved
   * as success while the blob survived — the caller then dropped the metadata
   * and left an unreachable 45 MB record behind. That is precisely how the
   * store grew without bound.
   */
  static async removeSongFile(songId: string): Promise<void> {
    const db = await this.initDB()
    const transaction = db.transaction([this.STORE_NAME], "readwrite")
    transaction.objectStore(this.STORE_NAME).delete(songId)
    return committed(transaction)
  }

  // Save playlist metadata to localStorage
  static savePlaylistMetadata(songs: StoredSong[], currentSongId?: string): void {
    try {
      const playlistData: PlaylistData = {
        songs,
        currentSongId,
        lastUpdated: Date.now(),
        version: this.VERSION,
      }

      localStorage.setItem(this.METADATA_KEY, JSON.stringify(playlistData))
    } catch (error) {
      console.error("Error saving playlist metadata:", error)
    }
  }

  // Load playlist metadata from localStorage
  static loadPlaylistMetadata(): PlaylistData | null {
    try {
      const stored = localStorage.getItem(this.METADATA_KEY)
      if (!stored) return null

      const data = JSON.parse(stored) as PlaylistData

      // Version migration: preserve user data, update stamp
      if (data.version !== this.VERSION) {
        console.info(`Playlist version migrated: ${data.version} → ${this.VERSION}`)
        data.version = this.VERSION
        localStorage.setItem(this.METADATA_KEY, JSON.stringify(data))
      }

      return data
    } catch (error) {
      console.error("Error loading playlist metadata:", error)
      return null
    }
  }

  private static async hashBlob(blob: Blob): Promise<string | null> {
    const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined
    if (!subtle) return null

    try {
      const digest = await subtle.digest("SHA-256", await blob.arrayBuffer())
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
    } catch (error) {
      console.error("Error hashing album art:", error)
      return null
    }
  }

  /**
   * Store album art, content-addressed.
   *
   * Every track on an album carries the same cover. Keying the bytes by their
   * SHA-256 and refcounting means a 12-track album keeps one image instead of
   * twelve; each song gets a small pointer record instead of its own copy.
   *
   * If SubtleCrypto is unavailable (non-secure context) it degrades to the old
   * inline record — art still works, it just is not deduped.
   */
  static async storeAlbumArt(songId: string, albumArtUrl: string): Promise<string> {
    // Convert blob URL to actual blob data for persistent storage
    const response = await fetch(albumArtUrl)
    const blob = await response.blob()
    const hash = await this.hashBlob(blob)
    const db = await this.initDB()

    return withQuotaRejection(blob.size, () => this.writeAlbumArt(db, songId, blob, hash))
  }

  private static async writeAlbumArt(
    db: IDBDatabase,
    songId: string,
    blob: Blob,
    hash: string | null
  ): Promise<string> {
    const pointerId = artPointerKey(songId)
    const now = Date.now()

    // One read-write transaction for the whole read-modify-write. IndexedDB
    // serialises overlapping transactions on the store, so two concurrent
    // downloads sharing a cover cannot race the refCount.
    const { store, done } = openTransaction(db, this.STORE_NAME, "readwrite")

    const existing = (await promisify(store.get(pointerId))) as ArtPointerRecord | undefined

    if (!hash) {
      const legacy: ArtPointerRecord = {
        id: pointerId,
        type: "albumart",
        songId,
        blob,
        mimeType: blob.type,
        size: blob.size,
        storedAt: now,
      }
      if (existing?.artHash) await this.releaseArtBlob(store, existing.artHash)
      store.put(legacy)
      await done
      return pointerId
    }

    if (existing?.artHash === hash) {
      // Same bytes already linked to this song — nothing to write.
      await done
      return pointerId
    }

    // Re-pointing this song at different art releases whatever it held before.
    if (existing?.artHash) await this.releaseArtBlob(store, existing.artHash)

    const blobId = artBlobKey(hash)
    const shared = (await promisify(store.get(blobId))) as ArtBlobRecord | undefined

    if (shared) {
      store.put({ ...shared, refCount: shared.refCount + 1 })
    } else {
      const record: ArtBlobRecord = {
        id: blobId,
        type: "albumart-blob",
        blob,
        mimeType: blob.type,
        size: blob.size,
        refCount: 1,
        storedAt: now,
      }
      store.put(record)
    }

    const pointer: ArtPointerRecord = {
      id: pointerId,
      type: "albumart",
      songId,
      artHash: hash,
      mimeType: blob.type,
      size: blob.size,
      storedAt: now,
    }
    store.put(pointer)

    await done
    return pointerId
  }

  /** Drop one reference to shared art, deleting the bytes at zero. */
  private static async releaseArtBlob(store: IDBObjectStore, hash: string): Promise<void> {
    const blobId = artBlobKey(hash)
    const shared = (await promisify(store.get(blobId))) as ArtBlobRecord | undefined
    if (!shared) return

    if (shared.refCount <= 1) {
      store.delete(blobId)
    } else {
      store.put({ ...shared, refCount: shared.refCount - 1 })
    }
  }

  /**
   * Retrieve the stored album art bytes.
   *
   * Prefer this over `getAlbumArt` — handing back the blob lets the caller
   * decide whether an object URL is warranted, and lets it record the real byte
   * size. `getAlbumArt` creates a URL whether or not anything displays it, and
   * a URL nobody revokes keeps its blob in memory for the life of the page.
   */
  static async getAlbumArtBlob(songId: string): Promise<Blob | null> {
    try {
      const db = await this.initDB()
      const transaction = db.transaction([this.STORE_NAME], "readonly")
      const store = transaction.objectStore(this.STORE_NAME)

      const pointer = (await promisify(store.get(artPointerKey(songId)))) as
        | ArtPointerRecord
        | undefined
      if (!pointer) return null

      // Records written before content addressing hold their bytes inline.
      if (pointer.blob) return pointer.blob
      if (!pointer.artHash) return null

      const shared = (await promisify(store.get(artBlobKey(pointer.artHash)))) as
        | ArtBlobRecord
        | undefined
      return shared?.blob ?? null
    } catch (error) {
      console.error("Error retrieving album art:", error)
      return null
    }
  }

  /**
   * Remove a song's album art. Errors propagate — see `removeSongFile`.
   */
  static async removeAlbumArt(songId: string): Promise<void> {
    const db = await this.initDB()
    const { store, done } = openTransaction(db, this.STORE_NAME, "readwrite")

    const pointerId = artPointerKey(songId)
    const pointer = (await promisify(store.get(pointerId))) as ArtPointerRecord | undefined
    if (!pointer) {
      await done
      return
    }

    store.delete(pointerId)
    if (pointer.artHash) await this.releaseArtBlob(store, pointer.artHash)

    await done
  }

  /**
   * Walk the store once, classifying every record.
   *
   * Cursor rather than `getAll()`: this keeps one record in hand at a time
   * instead of building an array of every record in the library.
   */
  private static async scanStore(): Promise<{
    audio: { count: number; bytes: number }
    artPointers: ArtPointerRecord[]
    artBlobs: Map<string, ArtBlobRecord>
  }> {
    const db = await this.initDB()
    const audio = { count: 0, bytes: 0 }
    const artPointers: ArtPointerRecord[] = []
    const artBlobs = new Map<string, ArtBlobRecord>()

    await new Promise<void>((resolve, reject) => {
      const request = db
        .transaction([this.STORE_NAME], "readonly")
        .objectStore(this.STORE_NAME)
        .openCursor()

      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          resolve()
          return
        }

        const record = cursor.value as AudioStoreRecord
        if (isArtBlob(record)) {
          artBlobs.set(record.id, record)
        } else if (isArtPointer(record)) {
          artPointers.push(record)
        } else {
          audio.count++
          audio.bytes += record.fileSize || record.file?.size || 0
        }

        cursor.continue()
      }
      request.onerror = () => reject(request.error)
    })

    return { audio, artPointers, artBlobs }
  }

  /**
   * Album art entries for the manager UI. `size` is the bytes this song's art
   * actually occupies: shared covers report their real size, but the cost is
   * paid once across every song pointing at them.
   */
  static async getAllAlbumArtEntries(): Promise<Array<{ id: string; songId: string; size: number }>> {
    try {
      const { artPointers, artBlobs } = await this.scanStore()

      return artPointers.map((pointer) => {
        const shared = pointer.artHash ? artBlobs.get(artBlobKey(pointer.artHash)) : undefined
        return {
          id: pointer.id,
          songId: pointer.songId || songIdFromArtPointerKey(pointer.id),
          size: shared?.size ?? pointer.size ?? 0,
        }
      })
    } catch (error) {
      console.error("Error getting album art entries:", error)
      return []
    }
  }

  /**
   * Clear the whole playlist. Errors propagate so the caller does not reset the
   * UI while the data is still on disk.
   */
  static async clearPlaylist(): Promise<void> {
    localStorage.removeItem(this.METADATA_KEY)

    const db = await this.initDB()
    const transaction = db.transaction([this.STORE_NAME], "readwrite")
    transaction.objectStore(this.STORE_NAME).clear()
    return committed(transaction)
  }

  /**
   * Storage usage. `albumArtSize` counts each shared cover once — the number
   * reflects bytes on disk, not the sum of per-song claims.
   */
  static async getStorageInfo(): Promise<StorageInfo> {
    const quota = await getQuotaStatus()

    try {
      const { audio, artPointers, artBlobs } = await this.scanStore()

      let albumArtSize = 0
      for (const record of artBlobs.values()) albumArtSize += record.size || record.blob?.size || 0
      for (const pointer of artPointers) {
        if (isLegacyArt(pointer)) albumArtSize += pointer.size || 0
      }

      const used = audio.bytes + albumArtSize
      return {
        used,
        songs: audio.count,
        albumArtCount: artPointers.length,
        albumArtSize,
        quota,
      }
    } catch (error) {
      console.error("Error getting storage info:", error)
      return { used: 0, songs: 0, albumArtCount: 0, albumArtSize: 0, quota }
    }
  }

  /**
   * Delete every record no playlist entry points at.
   *
   * `knownSongIds` must come from a metadata load the caller knows succeeded —
   * see the guard in `sweepAudioStore`.
   */
  static async sweepOrphans(knownSongIds: Iterable<string>): Promise<SweepResult> {
    const db = await this.initDB()
    return sweepAudioStore(db, new Set(knownSongIds))
  }

  /** What `sweepOrphans` would reclaim, without deleting anything. */
  static async countOrphans(knownSongIds: Iterable<string>): Promise<OrphanReport> {
    const db = await this.initDB()
    return countStoreOrphans(db, new Set(knownSongIds))
  }

  /** Every song id that has audio bytes on disk, art records excluded. */
  static async getStoredSongIds(): Promise<string[]> {
    try {
      const db = await this.initDB()
      const transaction = db.transaction([this.STORE_NAME], "readonly")
      const store = transaction.objectStore(this.STORE_NAME)
      const keys = await promisify(store.getAllKeys())
      return keys.map(String).filter((key) => !isArtPointerKey(key) && !isArtBlobKey(key))
    } catch (error) {
      console.error("Error listing stored song ids:", error)
      return []
    }
  }

  // Validate stored files against metadata.
  //
  // We deliberately do not compare `lastModified` here. Downloaded files go
  // through a two-step File construction (raw blob → art-embedded blob),
  // each call to `new File(...)` stamps its own fresh `Date.now()`, and the
  // auto-save snapshot can race the second mutation. A strict timestamp
  // match would then purge a perfectly good IndexedDB entry on reload —
  // which is exactly the "songs disappear after refresh" bug we hit.
  //
  // Name + size are still checked: an external edit that meaningfully
  // alters the file will change the size, and rename collisions are
  // unlikely enough that name equality is a reasonable additional guard.
  static async validateStoredFiles(songs: StoredSong[]): Promise<StoredSong[]> {
    const validSongs: StoredSong[] = []

    for (const song of songs) {
      const file = await this.getSongFile(song.id)
      if (!file) continue

      if (file.name === song.fileName && file.size === song.fileSize) {
        validSongs.push(song)
      } else {
        // A failure here must not abort the restore — the song is dropped from
        // the playlist either way, and the orphan sweep reclaims the record.
        try {
          await this.removeSongFile(song.id)
        } catch (error) {
          console.error(`Failed to remove mismatched file for ${song.id}:`, error)
        }
      }
    }

    return validSongs
  }

  // Export playlist data (metadata only, for sharing)
  static exportPlaylistMetadata(): string {
    const data = this.loadPlaylistMetadata()
    if (!data) return JSON.stringify({ songs: [], version: this.VERSION })

    return JSON.stringify({
      songs: data.songs.map((song) => ({
        ...song,
        // Remove file-specific data for export
        id: undefined,
        fileName: song.fileName,
        fileSize: song.fileSize,
      })),
      exportedAt: new Date().toISOString(),
      version: this.VERSION,
    })
  }
}
