"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { toast } from "@/hooks/use-toast"
import { PlaylistStorage, type StorageInfo } from "@/lib/playlist-storage"
import { formatBytes } from "@/lib/storage-quota"
import { formatCount } from "@/lib/utils"
import { VideoCache } from "@/lib/video-cache"

export interface LibraryStorage {
  /** What the library holds and what the browser says it allows; null until measured. */
  info: StorageInfo | null
  /** Video lookups kept, so a song's videos come back without asking YouTube again. */
  videoLookups: number
  /**
   * How many stored files no song points at, for reclaiming to confirm. Nothing
   * to confirm is 0, and the person has already been told why.
   */
  findOrphans: () => Promise<number>
  /** Removes the files no song points at, and says what that freed. True once they are gone. */
  reclaim: () => Promise<boolean>
  /** Downloads the library's songs, as a JSON file to keep. */
  exportMetadata: () => void
  clearVideoLookups: () => void
}

/**
 * Song ids the library has saved: what a sweep may treat as reachable. Read
 * from the saved record rather than the songs on screen, because the sweep must
 * agree with what is stored. Empty means the record is missing, and then every
 * file would look unreachable.
 */
function savedSongIds(): string[] {
  return PlaylistStorage.loadPlaylistMetadata()?.songs.map((song) => song.id) ?? []
}

/** The library's storage as the store and the browser report it; null when it can't be read. */
async function measureStorage(): Promise<StorageInfo | null> {
  try {
    return await PlaylistStorage.getStorageInfo()
  } catch (error) {
    console.error("Could not measure the library's storage:", error)
    return null
  }
}

function sayRecordMissing() {
  toast({
    title: "Couldn't check storage",
    description: "The library's list of songs isn't loaded. Reload Audora and try again.",
    variant: "destructive",
  })
}

/**
 * The library's storage, for Settings: what it uses and what the browser
 * allows, the files no song uses any more, the export, and the saved video
 * lookups. Measured on mount, whenever songs come or go, and after a reclaim.
 */
export function useLibraryStorage(songCount: number): LibraryStorage {
  const [info, setInfo] = useState<StorageInfo | null>(null)
  const [videoLookups, setVideoLookups] = useState(0)
  const measurement = useRef(0)

  const measure = useCallback(() => {
    const run = ++measurement.current
    return measureStorage().then((measured) => {
      // Only the latest measurement lands, however the walks of the store finish.
      if (run !== measurement.current) return
      if (measured) setInfo(measured)
      setVideoLookups(VideoCache.getCacheStats().totalEntries)
    })
  }, [])

  useEffect(() => {
    void measure()
  }, [measure, songCount])

  const findOrphans = useCallback(async () => {
    const known = savedSongIds()
    if (known.length === 0) {
      sayRecordMissing()
      return 0
    }
    try {
      const { records } = await PlaylistStorage.countOrphans(known)
      if (records === 0) toast({ title: "Nothing to reclaim", description: "Every stored file belongs to a song." })
      return records
    } catch (error) {
      console.error("Could not count the stored files no song uses:", error)
      toast({ title: "Couldn't check storage", description: "Reading the stored files failed.", variant: "destructive" })
      return 0
    }
  }, [])

  const reclaim = useCallback(async () => {
    const known = savedSongIds()
    if (known.length === 0) {
      sayRecordMissing()
      return false
    }
    try {
      const { removedRecords, bytesReclaimed } = await PlaylistStorage.sweepOrphans(known)
      toast({
        title: "Space reclaimed",
        description: `Removed ${formatCount(removedRecords, "file")} no song uses, freeing ${formatBytes(bytesReclaimed)}.`,
      })
      await measure()
      return true
    } catch (error) {
      console.error("Could not remove the stored files no song uses:", error)
      toast({
        title: "Couldn't reclaim space",
        description: error instanceof Error ? error.message : "Removing the files failed.",
        variant: "destructive",
      })
      return false
    }
  }, [measure])

  const exportMetadata = useCallback(() => {
    try {
      const file = new Blob([PlaylistStorage.exportPlaylistMetadata()], { type: "application/json" })
      const url = URL.createObjectURL(file)
      const link = document.createElement("a")
      link.href = url
      link.download = `audora-library-${new Date().toISOString().slice(0, 10)}.json`
      // On the page, as some browsers only download from a link that is.
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Could not export the library's metadata:", error)
      toast({ title: "Couldn't export", description: "Writing the library's metadata failed.", variant: "destructive" })
    }
  }, [])

  const clearVideoLookups = useCallback(() => {
    VideoCache.clearAllCachedVideos()
    setVideoLookups(0)
    toast({ title: "Video lookups cleared", description: "Videos are looked up again as songs ask for them." })
  }, [])

  return { info, videoLookups, findOrphans, reclaim, exportMetadata, clearVideoLookups }
}
