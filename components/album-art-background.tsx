"use client"

import { useState, useEffect, useMemo } from "react"
import { AlbumArtCache } from "@/lib/album-art-cache"
import { ColorExtractor } from "@/lib/color-extractor"

interface AlbumArtBackgroundProps {
  albumArt?: string
  songId?: string
  isTransitioning?: boolean
  positioning?: "fixed" | "absolute"
}

export function AlbumArtBackground({ albumArt, songId, isTransitioning = false, positioning = "fixed" }: AlbumArtBackgroundProps) {
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null)
  const [dominantColor, setDominantColor] = useState<string>("#1a1a1a")
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true) // eslint-disable-line react-hooks/set-state-in-effect -- mount detection pattern
  }, [])

  useEffect(() => {
    if (!isMounted || !songId || !albumArt) {
      setBackgroundImage(null) // eslint-disable-line react-hooks/set-state-in-effect -- cleanup on unmount/missing data
      setDominantColor("#1a1a1a") // eslint-disable-line react-hooks/set-state-in-effect
      return
    }

    const loadBackgroundImage = async () => {
      try {
        // Try to get from cache first
        let cachedUrl = AlbumArtCache.getCachedAlbumArt(songId)

        if (!cachedUrl) {
          // Preload if not cached
          cachedUrl = await AlbumArtCache.preloadAlbumArt(songId, albumArt)
        }

        if (cachedUrl) {
          setBackgroundImage(cachedUrl)

          // Extract dominant color for background tinting
          try {
            const color = await ColorExtractor.extractDominantColor(cachedUrl)
            setDominantColor(color)
          } catch (error) {
            console.error("Error extracting dominant color:", error)
            setDominantColor("#1a1a1a")
          }
        }
      } catch (error) {
        console.error("Error loading background image:", error)
        setBackgroundImage(null)
        setDominantColor("#1a1a1a")
      }
    }

    loadBackgroundImage()
  }, [albumArt, songId, isMounted])

  // Memoize color variations (must be before early returns to satisfy hook ordering rules)
  const { lightColor, darkColor, veryDarkColor } = useMemo(() => ({
    lightColor: ColorExtractor.lightenColor(dominantColor, 20),
    darkColor: ColorExtractor.darkenColor(dominantColor, 40),
    veryDarkColor: ColorExtractor.darkenColor(dominantColor, 60),
  }), [dominantColor])

  const pos = positioning
  const z = positioning === "fixed"
    ? { bg: "-z-30", color: "-z-20", texture: "-z-10", dark: "-z-10", fallback: "-z-20" }
    : { bg: "", color: "", texture: "", dark: "", fallback: "" }

  if (!isMounted) {
    return <div className={`${pos} inset-0 bg-gradient-to-br from-gray-900 via-gray-900/95 to-black ${z.fallback}`} />
  }

  if (!backgroundImage) {
    return <div className={`${pos} inset-0 bg-gradient-to-br from-gray-900 via-gray-900/95 to-black ${z.fallback}`} />
  }

  return (
    <>
      {/* Background Image with Blur */}
      <div
        className={`${pos} inset-0 ${z.bg} transition-all duration-1000 ease-out ${
          isTransitioning ? "scale-105 opacity-20" : "scale-100 opacity-30"
        }`}
        style={{
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          filter: "blur(40px) saturate(1.2)",
        }}
      />

      {/* Color Tinted Overlay */}
      <div
        className={`${pos} inset-0 ${z.color} transition-all duration-1000 ease-out ${
          isTransitioning ? "opacity-70" : "opacity-85"
        }`}
        style={{
          background: `
            radial-gradient(circle at 30% 20%, ${lightColor}15 0%, transparent 50%),
            radial-gradient(circle at 70% 80%, ${dominantColor}20 0%, transparent 50%),
            linear-gradient(135deg,
              ${veryDarkColor}90 0%,
              ${darkColor}85 25%,
              ${dominantColor}25 50%,
              ${darkColor}90 75%,
              ${veryDarkColor}95 100%
            )
          `,
        }}
      />

      {/* Additional subtle texture overlay */}
      <div
        className={`${pos} inset-0 ${z.texture} opacity-40`}
        style={{
          background: `
            radial-gradient(circle at 20% 50%, ${dominantColor}10 0%, transparent 30%),
            radial-gradient(circle at 80% 50%, ${lightColor}08 0%, transparent 30%),
            linear-gradient(45deg, transparent 48%, ${dominantColor}05 50%, transparent 52%)
          `,
        }}
      />

      {/* Final dark overlay for text readability */}
      <div className={`${pos} inset-0 bg-black/20 ${z.dark}`} />
    </>
  )
}
