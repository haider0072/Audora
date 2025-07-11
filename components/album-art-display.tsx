"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Music } from "lucide-react"
import { AlbumArtCache } from "../utils/album-art-cache"

interface AlbumArtDisplayProps {
  songId?: string
  albumArt?: string
  title?: string
  isTransitioning?: boolean
  className?: string
  size?: "small" | "medium" | "large"
  showFallback?: boolean
}

export function AlbumArtDisplay({
  songId,
  albumArt,
  title = "Album Art",
  isTransitioning = false,
  className = "",
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

  const sizeClasses = {
    small: "w-12 h-12",
    medium: "w-16 h-16",
    large: "w-48 h-48",
  }

  // Handle client-side mounting
  useEffect(() => {
    setIsMounted(true)
  }, [])

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
      if (currentSongIdRef.current === targetSongId && currentImageUrl && !hasError) {
        AlbumArtCache.markAsStable(targetSongId)
        return
      }

      isLoadingRef.current = true

      // Clear any existing loading timeout
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
      }

      // Only show loading for new images, not when switching between existing ones
      if (!currentImageUrl || currentSongIdRef.current !== targetSongId) {
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

        // Only update if this is still the target song (prevent race conditions)
        if (cachedUrl && targetSongId === songId) {
          // Release previous reference
          cleanupCurrentImage()

          setCurrentImageUrl(cachedUrl)
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
    [songId, currentImageUrl, hasError, cleanupCurrentImage],
  )

  // Main effect for loading album art - only trigger when necessary
  useEffect(() => {
    if (!isMounted || !songId || !albumArt) {
      cleanupCurrentImage()
      setCurrentImageUrl(null)
      setHasError(false)
      setIsLoading(false)
      currentSongIdRef.current = undefined
      isLoadingRef.current = false
      return
    }

    // Only load if we don't have this image already
    if (currentSongIdRef.current !== songId || !currentImageUrl || hasError) {
      loadAlbumArt(songId, albumArt)
    } else {
      // Just mark as stable if we already have the right image
      AlbumArtCache.markAsStable(songId)
    }
  }, [songId, albumArt, isMounted, loadAlbumArt, currentImageUrl, hasError])

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

  // Handle image load errors
  const handleImageError = useCallback(() => {
    console.warn(`Failed to load album art for song: ${songId}`)
    setHasError(true)
    setIsLoading(false)
    isLoadingRef.current = false
  }, [songId])

  // Handle image load success
  const handleImageLoad = useCallback(() => {
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
    <div className={`relative ${sizeClasses[size]} ${className}`}>
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
