"use client"

import { useEffect, useCallback, useRef } from "react"
import { AlbumArtCache } from "@/lib/album-art-cache"

interface Song {
  id: string
  albumArt?: string
}

export function useAlbumArtPreloader(songs: Song[], currentSongId?: string, preloadCount = 3) {
  const preloadingRef = useRef(false)
  const lastPreloadedRef = useRef<string>()

  // Preload album art for upcoming songs
  const preloadUpcomingSongs = useCallback(async () => {
    if (!currentSongId || songs.length === 0 || preloadingRef.current) return

    // Don't preload if we just did it for this song
    if (lastPreloadedRef.current === currentSongId) return

    preloadingRef.current = true
    lastPreloadedRef.current = currentSongId

    try {
      const currentIndex = songs.findIndex((song) => song.id === currentSongId)
      if (currentIndex === -1) return

      // Get songs to preload (next few songs in the playlist)
      const songsToPreload: Song[] = []

      // Preload next songs
      for (let i = 1; i <= preloadCount; i++) {
        const nextIndex = (currentIndex + i) % songs.length
        const nextSong = songs[nextIndex]
        if (nextSong && nextSong.albumArt && nextSong.id !== currentSongId) {
          songsToPreload.push(nextSong)
        }
      }

      // Also preload previous song for backward navigation
      const prevIndex = currentIndex - 1 < 0 ? songs.length - 1 : currentIndex - 1
      const prevSong = songs[prevIndex]
      if (prevSong && prevSong.albumArt && prevSong.id !== currentSongId) {
        songsToPreload.push(prevSong)
      }

      // Preload the album art (limit to prevent overwhelming)
      if (songsToPreload.length > 0) {
        await AlbumArtCache.preloadMultiple(songsToPreload.slice(0, 3))
      }
    } catch (error) {
      console.error("Error preloading album art:", error)
    } finally {
      preloadingRef.current = false
    }
  }, [songs, currentSongId, preloadCount])

  // Preload when current song changes (with longer debounce)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      preloadUpcomingSongs()
    }, 1000) // Longer debounce to prevent excessive preloading

    return () => clearTimeout(timeoutId)
  }, [preloadUpcomingSongs])

  // Initial preload of first few songs (only once)
  useEffect(() => {
    if (songs.length > 0) {
      const initialSongs = songs.slice(0, Math.min(2, songs.length))
      AlbumArtCache.preloadMultiple(initialSongs).catch((error) => {
        console.error("Error in initial preload:", error)
      })
    }
  }, []) // Only run once on mount

  return {
    preloadUpcomingSongs,
    getCacheStats: AlbumArtCache.getCacheStats,
    clearCache: AlbumArtCache.clearCache,
  }
}
