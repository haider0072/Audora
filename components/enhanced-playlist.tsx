"use client"

import { useState, useMemo, memo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Music,
  Play,
  Trash2,
  Clock,
  Search,
  Shuffle,
  ShuffleIcon as ShuffleOff,
  List,
  RotateCcw,
  AlertTriangle,
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import type { AudioMetadata } from "../utils/metadata-extractor"
import { AlbumArtDisplay } from "./album-art-display"

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
  onPlaylistReset: () => void
  shuffleMode: boolean
  onShuffleToggle: () => void
  isLoading?: boolean
  loadingProgress?: { current: number; total: number }
  viewMode: "grouped" | "list"
  onViewModeChange: (mode: "grouped" | "list") => void
  sortedSongs: Song[]
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

        <div className="relative flex-1 min-w-0 z-10">
          <div className="flex items-center gap-2 mb-1">
            <h4
              className={`
              font-medium truncate transition-colors duration-150 ease-out
              ${isCurrentSong ? "text-primary" : "text-foreground group-hover:text-foreground"}
            `}
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
            <p className="text-sm text-muted-foreground truncate transition-colors duration-150 ease-out group-hover:text-muted-foreground/80">
              {song.artist || "Unknown Artist"}
              {song.album && ` • ${song.album}`}
            </p>
          )}

          <div className="flex items-center gap-2 mt-1">
            <Badge
              variant="outline"
              className={`
              text-xs transition-all duration-150 ease-out
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
                text-xs transition-all duration-150 ease-out
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
            <span className="text-xs text-muted-foreground transition-colors duration-150 ease-out group-hover:text-muted-foreground/80">
              {formatBitrate(song.bitrate)}bps
            </span>
            {song.duration && (
              <span className="text-xs text-muted-foreground transition-colors duration-150 ease-out group-hover:text-muted-foreground/80">
                {formatTime(song.duration)}
              </span>
            )}
          </div>
        </div>

        <div className="relative z-10">
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
  onPlaylistReset,
  shuffleMode,
  onShuffleToggle,
  isLoading = false,
  loadingProgress = { current: 0, total: 0 },
  viewMode,
  onViewModeChange,
  sortedSongs,
}: EnhancedPlaylistProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
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
      const artist = song.artist || "Unknown Artist"
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

  return (
    <Card className="h-full bg-transparent border-none shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5" />
            Playlist ({songs.length} songs)
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            {formatTime(getTotalDuration())}
          </div>
        </CardTitle>

        {/* Search and Controls */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search songs, artists, albums..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "grouped" ? "default" : "outline"}
                size="sm"
                onClick={() => onViewModeChange("grouped")}
              >
                <Music className="w-4 h-4 mr-2" />
                Grouped
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => onViewModeChange("list")}
              >
                <List className="w-4 h-4 mr-2" />
                List {viewMode === "list" && <span className="text-xs ml-1">(by Artist)</span>}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button variant={shuffleMode ? "default" : "outline"} size="sm" onClick={onShuffleToggle}>
                {shuffleMode ? <Shuffle className="w-4 h-4 mr-2" /> : <ShuffleOff className="w-4 h-4 mr-2" />}
                Shuffle
              </Button>

              {/* Reset Playlist Button */}
              {songs.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive bg-transparent"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-destructive" />
                        Reset Playlist
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove all songs from your playlist and clear the saved playlist data. This action
                        cannot be undone.
                        <br />
                        <br />
                        <strong>Current playlist:</strong> {songs.length} song{songs.length !== 1 ? "s" : ""}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={onPlaylistReset}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Reset Playlist
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Loading State */}
        {isLoading && (
          <div className="mb-4 p-4 bg-muted/50 rounded-lg">
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

        <ScrollArea className="h-[600px]">
          <div className="space-y-2">
            {songs.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Music className="w-12 h-12 mx-auto mb-4 opacity-50" />
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
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground mb-2 px-3">Sorted by Artist</div>
                {filteredSongs.map((song) => (
                  <SongItem
                    key={song.id}
                    song={song}
                    isCurrentSong={currentSong?.id === song.id}
                    showArtistAlbum={true}
                    onSongSelect={onSongSelect}
                    onSongRemove={onSongRemove}
                  />
                ))}
              </div>
            ) : (
              // Grouped view
              Object.entries(groupedSongs).map(([artist, albums]) => (
                <div key={artist} className="space-y-3">
                  <div className="sticky top-0 bg-background z-20 py-2">
                    <h3 className="font-semibold text-lg">{artist}</h3>
                    <Separator className="mt-2" />
                  </div>

                  {Object.entries(albums).map(([album, albumSongs]) => (
                    <div key={`${artist}-${album}`} className="ml-4 space-y-2">
                      <h4 className="font-medium text-muted-foreground text-sm uppercase tracking-wide">{album}</h4>
                      <div className="space-y-1 ml-4">
                        {albumSongs.map((song) => (
                          <SongItem
                            key={song.id}
                            song={song}
                            isCurrentSong={currentSong?.id === song.id}
                            onSongSelect={onSongSelect}
                            onSongRemove={onSongRemove}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

export type { Song }
