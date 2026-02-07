"use client"

import type React from "react"

import { useState, useEffect, useRef, memo } from "react"
import { Button } from "@/components/ui/button"
import { LyricsService, type LyricsData, type LyricLine } from "@/lib/lyrics-service"
import { Loader2, Mic, X, RefreshCw } from "lucide-react"
import type { Song } from "./enhanced-playlist"

interface LyricsDisplayProps {
  isVisible: boolean
  onClose: () => void
  currentSong: Song | null
  currentTimeMs: number
  forceRefresh?: number
}

const MemoizedLyricLine = memo(
  ({
    line,
    isCurrent,
    refProp,
  }: {
    line: LyricLine
    isCurrent: boolean
    refProp: React.RefObject<HTMLParagraphElement> | null
  }) => (
    <p
      ref={refProp}
      className={`
        transition-all duration-300 ease-in-out text-2xl font-semibold p-2 rounded-md
        w-full max-w-full break-words text-center leading-relaxed
        ${isCurrent ? "text-primary scale-105 bg-primary/10" : "text-muted-foreground opacity-70"}
      `}
    >
      {line.text}
    </p>
  ),
)
MemoizedLyricLine.displayName = "MemoizedLyricLine"

export function LyricsDisplay({ isVisible, onClose, currentSong, currentTimeMs, forceRefresh }: LyricsDisplayProps) {
  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFetchedSongId, setLastFetchedSongId] = useState<string | null>(null)

  const activeLineRef = useRef<HTMLParagraphElement>(null)
  const currentTimeInSeconds = currentTimeMs / 1000

  const fetchLyricsForSong = async (song: Song) => {
    if (!song || !song.artist || !song.title || !song.duration) {
      setError("Not enough song information to find lyrics.")
      return
    }

    setIsLoading(true)
    setError(null)
    setLyricsData(null)
    setLastFetchedSongId(song.id)

    try {
      const data = await LyricsService.fetchLyrics(song.artist, song.title, song.duration)

      if (data && (data.synced || data.plain)) {
        setLyricsData(data)
      } else {
        setError("No lyrics found for this song.")
      }
    } catch (e: any) {
      setError(e.message || "An error occurred while fetching lyrics.")
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (currentSong && isVisible && currentSong.id !== lastFetchedSongId) {
      fetchLyricsForSong(currentSong)
    }
  }, [currentSong, isVisible, lastFetchedSongId])

  // Force refresh when new songs are imported
  useEffect(() => {
    if (forceRefresh && currentSong && isVisible) {
      setLastFetchedSongId(null)
      fetchLyricsForSong(currentSong)
    }
  }, [forceRefresh, currentSong, isVisible])

  const currentLineIndex =
    lyricsData?.synced?.findIndex((line, index, arr) => {
      const nextLine = arr[index + 1]
      return currentTimeInSeconds >= line.time && (!nextLine || currentTimeInSeconds < nextLine.time)
    }) ?? -1

  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
    }
  }, [currentLineIndex])

  const handleRetry = () => {
    if (currentSong) {
      fetchLyricsForSong(currentSong)
    }
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <Loader2 className="w-12 h-12 animate-spin mb-4" />
          <p>Searching for lyrics...</p>
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-destructive">
          <X className="w-12 h-12 mb-4" />
          <p className="text-lg font-semibold text-center">{error}</p>
          <Button onClick={handleRetry} variant="outline" className="mt-4 bg-transparent">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>
      )
    }

    if (lyricsData?.synced && lyricsData.synced.length > 0) {
      return (
        <div className="text-center space-y-4 w-full max-w-full">
          {lyricsData.synced.map((line, index) => (
            <MemoizedLyricLine
              key={`${line.time}-${index}`}
              line={line}
              isCurrent={index === currentLineIndex}
              refProp={index === currentLineIndex ? activeLineRef : null}
            />
          ))}
        </div>
      )
    }

    if (lyricsData?.plain) {
      return (
        <div className="whitespace-pre-wrap text-lg text-center leading-relaxed w-full max-w-full break-words">
          {lyricsData.plain}
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Mic className="w-12 h-12 mb-4" />
        <p>Select a song to see lyrics.</p>
      </div>
    )
  }

  return (
    <div className="h-[84vh] w-full flex flex-col bg-card/50 rounded-lg border overflow-hidden">
      <div className="flex flex-row items-center justify-between p-4 border-b shrink-0 min-h-0">
        <h2 className="text-xl font-bold flex items-center gap-2 truncate">
          <Mic className="w-5 h-5 flex-shrink-0" />
          <span className="truncate">Lyrics</span>
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="flex-shrink-0">
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 h-0 w-full">
        <div className="flex flex-col items-center justify-center min-h-full w-full max-w-full">{renderContent()}</div>
      </div>
    </div>
  )
}
