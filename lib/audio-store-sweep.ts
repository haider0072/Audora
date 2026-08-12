import {
  artBlobKey,
  AUDIO_STORE_NAME,
  isArtBlob,
  isArtPointer,
  isOrphanEligible,
  songIdFromArtPointerKey,
  type ArtBlobRecord,
  type ArtPointerRecord,
  type AudioRecord,
  type AudioStoreRecord,
} from "./audio-store-schema"

/**
 * Orphan collection for the `audio-files` store.
 *
 * `PlaylistStorage.validateStoredFiles` walks playlist metadata and checks each
 * entry against IndexedDB — it finds *metadata* pointing at missing files. This
 * is the missing opposite direction: walk IndexedDB and find *records* that no
 * metadata points at. Those are unreachable by every code path in the app, so
 * nothing but a sweep will ever free them.
 *
 * They accumulate whenever a delete half-succeeds, whenever a synced folder
 * drops a track, and whenever a download is interrupted between writing the
 * blob and persisting metadata.
 */

export interface SweepResult {
  removedRecords: number
  bytesReclaimed: number
  /** Orphan-looking records left alone because they may be mid-write. */
  skippedRecent: number
  /** Shared art records whose refCount had drifted and was corrected. */
  repairedRefCounts: number
}

export interface OrphanReport {
  records: number
  bytes: number
}

const EMPTY_RESULT: SweepResult = {
  removedRecords: 0,
  bytesReclaimed: 0,
  skippedRecent: 0,
  repairedRefCounts: 0,
}

function audioRecordSize(record: AudioRecord): number {
  return record.fileSize || record.file?.size || 0
}

function artBlobSize(record: ArtBlobRecord): number {
  return record.size || record.blob?.size || 0
}

interface StoreSnapshot {
  audio: AudioRecord[]
  pointers: ArtPointerRecord[]
  blobs: Map<string, ArtBlobRecord>
}

/**
 * Read every record's bookkeeping fields.
 *
 * A cursor rather than `getAll()` on purpose: this walks one record at a time
 * instead of materialising the whole store as an array, which matters once a
 * library runs to thousands of tracks.
 */
function snapshotStore(store: IDBObjectStore): Promise<StoreSnapshot> {
  return new Promise((resolve, reject) => {
    const snapshot: StoreSnapshot = { audio: [], pointers: [], blobs: new Map() }
    const request = store.openCursor()

    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(snapshot)
        return
      }

      const record = cursor.value as AudioStoreRecord
      if (isArtBlob(record)) {
        snapshot.blobs.set(record.id, record)
      } else if (isArtPointer(record)) {
        snapshot.pointers.push(record)
      } else {
        snapshot.audio.push(record)
      }

      cursor.continue()
    }
    request.onerror = () => reject(request.error)
  })
}

interface SweepPlan {
  /** Record id → bytes that deleting it actually frees. */
  doomed: Map<string, number>
  refCountFixes: ArtBlobRecord[]
  skippedRecent: number
}

/**
 * Decide what is unreachable. Pure over the snapshot so the sweep and the
 * read-only report cannot drift apart.
 */
function planSweep(
  { audio, pointers, blobs }: StoreSnapshot,
  knownSongIds: Set<string>,
  now: number
): SweepPlan {
  const doomed = new Map<string, number>()
  let skippedRecent = 0

  for (const record of audio) {
    if (knownSongIds.has(record.id)) continue
    if (!isOrphanEligible(record.storedAt, now)) {
      skippedRecent++
      continue
    }
    doomed.set(record.id, audioRecordSize(record))
  }

  // Recount references from what actually survives rather than trusting the
  // stored counter, which drifts whenever a delete fails partway.
  const liveRefs = new Map<string, number>()

  for (const record of pointers) {
    const songId = record.songId || songIdFromArtPointerKey(record.id)
    const stillOwned = knownSongIds.has(songId)
    const recent = !stillOwned && !isOrphanEligible(record.storedAt, now)

    if (stillOwned || recent) {
      if (recent) skippedRecent++
      if (record.artHash) {
        const key = artBlobKey(record.artHash)
        liveRefs.set(key, (liveRefs.get(key) ?? 0) + 1)
      }
      continue
    }

    // Legacy pointers carry their bytes inline, so deleting one reclaims them
    // directly. Content-addressed pointers reclaim nothing on their own — the
    // shared blob below is where the bytes actually live.
    doomed.set(record.id, record.artHash ? 0 : record.size || 0)
  }

  const refCountFixes: ArtBlobRecord[] = []
  for (const [id, record] of blobs) {
    const refs = liveRefs.get(id) ?? 0
    if (refs === 0) {
      if (!isOrphanEligible(record.storedAt, now)) {
        skippedRecent++
        continue
      }
      doomed.set(id, artBlobSize(record))
    } else if (record.refCount !== refs) {
      refCountFixes.push({ ...record, refCount: refs })
    }
  }

  return { doomed, refCountFixes, skippedRecent }
}

/**
 * Refuses to run on an empty id set. An empty set is indistinguishable from
 * "playlist metadata failed to load" (private mode, corrupt JSON, quota error),
 * and in that state every record looks orphaned — the sweep would wipe the
 * entire library. Callers must only invoke this after a metadata load they know
 * succeeded.
 */
export function sweepAudioStore(
  db: IDBDatabase,
  knownSongIds: Set<string>,
  now: number = Date.now()
): Promise<SweepResult> {
  if (knownSongIds.size === 0) {
    console.warn(
      "Orphan sweep skipped: no known songs, refusing to treat the whole store as orphaned"
    )
    return Promise.resolve({ ...EMPTY_RESULT })
  }

  // Scan and delete inside ONE readwrite transaction. Snapshotting in a separate
  // readonly transaction first would let a concurrent write land in between: a
  // download storing a cover that the snapshot had already written off would
  // have its brand-new pointer left dangling when the deletes ran. IndexedDB
  // serialises readwrite transactions on a store, so holding both halves in one
  // makes that interleaving impossible.
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AUDIO_STORE_NAME], "readwrite")
    const store = transaction.objectStore(AUDIO_STORE_NAME)
    let result: SweepResult = { ...EMPTY_RESULT }

    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Orphan sweep transaction failed"))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Orphan sweep transaction aborted"))

    snapshotStore(store)
      .then((snapshot) => {
        const { doomed, refCountFixes, skippedRecent } = planSweep(snapshot, knownSongIds, now)

        for (const id of doomed.keys()) store.delete(id)
        for (const record of refCountFixes) store.put(record)

        let bytesReclaimed = 0
        for (const size of doomed.values()) bytesReclaimed += size

        result = {
          removedRecords: doomed.size,
          bytesReclaimed,
          skippedRecent,
          repairedRefCounts: refCountFixes.length,
        }
      })
      .catch(reject)
  })
}

/** What a sweep would reclaim, without touching anything. */
export async function countOrphans(
  db: IDBDatabase,
  knownSongIds: Set<string>,
  now: number = Date.now()
): Promise<OrphanReport> {
  if (knownSongIds.size === 0) return { records: 0, bytes: 0 }

  const store = db.transaction([AUDIO_STORE_NAME], "readonly").objectStore(AUDIO_STORE_NAME)
  const { doomed } = planSweep(await snapshotStore(store), knownSongIds, now)

  let bytes = 0
  for (const size of doomed.values()) bytes += size

  return { records: doomed.size, bytes }
}
