"use client"

import { useState, useMemo, memo, useRef, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Music,
  Play,
  Trash2,
  Clock,
  Search,
  List,
  Globe,
  Library,
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

    const formatBitrate = (bitrate?: number) => {
      if (!bitrate) return "Unknown"
      if (bitrate >= 1000) {
        return `${(bitrate / 1000).toFixed(1)}M`
      }
      return `${Math.round(bitrate)}k`
    }

    return (
      <div
        className={`
          group relative flex w-full items-center gap-3 p-3 rounded-lg transition-all duration-150 ease-out cursor-pointer
          ${
            isCurrentSong
              ? "bg-primary/10 border border-primary/30 dark:bg-primary/15 dark:border-primary/40"
              : "border border-transparent hover:border-border/50"
          }
          ${!isCurrentSong ? "hover:bg-muted/30 hover:shadow-sm" : ""}
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
          <div className="flex items-center gap-2 mb-1 w-full">
            <h4
              className={`
                font-medium truncate transition-colors duration-150 ease-out flex-1 min-w-0
                ${isCurrentSong ? "text-primary" : "text-foreground group-hover:text-foreground"}
              `}
              title={song.title}
            >
              {song.title}
            </h4>
            {isCurrentSong && (
              <div className="flex-shrink-0">
                <Play className="w-4 h-4 text-primary" />
              </div>
            )}
          </div>

          {showArtistAlbum && (
            <p
              className="text-sm text-muted-foreground truncate transition-colors duration-150 ease-out group-hover:text-muted-foreground/80 mb-1 w-full"
              title={`${song.artists ? song.artists.join(", ") : (song.artist || "Unknown Artist")}${song.album ? ` • ${song.album}` : ""}`}
            >
              {song.artists ? song.artists.join(", ") : (song.artist || "Unknown Artist")}
              {song.album && ` • ${song.album}`}
            </p>
          )}

          <div className="flex items-center gap-2 mt-1 flex-wrap w-full">
            <Badge
              variant="outline"
              className={`
                text-xs transition-all duration-150 ease-out flex-shrink-0
                ${
                  isCurrentSong
                    ? "border-primary/30 text-primary bg-primary/5"
                    : "group-hover:border-border group-hover:bg-muted/50"
                }
              `}
            >
              {song.format}
            </Badge>
            {song.isHiRes && (
              <Badge
                variant="secondary"
                className={`
                  text-xs transition-all duration-150 ease-out flex-shrink-0
                  ${
                    isCurrentSong
                      ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100 border-green-200 dark:border-green-800"
                      : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 group-hover:bg-green-200 dark:group-hover:bg-green-800"
                  }
                `}
              >
                Hi-Res
              </Badge>
            )}
            <span className="text-xs text-muted-foreground transition-colors duration-150 ease-out group-hover:text-muted-foreground/80 flex-shrink-0">
              {formatBitrate(song.bitrate)}bps
            </span>
            {song.duration && (
              <span className="text-xs text-muted-foreground transition-colors duration-150 ease-out group-hover:text-muted-foreground/80 flex-shrink-0">
                {formatTime(song.duration)}
              </span>
            )}
          </div>
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
}: EnhancedPlaylistProps) {
  const [searchQuery, setSearchQuery] = useState("")
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

  const getTotalDuration = () => {
    return songs.reduce((total, song) => total + (song.duration || 0), 0)
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

    const grouped: GroupedSongs = {}

    filteredSongs.forEach((song) => {
      const artist = song.artists?.[0] || song.artist || "Unknown Artist"
      const album = song.album || "Unknown Album"

      if (!grouped[artist]) {
        grouped[artist] = {}
      }
      if (!grouped[artist][album]) {
        grouped[artist][album] = []
      }
      grouped[artist][album].push(song)
    })

    // Sort artists alphabetically
    const sortedGrouped: GroupedSongs = {}
    Object.keys(grouped)
      .sort()
      .forEach((artist) => {
        sortedGrouped[artist] = {}
        // Sort albums alphabetically within each artist
        Object.keys(grouped[artist])
          .sort()
          .forEach((album) => {
            // Sort songs within each album by track number or title
            sortedGrouped[artist][album] = grouped[artist][album].sort((a, b) => {
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
      <CardHeader className="flex-shrink-0 pb-4">
        <div className="space-y-3">
          {/* Sidebar Mode Tabs */}
          {onSidebarModeChange && (
            <Tabs value={sidebarMode} onValueChange={(v) => onSidebarModeChange(v as "library" | "online")}>
              <TabsList className="w-full h-9">
                <TabsTrigger value="library" className="flex-1 gap-1.5 text-xs">
                  <Library className="h-3.5 w-3.5" />
                  My Library
                </TabsTrigger>
                <TabsTrigger value="online" className="flex-1 gap-1.5 text-xs relative">
                  <Globe className="h-3.5 w-3.5" />
                  Search Online
                  {activeDownloadCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 text-[10px] font-bold bg-blue-500 text-white rounded-full flex items-center justify-center">
                      {activeDownloadCount}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {/* Library mode: Search and Controls */}
          {sidebarMode === "library" && (
            <>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search songs, artists, albums..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex items-center border rounded-md overflow-hidden flex-shrink-0">
                  <Button
                    variant={viewMode === "grouped" ? "default" : "ghost"}
                    size="icon"
                    onClick={() => onViewModeChange("grouped")}
                    className="h-9 w-9 rounded-none"
                    title="Grouped view"
                  >
                    <Music className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "default" : "ghost"}
                    size="icon"
                    onClick={() => onViewModeChange("list")}
                    className="h-9 w-9 rounded-none"
                    title="List view (by Artist)"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{songs.length} song{songs.length !== 1 ? "s" : ""}</span>
                <span>·</span>
                <Clock className="w-3.5 h-3.5" />
                <span>{formatTime(getTotalDuration())}</span>
              </div>
            </>
          )}
        </div>
      </CardHeader>

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
                      <div className="bg-background/80 backdrop-blur-md border border-border/50 rounded-lg px-4 py-2 shadow-sm">
                        <h3 className="font-semibold text-lg truncate text-foreground" title={artist}>
                          {artist}
                        </h3>
                      </div>
                    </div>

                    {Object.entries(albums).map(([album, albumSongs]) => (
                      <div key={`${artist}-${album}`} className="ml-4 space-y-2 w-full">
                        <h4
                          className="font-medium text-muted-foreground text-sm uppercase tracking-wide truncate pl-2"
                          title={album}
                        >
                          {album}
                        </h4>
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
