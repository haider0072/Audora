"use client"

import { useState, useEffect, useRef } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { LyricsService, type LyricsData } from "@/lib/lyrics-service"
import { Loader2, Mic, X, RefreshCw } from "lucide-react"
import type { Song } from "@/components/players/mobile-music-player"

interface MobileLyricsDisplayProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  currentSong: Song | null
  currentTimeMs: number
  isPlaying: boolean
  forceRefresh?: number
}

export function MobileLyricsDisplay({ isOpen, onOpenChange, currentSong, currentTimeMs, forceRefresh }: MobileLyricsDisplayProps) {
  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFetchedSongId, setLastFetchedSongId] = useState<string | null>(null)

  const scrollAreaRef = useRef<HTMLDivElement>(null)
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
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (currentSong && isOpen && currentSong.id !== lastFetchedSongId) {
      fetchLyricsForSong(currentSong)
    }
  }, [currentSong, isOpen, lastFetchedSongId])

  // Force refresh when new songs are imported
  useEffect(() => {
    if (forceRefresh && currentSong && isOpen) {
      setLastFetchedSongId(null)
      fetchLyricsForSong(currentSong)
    }
  }, [forceRefresh, currentSong, isOpen])

  const currentLineIndex =
    lyricsData?.synced?.findIndex((line, index, arr) => {
      const nextLine = arr[index + 1]
      return currentTimeInSeconds >= line.time && (!nextLine || currentTimeInSeconds < nextLine.time)
    }) ?? -1

  useEffect(() => {
    if (activeLineRef.current && scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector("div")
      if (scrollContainer) {
        const lineTop = activeLineRef.current.offsetTop
        const containerHeight = scrollContainer.clientHeight
        const scrollTop = lineTop - containerHeight / 2 + activeLineRef.current.clientHeight / 2
        scrollContainer.scrollTo({ top: scrollTop, behavior: "smooth" })
      }
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
          <Loader2 className="w-10 h-10 animate-spin mb-4" />
          <p>Searching for lyrics...</p>
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-destructive">
          <X className="w-10 h-10 mb-4" />
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
        <div className="text-center space-y-4">
          {lyricsData.synced.map((line, index) => (
            <p
              key={`${line.time}-${index}`}
              ref={index === currentLineIndex ? activeLineRef : null}
              className={`transition-all duration-300 ease-in-out text-xl font-semibold p-2 rounded-md ${
                index === currentLineIndex ? "text-primary scale-105 bg-primary/10" : "text-muted-foreground opacity-70"
              }`}
            >
              {line.text}
            </p>
          ))}
        </div>
      )
    }

    if (lyricsData?.plain) {
      return <div className="whitespace-pre-wrap text-md text-center leading-relaxed">{lyricsData.plain}</div>
    }

    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Mic className="w-10 h-10 mb-4" />
        <p>Select a song to see lyrics.</p>
      </div>
    )
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Mic className="w-5 h-5" />
            Lyrics
          </SheetTitle>
          <SheetDescription>
            {currentSong ? `${currentSong.title} - ${currentSong.artist}` : "No song selected"}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full" ref={scrollAreaRef}>
            <div className="p-4">{renderContent()}</div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  )
}
