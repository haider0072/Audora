import type { Song } from "@/components/enhanced-playlist"
import { trackSyncKey } from "@/lib/sync/song-match"

import type { CloudSong, CloudSongRef } from "./types"

/**
 * Folding the cloud library into this device's song list.
 *
 * The list the player works from holds both kinds of song, because the queue,
 * shuffle, and every view operate on one array. Two rules keep that safe:
 *
 * - A track this device already has stays the local song and merely gains a
 *   `cloud` reference. It keeps playing from the local copy — instant, no
 *   network — and appears once.
 * - A track only the cloud has becomes a song with no `file`. Such songs are
 *   never persisted (see `isCloudOnlySong`): restore drops any song whose audio
 *   blob is missing, so persisting one would delete it on the next reload.
 *
 * Tracks are matched by `trackSyncKey` — normalized file name plus byte size —
 * the same identity two-device playback uses, so an identical file matches no
 * matter which device or folder it came from.
 */

export function isCloudOnlySong(song: Pick<Song, "file" | "cloud">): boolean {
  return !song.file && !!song.cloud
}

function cloudRef(cloud: CloudSong): CloudSongRef {
  return { key: cloud.key, streamUrl: cloud.streamUrl }
}

function sameRef(a: CloudSongRef | undefined, b: CloudSongRef | undefined): boolean {
  return a?.key === b?.key && a?.streamUrl === b?.streamUrl
}

export function cloudSongToSong(cloud: CloudSong): Song {
  return {
    id: cloud.id,
    url: "",
    fileName: cloud.fileName,
    fileSize: cloud.fileSize,
    title: cloud.title,
    artist: cloud.artist,
    artists: cloud.artists,
    albumArtist: cloud.albumArtist,
    album: cloud.album,
    year: cloud.year,
    genre: cloud.genre,
    trackNumber: cloud.trackNumber,
    discNumber: cloud.discNumber,
    duration: cloud.duration,
    bitrate: cloud.bitrate,
    sampleRate: cloud.sampleRate,
    bitDepth: cloud.bitDepth,
    format: cloud.format,
    albumArt: cloud.artUrl,
    albumArtThumb: cloud.thumbUrl,
    cloud: cloudRef(cloud),
  }
}

/** Fields of a cloud-only song that the player sets, not its index entry. */
const PLAYER_FIELDS: ReadonlySet<keyof Song> = new Set(["url", "cloud"])

function sameField(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, i) => value === b[i])
  return a === b
}

/**
 * Whether a cloud-only song already shows everything its entry says: the same
 * object, covers and tags. One that differs is rebuilt, so an entry the
 * indexer has re-read (new tags, stream info) reaches the list.
 */
function sameCloudOnlySong(song: Song, cloud: CloudSong): boolean {
  const fresh = cloudSongToSong(cloud)
  if (!sameRef(song.cloud, fresh.cloud)) return false
  return (Object.keys(fresh) as (keyof Song)[]).every(
    (field) => PLAYER_FIELDS.has(field) || sameField(song[field], fresh[field]),
  )
}

/**
 * The song list with `cloud` merged in.
 *
 * Returns `current` itself when nothing changes, so it can run on every local
 * list change without making React re-render — or loop.
 */
export function mergeCloudLibrary(current: Song[], cloud: readonly CloudSong[]): Song[] {
  // The same bytes uploaded under two keys are one track; the first key wins.
  const cloudByTrack = new Map<string, CloudSong>()
  for (const entry of cloud) {
    const key = trackSyncKey({ fileName: entry.fileName, fileSize: entry.fileSize })
    if (key && !cloudByTrack.has(key)) cloudByTrack.set(key, entry)
  }

  const previousCloudOnly = new Map<string, Song>()
  const localTracks = new Set<string>()
  const merged: Song[] = []

  for (const song of current) {
    if (isCloudOnlySong(song)) {
      previousCloudOnly.set(song.id, song)
      continue
    }

    const track = trackSyncKey(song)
    if (track) localTracks.add(track)

    const match = track ? cloudByTrack.get(track) : undefined
    const wanted = match ? cloudRef(match) : undefined
    merged.push(sameRef(song.cloud, wanted) ? song : { ...song, cloud: wanted })
  }

  for (const [track, entry] of cloudByTrack) {
    if (localTracks.has(track)) continue
    const previous = previousCloudOnly.get(entry.id)
    merged.push(previous && sameCloudOnlySong(previous, entry) ? previous : cloudSongToSong(entry))
  }

  const unchanged =
    merged.length === current.length && merged.every((song, index) => song === current[index])
  return unchanged ? current : merged
}
