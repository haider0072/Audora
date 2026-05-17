"use client"

import { useState, useMemo, memo, useRef, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Music,
  Trash2,
  Search,
} from "lucide-react"
import type { AudioMetadata } from "@/lib/metadata-extractor"
import { AlbumArtDisplay } from "./album-art-display"
import { AlphabetSidebar, getArtistLetter } from "./alphabet-sidebar"

interface Song extends AudioMetadata {
  id: string
  file: File
  url: string
}

interface EnhancedPlaylistProps {
  songs: Song[]
  currentSong: Song | null
  onSongSelect: (song: Song) => void
  onSongRemove: (songId: string) => void
  isLoading?: boolean
  loadingProgress?: { current: number; total: number }
  viewMode: "grouped" | "list"
  onViewModeChange: (mode: "grouped" | "list") => void
  sortedSongs: Song[]
  sidebarMode?: "library" | "online"
  onSidebarModeChange?: (mode: "library" | "online") => void
  onlineSearchContent?: React.ReactNode
  activeDownloadCount?: number
  searchQuery?: string
}

interface GroupedSongs {
  [artist: string]: {
    [album: string]: Song[]
  }
}

// Memoized song item component to prevent unnecessary re-renders
const SongItem = memo(
  ({
    song,
    isCurrentSong,
    showArtistAlbum = false,
    onSongSelect,
    onSongRemove,
  }: {
    song: Song
    isCurrentSong: boolean
    showArtistAlbum?: boolean
    onSongSelect: (song: Song) => void
    onSongRemove: (songId: string) => void
  }) => {
    const formatTime = (time: number) => {
      const minutes = Math.floor(time / 60)
      const seconds = Math.floor(time % 60)
      return `${minutes}:${seconds.toString().padStart(2, "0")}`
    }

    return (
      <div
        className={`
          group relative flex w-full items-center gap-3 p-3 rounded-lg transition-all duration-150 ease-out cursor-pointer
          ${isCurrentSong ? "bg-primary/10 dark:bg-primary/15" : "hover:bg-muted/30 hover:shadow-sm"}
        `}
        onClick={() => onSongSelect(song)}
      >
        {/* Background overlay for smooth transitions */}
        <div
          className={`
            absolute inset-0 rounded-lg transition-all duration-150 ease-out
            ${!isCurrentSong ? "opacity-0 group-hover:opacity-100 bg-muted/20" : ""}
          `}
        />

        <div className="relative flex-shrink-0 z-10">
          <AlbumArtDisplay
            songId={song.id}
            albumArt={song.albumArt}
            title={`${song.title} album art`}
            size="small"
            className={`
              transition-transform duration-150 ease-out group-hover:scale-105
              ${isCurrentSong ? "ring-2 ring-primary/50" : ""}
            `}
          />
        </div>

        <div className="relative flex-1 min-w-0 z-10 overflow-hidden">
          <div className="flex items-center gap-2 mb-0.5 w-full">
            <h4
              className={`
                font-medium truncate transition-colors duration-150 ease-out flex-1 min-w-0
                ${isCurrentSong ? "text-primary" : "text-foreground group-hover:text-foreground"}
              `}
              title={song.title}
            >
              {song.title}
            </h4>
            {song.duration && (
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {formatTime(song.duration)}
              </span>
            )}
          </div>

          {showArtistAlbum && (
            <p
              className="text-sm text-muted-foreground truncate transition-colors duration-150 ease-out group-hover:text-muted-foreground/80 w-full"
              title={`${song.artists ? song.artists.join(", ") : (song.artist || "Unknown Artist")}${song.album ? ` • ${song.album}` : ""}`}
            >
              {song.artists ? song.artists.join(", ") : (song.artist || "Unknown Artist")}
              {song.album && ` • ${song.album}`}
            </p>
          )}
        </div>

        <div className="relative z-10 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className={`
              flex-shrink-0 transition-all duration-150 ease-out
              opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100
              hover:bg-destructive/10 hover:text-destructive
              ${isCurrentSong ? "opacity-60 hover:opacity-100" : ""}
            `}
            onClick={(e) => {
              e.stopPropagation()
              onSongRemove(song.id)
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        {/* Subtle border highlight for current song */}
        {isCurrentSong && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full" />
        )}
      </div>
    )
  },
)

SongItem.displayName = "SongItem"

export function EnhancedPlaylist({
  songs,
  currentSong,
  onSongSelect,
  onSongRemove,
  isLoading = false,
  loadingProgress = { current: 0, total: 0 },
  viewMode,
  onViewModeChange,
  sortedSongs,
  sidebarMode = "library",
  onSidebarModeChange,
  onlineSearchContent,
  activeDownloadCount = 0,
  searchQuery = "",
}: EnhancedPlaylistProps) {
  const [activeLetter, setActiveLetter] = useState("")
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  const formatTime = (time: number) => {
    const hours = Math.floor(time / 3600)
    const minutes = Math.floor((time % 3600) / 60)
    const seconds = Math.floor(time % 60)

    if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} min${minutes !== 1 ? 's' : ''}`
    }
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  // Memoized filtered songs to prevent unnecessary recalculations
  const filteredSongs = useMemo(() => {
    const songsToFilter = viewMode === "list" ? sortedSongs : songs

    if (!searchQuery.trim()) return songsToFilter

    const query = searchQuery.toLowerCase()
    return songsToFilter.filter(
      (song) =>
        song.title?.toLowerCase().includes(query) ||
        song.artist?.toLowerCase().includes(query) ||
        song.album?.toLowerCase().includes(query) ||
        song.genre?.toLowerCase().includes(query),
    )
  }, [songs, sortedSongs, searchQuery, viewMode])

  // Memoized grouped songs to prevent unnecessary recalculations
  const groupedSongs = useMemo(() => {
    if (viewMode === "list") return {}

    const parseYear = (y?: string): number => {
      if (!y) return Infinity
      const match = y.match(/\d{4}/)
      return match ? parseInt(match[0], 10) : Infinity
    }
    const parseTrack = (t?: string): number => {
      if (!t) return Infinity
      const n = parseInt(t, 10)
      return Number.isNaN(n) ? Infinity : n
    }

    const grouped: GroupedSongs = {}
    const artistKeyToDisplay = new Map<string, string>()
    const albumKeyToDisplay = new Map<string, string>()
    const albumYearByDisplayKey = new Map<string, number>()

    filteredSongs.forEach((song) => {
      const artistRaw = (song.artists?.[0] || song.artist || "Unknown Artist").trim()
      const albumRaw = (song.album || "Unknown Album").trim()
      const artistKey = artistRaw.toLowerCase()
      const albumKey = `${artistKey}::${albumRaw.toLowerCase()}`

      if (!artistKeyToDisplay.has(artistKey)) {
        artistKeyToDisplay.set(artistKey, artistRaw)
      }
      if (!albumKeyToDisplay.has(albumKey)) {
        albumKeyToDisplay.set(albumKey, albumRaw)
      }
      const artistDisplay = artistKeyToDisplay.get(artistKey)!
      const albumDisplay = albumKeyToDisplay.get(albumKey)!
      const displayPairKey = `${artistDisplay}::${albumDisplay}`

      const songYear = parseYear(song.year)
      const existingYear = albumYearByDisplayKey.get(displayPairKey)
      if (existingYear === undefined || (existingYear === Infinity && songYear !== Infinity)) {
        albumYearByDisplayKey.set(displayPairKey, songYear)
      }

      if (!grouped[artistDisplay]) {
        grouped[artistDisplay] = {}
      }
      if (!grouped[artistDisplay][albumDisplay]) {
        grouped[artistDisplay][albumDisplay] = []
      }
      grouped[artistDisplay][albumDisplay].push(song)
    })

    // Sort artists alphabetically; albums by year (oldest first, missing last); songs by track number
    const sortedGrouped: GroupedSongs = {}
    Object.keys(grouped)
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .forEach((artist) => {
        sortedGrouped[artist] = {}
        Object.keys(grouped[artist])
          .sort((a, b) => {
            const yA = albumYearByDisplayKey.get(`${artist}::${a}`) ?? Infinity
            const yB = albumYearByDisplayKey.get(`${artist}::${b}`) ?? Infinity
            if (yA !== yB) return yA - yB
            return a.toLowerCase().localeCompare(b.toLowerCase())
          })
          .forEach((album) => {
            sortedGrouped[artist][album] = grouped[artist][album].sort((a, b) => {
              const tA = parseTrack(a.trackNumber)
              const tB = parseTrack(b.trackNumber)
              if (tA !== tB) return tA - tB
              return (a.title || "").localeCompare(b.title || "")
            })
          })
      })

    return sortedGrouped
  }, [filteredSongs, viewMode])

  const letterData = useMemo(() => {
    const available = new Set<string>()
    const boundaryIndices = new Map<number, string>()
    const firstArtistOfLetter = new Set<string>()

    if (viewMode === "list") {
      let lastLetter = ""
      filteredSongs.forEach((song, index) => {
        const artist = song.artists?.[0] || song.artist || "Unknown Artist"
        const letter = getArtistLetter(artist)
        available.add(letter)
        if (letter !== lastLetter) {
          boundaryIndices.set(index, letter)
          lastLetter = letter
        }
      })
    } else {
      let lastLetter = ""
      Object.keys(groupedSongs).forEach((artist) => {
        const letter = getArtistLetter(artist)
        available.add(letter)
        if (letter !== lastLetter) {
          firstArtistOfLetter.add(artist)
          lastLetter = letter
        }
      })
    }

    return { available, boundaryIndices, firstArtistOfLetter }
  }, [filteredSongs, groupedSongs, viewMode])

  const handleLetterClick = useCallback((letter: string) => {
    const container = scrollAreaRef.current
    if (!container) return
    const viewport = container.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null
    if (!viewport) return
    const marker = container.querySelector(`[data-letter-marker="${letter}"]`) as HTMLElement | null
    if (marker) {
      viewport.scrollTo({ top: marker.offsetTop, behavior: "smooth" })
    }
  }, [])

  useEffect(() => {
    const container = scrollAreaRef.current
    if (!container) return

    const viewport = container.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement | null
    if (!viewport) return

    const updateActiveLetter = () => {
      const markers =
        container.querySelectorAll<HTMLElement>("[data-letter-marker]")
      if (markers.length === 0) return

      const viewportTop = viewport.getBoundingClientRect().top
      let current = markers[0].getAttribute("data-letter-marker") || ""

      for (const marker of markers) {
        if (marker.getBoundingClientRect().top <= viewportTop + 50) {
          current = marker.getAttribute("data-letter-marker") || ""
        } else {
          break
        }
      }

      if (current) setActiveLetter(current)
    }

    viewport.addEventListener("scroll", updateActiveLetter, { passive: true })
    requestAnimationFrame(updateActiveLetter)

    return () => viewport.removeEventListener("scroll", updateActiveLetter)
  }, [filteredSongs, groupedSongs, viewMode])

  return (
    <Card className="h-full bg-transparent border-none shadow-none flex flex-col overflow-hidden">
      <CardContent className="flex-1 overflow-hidden p-0 px-6 flex flex-col">
        {/* Online Search Mode */}
        {sidebarMode === "online" && onlineSearchContent ? (
          <div className="flex-1 min-h-0">{onlineSearchContent}</div>
        ) : (
        <>
        {/* Loading State */}
        {isLoading && (
          <div className="mb-4 p-4 bg-muted/50 rounded-lg flex-shrink-0">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium">Loading songs...</span>
              <span>
                {loadingProgress.current} / {loadingProgress.total}
              </span>
            </div>
            <div className="w-full bg-background rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${loadingProgress.total > 0 ? (loadingProgress.current / loadingProgress.total) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Processing audio files and extracting metadata...</p>
          </div>
        )}

        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0">
          <ScrollArea className="h-full w-full" ref={scrollAreaRef}>
          <div className="space-y-2 pr-4 pb-10 w-full">
            {songs.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Music className="w-12 h-12 mx-auto mb-4 opacity-50 " />
                <p>No songs in playlist</p>
                <p className="text-sm">Add some music files to get started</p>
              </div>
            ) : filteredSongs.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No songs found</p>
                <p className="text-sm">Try adjusting your search terms</p>
              </div>
            ) : viewMode === "list" ? (
              // List view - sorted by artist
              <div className="space-y-1 w-full">
                <div className="text-xs text-muted-foreground mb-2 px-3">Sorted by Artist</div>
                {filteredSongs.map((song, index) => (
                  <div
                    key={song.id}
                    className="w-full"
                    {...(letterData.boundaryIndices.has(index)
                      ? { "data-letter-marker": letterData.boundaryIndices.get(index) }
                      : {})}
                  >
                    <SongItem
                      song={song}
                      isCurrentSong={currentSong?.id === song.id}
                      showArtistAlbum={true}
                      onSongSelect={onSongSelect}
                      onSongRemove={onSongRemove}
                    />
                  </div>
                ))}
              </div>
            ) : (
              // Grouped view
              <div className="w-full">
                {Object.entries(groupedSongs).map(([artist, albums]) => (
                  <div
                    key={artist}
                    className="space-y-3 mb-6 w-full"
                    {...(letterData.firstArtistOfLetter.has(artist)
                      ? { "data-letter-marker": getArtistLetter(artist) }
                      : {})}
                  >
                    <div className="sticky top-0 z-20 py-3 pl-4 -mx-4">
                      <div className="bg-background/80 backdrop-blur-md border border-border/50 rounded-lg px-4 py-2 shadow-sm flex items-center justify-between gap-3">
                        <h3 className="font-semibold text-lg truncate text-foreground" title={artist}>
                          {artist}
                        </h3>
                        {(() => {
                          const count = Object.values(albums).reduce((sum, songs) => sum + songs.length, 0)
                          return (
                            <span className="text-xs text-muted-foreground flex-shrink-0 tabular-nums">
                              {count} {count === 1 ? "song" : "songs"}
                            </span>
                          )
                        })()}
                      </div>
                    </div>

                    {Object.entries(albums).map(([album, albumSongs]) => (
                      <div key={`${artist}-${album}`} className="ml-4 space-y-2 w-full">
                        <div className="flex items-center justify-between gap-3 pl-2">
                          <h4
                            className="font-medium text-muted-foreground text-sm uppercase tracking-wide truncate"
                            title={album}
                          >
                            {album}
                          </h4>
                          <span className="text-xs text-muted-foreground/70 flex-shrink-0 tabular-nums">
                            {albumSongs.length} {albumSongs.length === 1 ? "song" : "songs"}
                          </span>
                        </div>
                        <div className="space-y-1 w-full">
                          {albumSongs.map((song) => (
                            <div key={song.id} className="w-full">
                              <SongItem
                                song={song}
                                isCurrentSong={currentSong?.id === song.id}
                                onSongSelect={onSongSelect}
                                onSongRemove={onSongRemove}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
        </div>
          {filteredSongs.length > 0 && letterData.available.size > 1 && (
            <div className="flex items-center flex-shrink-0">
              <AlphabetSidebar
                availableLetters={letterData.available}
                activeLetter={activeLetter}
                onLetterClick={handleLetterClick}
              />
            </div>
          )}
        </div>
        </>
        )}
      </CardContent>
    </Card>
  )
}

export type { Song }
