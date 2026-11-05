"use client"

import { useEffect, useMemo, useState } from "react"
import { AlbumArtCache } from "@/lib/album-art-cache"
import { ColorExtractor } from "@/lib/color-extractor"

/** The tint behind a song whose cover gives no colour. */
const FALLBACK_COLOR = "#1a1a1a"

interface AlbumArtBackgroundProps {
  albumArt?: string
  songId?: string
  isTransitioning?: boolean
}

interface BackgroundArt {
  url: string
  color: string
}

/** The song's cover and its colour, when the cache already holds the cover; null otherwise. */
function cachedArt(songId?: string, albumArt?: string): BackgroundArt | null {
  if (!songId || !albumArt) return null
  const url = AlbumArtCache.getCachedAlbumArt(songId)
  return url ? { url, color: ColorExtractor.getCachedColor(url) ?? FALLBACK_COLOR } : null
}

async function loadArt(songId: string, albumArt: string): Promise<BackgroundArt | null> {
  const url = AlbumArtCache.getCachedAlbumArt(songId) ?? (await AlbumArtCache.preloadAlbumArt(songId, albumArt))
  if (!url) return null
  try {
    return { url, color: ColorExtractor.getCachedColor(url) ?? (await ColorExtractor.extractDominantColor(url)) }
  } catch (error) {
    console.error("Error extracting dominant color:", error)
    return { url, color: FALLBACK_COLOR }
  }
}

/** The phone player's backdrop: the cover, blurred and tinted in its colour, fixed behind everything. */
export function AlbumArtBackground({ albumArt, songId, isTransitioning = false }: AlbumArtBackgroundProps) {
  // Mounted over a song whose cover is already cached, it starts with that
  // cover rather than flashing ink first.
  const [art, setArt] = useState(() => cachedArt(songId, albumArt))

  // A new song's cover replaces the last one once it has loaded, so the
  // background never falls back to ink between two songs.
  useEffect(() => {
    if (!songId || !albumArt) return
    let current = true
    loadArt(songId, albumArt)
      .then((loaded) => {
        if (current) setArt(loaded)
      })
      .catch((error: unknown) => {
        console.error("Error loading background image:", error)
        if (current) setArt(null)
      })
    return () => {
      current = false
    }
  }, [albumArt, songId])

  const shown = songId && albumArt ? art : null
  const dominantColor = shown?.color ?? FALLBACK_COLOR

  // Memoize color variations (must be before early returns to satisfy hook ordering rules)
  const { lightColor, darkColor, veryDarkColor } = useMemo(() => ({
    lightColor: ColorExtractor.lightenColor(dominantColor, 20),
    darkColor: ColorExtractor.darkenColor(dominantColor, 40),
    veryDarkColor: ColorExtractor.darkenColor(dominantColor, 60),
  }), [dominantColor])

  // Shown when the song has no art: plain ink, dark in both themes.
  if (!shown) {
    return <div className="fixed inset-0 -z-20 bg-gradient-to-br from-ink-2 via-ink-2/95 to-ink-0" />
  }

  return (
    <>
      {/* Ink beneath it all, so a light theme's page never shows through the cover. */}
      <div className="fixed inset-0 -z-40 bg-ink-0" />

      {/* Background Image with Blur */}
      <div
        className={`fixed inset-0 -z-30 transition-all duration-1000 ease-out ${
          isTransitioning ? "scale-105 opacity-20" : "scale-100 opacity-30"
        }`}
        style={{
          backgroundImage: `url(${shown.url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          filter: "blur(40px) saturate(1.2)",
        }}
      />

      {/* Color Tinted Overlay */}
      <div
        className={`fixed inset-0 -z-20 transition-all duration-1000 ease-out ${
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
        className="fixed inset-0 -z-10 opacity-40"
        style={{
          background: `
            radial-gradient(circle at 20% 50%, ${dominantColor}10 0%, transparent 30%),
            radial-gradient(circle at 80% 50%, ${lightColor}08 0%, transparent 30%),
            linear-gradient(45deg, transparent 48%, ${dominantColor}05 50%, transparent 52%)
          `,
        }}
      />

      {/* The last layer keeps text readable over any cover: even under a white
          one, muted text over it holds 4.5:1. */}
      <div className="fixed inset-0 -z-10 bg-ink-0/60" />
    </>
  )
}
