"use client"

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react"
import { Music } from "lucide-react"
import { AlbumArtCache } from "@/lib/album-art-cache"

interface AlbumArtDisplayProps {
  songId?: string
  albumArt?: string
  title?: string
  isTransitioning?: boolean
  className?: string
  style?: React.CSSProperties
  size?: "small" | "medium" | "large"
  showFallback?: boolean
}

export function AlbumArtDisplay({
  songId,
  albumArt,
  title = "Album Art",
  isTransitioning = false,
  className = "",
  style,
  size = "large",
  showFallback = true,
}: AlbumArtDisplayProps) {
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  const currentSongIdRef = useRef<string | undefined>(undefined)
  const loadingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const imageRef = useRef<HTMLImageElement>(null)
  const isLoadingRef = useRef(false) // Prevent concurrent loading
  // Mirror of currentImageUrl. The loader reads it through this ref rather than
  // closing over the state so that its identity stays stable — see the note on
  // the load effect below.
  const currentImageUrlRef = useRef<string | null>(null)
  // URL that already failed for the current song. Asking for it again fails
  // identically, so the fallback stands until the song or its art changes.
  const failedUrlRef = useRef<string | null>(null)

  /** Keep the ref mirror in step with the state it shadows. */
  const applyImageUrl = useCallback((url: string | null) => {
    currentImageUrlRef.current = url
    setCurrentImageUrl(url)
  }, [])

  const sizeClasses = {
    small: "w-12 h-12",
    medium: "w-16 h-16",
    large: "w-48 h-48",
  }

  // Handle client-side mounting — useLayoutEffect ensures state updates
  // commit before browser paint, so cached images appear instantly (no placeholder flash)
  useLayoutEffect(() => {
    setIsMounted(true)
    if (songId && albumArt) {
      const cachedUrl = AlbumArtCache.getCachedAlbumArt(songId)
      if (cachedUrl) {
        applyImageUrl(cachedUrl)
        currentSongIdRef.current = songId
        AlbumArtCache.markAsStable(songId)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- mount-only init

  // Cleanup function to release album art reference
  const cleanupCurrentImage = useCallback(() => {
    if (currentSongIdRef.current) {
      AlbumArtCache.releaseAlbumArt(currentSongIdRef.current)
    }
  }, [])

  // Stable loading function that prevents race conditions
  const loadAlbumArt = useCallback(
    async (targetSongId: string, targetAlbumArt: string) => {
      // Prevent concurrent loading for the same component
      if (isLoadingRef.current) return

      // Don't reload if it's the same song and we already have a URL
      if (currentSongIdRef.current === targetSongId && currentImageUrlRef.current) {
        AlbumArtCache.markAsStable(targetSongId)
        return
      }

      isLoadingRef.current = true

      // Clear any existing loading timeout
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
      }

      // Only show loading for new images, not when switching between existing ones
      if (!currentImageUrlRef.current || currentSongIdRef.current !== targetSongId) {
        setIsLoading(true)
      }
      setHasError(false)

      try {
        // Check cache first
        let cachedUrl = AlbumArtCache.getCachedAlbumArt(targetSongId)

        if (!cachedUrl) {
          // Preload and cache if not available
          cachedUrl = await AlbumArtCache.preloadAlbumArt(targetSongId, targetAlbumArt)
        }

        // A URL that already failed for this song will fail again. Settling on
        // the fallback is the terminal state until the song or its art changes.
        if (cachedUrl && cachedUrl === failedUrlRef.current) {
          setHasError(true)
          return
        }

        // Only update if this is still the target song (prevent race conditions)
        if (cachedUrl && targetSongId === songId) {
          // Release previous reference
          cleanupCurrentImage()

          applyImageUrl(cachedUrl)
          currentSongIdRef.current = targetSongId

          // Mark as stable since it's being displayed
          AlbumArtCache.markAsStable(targetSongId)
        } else if (!cachedUrl) {
          setHasError(true)
        }
      } catch (error) {
        console.error("Error loading album art:", error)
        setHasError(true)
      } finally {
        // Delayed loading state update to prevent flickering
        loadingTimeoutRef.current = setTimeout(() => {
          setIsLoading(false)
          isLoadingRef.current = false
        }, 100)
      }
    },
    [songId, cleanupCurrentImage, applyImageUrl],
  )

  /**
   * Load whenever the song or its art changes — and only then.
   *
   * `hasError` and `currentImageUrl` are deliberately absent from the
   * dependencies. While they were listed, a failing <img> set `hasError`, which
   * re-armed this effect, which cleared `hasError` and asked the cache for the
   * same unreachable URL, which failed again: a retry loop that ran for as long
   * as the window stayed open. A failure is now terminal for that URL.
   */
  useEffect(() => {
    if (!isMounted || !songId || !albumArt) {
      cleanupCurrentImage()
      applyImageUrl(null)
      setHasError(false)
      setIsLoading(false)
      currentSongIdRef.current = undefined
      failedUrlRef.current = null
      isLoadingRef.current = false
      return
    }

    // A new song (or new art for the same one) deserves a fresh attempt.
    failedUrlRef.current = null

    // Only load if we don't have this image already
    if (currentSongIdRef.current !== songId || !currentImageUrlRef.current) {
      loadAlbumArt(songId, albumArt)
    } else {
      // Just mark as stable if we already have the right image
      AlbumArtCache.markAsStable(songId)
    }
  }, [songId, albumArt, isMounted, loadAlbumArt, cleanupCurrentImage, applyImageUrl])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupCurrentImage()
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
      }
      isLoadingRef.current = false
    }
  }, [cleanupCurrentImage])

  /**
   * Settle on the fallback and remember the URL that failed, so nothing asks
   * for it again while this song is displayed.
   *
   * The cache entry goes too: it is what handed this URL over, and it would
   * keep handing it to every later lookup. `removeCachedAlbumArt` will not do
   * it here — this component still holds the reference it is reporting on —
   * hence the unconditional invalidation.
   */
  const handleImageError = useCallback(() => {
    console.warn(`Failed to load album art for song: ${songId}`)
    failedUrlRef.current = currentImageUrlRef.current
    if (songId) {
      AlbumArtCache.invalidateCachedAlbumArt(songId)
    }
    setHasError(true)
    setIsLoading(false)
    isLoadingRef.current = false
  }, [songId])

  // Handle image load success
  const handleImageLoad = useCallback(() => {
    failedUrlRef.current = null
    setHasError(false)
    setIsLoading(false)
    isLoadingRef.current = false

    // Mark as stable when successfully loaded
    if (songId) {
      AlbumArtCache.markAsStable(songId)
    }
  }, [songId])

  if (!isMounted) {
    // Return a simple placeholder during SSR
    return (
      <div className={`${sizeClasses[size]} ${className}`}>
        <div className="w-full h-full rounded-2xl bg-muted flex items-center justify-center">
          {showFallback && <Music className="w-1/3 h-1/3 text-muted-foreground" />}
        </div>
      </div>
    )
  }

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`} style={style}>
      {/* Background/Fallback */}
      <div
        className={`
          absolute inset-0 rounded-2xl flex items-center justify-center
          transition-opacity duration-200 ease-out
          ${currentImageUrl && !hasError ? "opacity-0" : "opacity-100"}
          ${showFallback ? "bg-muted" : "bg-transparent"}
        `}
      >
        {showFallback && <Music className="w-1/3 h-1/3 text-muted-foreground" />}
      </div>

      {/* Current Image */}
      {currentImageUrl && !hasError && (
        <img
          ref={imageRef}
          src={currentImageUrl || "/placeholder.svg"}
          alt={title}
          className={`
            absolute inset-0 w-full h-full object-cover rounded-2xl
            transition-all duration-200 ease-out
            ${isTransitioning ? "scale-95 opacity-80" : "scale-100 opacity-100"}
          `}
          onError={handleImageError}
          onLoad={handleImageLoad}
          loading="eager"
          decoding="async"
        />
      )}

      {/* Loading Indicator - only show when actually loading */}
      {isLoading && !currentImageUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/20 rounded-2xl">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}
