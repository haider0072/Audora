"use client"

import { useEffect, useMemo, useState, type CSSProperties } from "react"

import { AlbumArtCache } from "@/lib/album-art-cache"
import { accentColor, paletteFromPixels, ringColors, type SongPalette } from "@/lib/song-palette"

/** Covers are read at this size: every hue that matters survives, and the read costs nothing. */
const SAMPLE_SIZE = 24

interface CoverSource {
  id: string
  albumArt?: string
  albumArtThumb?: string
}

/** A cover's colours never change, so each image is read once per session. Keyed by image URL. */
const palettes = new Map<string, SongPalette | null>()

let sampler: CanvasRenderingContext2D | null | undefined

function samplePixels(image: CanvasImageSource): Uint8ClampedArray | null {
  if (sampler === undefined) {
    const canvas = document.createElement("canvas")
    canvas.width = SAMPLE_SIZE
    canvas.height = SAMPLE_SIZE
    sampler = canvas.getContext("2d", { willReadFrequently: true })
  }
  if (!sampler) return null
  sampler.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
  sampler.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
  return sampler.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data
}

/**
 * The image to read and the art-cache entry it lives under. The list thumbnail
 * is preferred: it holds the same colours as the full cover for a fraction of
 * the bytes to decode. Its cache key matches `AlbumArtDisplay`'s.
 */
function coverOf(song: CoverSource): { cacheKey: string; url: string } | null {
  if (song.albumArtThumb) return { cacheKey: `${song.id}::thumb`, url: song.albumArtThumb }
  if (song.albumArt) return { cacheKey: song.id, url: song.albumArt }
  return null
}

/**
 * Decodes the cover off the main thread, straight to the sample size. Unlike
 * `HTMLImageElement.decode()`, this does not wait for the page to render a
 * frame: a song that changes while the app is in the background still gets its
 * colours, rather than leaving a read (and its cache pin) pending until the
 * window comes back.
 */
async function decodeSample(url: string): Promise<ImageBitmap> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Cover request failed with status ${response.status}`)
  return createImageBitmap(await response.blob(), {
    resizeWidth: SAMPLE_SIZE,
    resizeHeight: SAMPLE_SIZE,
    resizeQuality: "high",
  })
}

async function readPalette(cacheKey: string, url: string): Promise<SongPalette | null> {
  const resolved = await AlbumArtCache.preloadAlbumArt(cacheKey, url)
  if (!resolved) return null
  try {
    const bitmap = await decodeSample(resolved)
    try {
      const pixels = samplePixels(bitmap)
      return pixels ? paletteFromPixels(pixels) : null
    } finally {
      bitmap.close()
    }
  } finally {
    // Holding the cache reference only while reading keeps the entry evictable.
    AlbumArtCache.releaseAlbumArt(cacheKey)
  }
}

/**
 * The song's colours as CSS custom properties, for a `.song-scope` element to
 * turn into `--song-accent` and, while playing, the wordmark ring's lights.
 * Undefined until the cover has been read, and for a song whose cover has no
 * colour to speak of: the scope then falls back to the neutral accent.
 */
export function useSongColors(song: CoverSource | null): CSSProperties | undefined {
  const cover = song ? coverOf(song) : null
  const cacheKey = cover?.cacheKey
  const url = cover?.url
  const [loaded, setLoaded] = useState<{ url: string; palette: SongPalette | null } | null>(null)

  useEffect(() => {
    if (!cacheKey || !url || palettes.has(url)) return
    let current = true
    readPalette(cacheKey, url)
      .then((palette) => {
        palettes.set(url, palette)
        if (current) setLoaded({ url, palette })
      })
      .catch((error: unknown) => {
        // A cover that cannot be read keeps the neutral accent; there is nothing to retry.
        console.warn("Could not read the cover's colours:", error)
        palettes.set(url, null)
        if (current) setLoaded({ url, palette: null })
      })
    return () => {
      current = false
    }
  }, [cacheKey, url])

  const palette = url ? (palettes.get(url) ?? (loaded?.url === url ? loaded.palette : null)) : null

  return useMemo(() => {
    if (!palette) return undefined
    const [inkRing1, inkRing2, inkRing3] = ringColors(palette, "ink")
    const [paperRing1, paperRing2, paperRing3] = ringColors(palette, "paper")
    return {
      "--song-accent-on-ink": accentColor(palette, "ink"),
      "--song-accent-on-paper": accentColor(palette, "paper"),
      "--song-ring-1-on-ink": inkRing1,
      "--song-ring-2-on-ink": inkRing2,
      "--song-ring-3-on-ink": inkRing3,
      "--song-ring-1-on-paper": paperRing1,
      "--song-ring-2-on-paper": paperRing2,
      "--song-ring-3-on-paper": paperRing3,
    } as CSSProperties
  }, [palette])
}
