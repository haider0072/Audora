"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Music, Play, Trash2, Search } from "lucide-react"
import { AlbumArtDisplay } from "./album-art-display"
import { memo } from "react"

interface Song {
  id: string
  title?: string
  artist?: string
  album?: string
  year?: string
  genre?: string
  bitrate?: number
  sampleRate?: number
  duration?: number
  isHiRes?: boolean
  albumArt?: string
  fileSize?: number
  format?: string
  file: File
  url: string
  artists?: string[] // Added for grouping
}

interface GroupedSongs {
  [artist: string]: {
    [album: string]: Song[]
  }
}

interface MobilePlaylistProps {
  songs: Song[]
  filteredSongs: Song[]
  groupedSongs: GroupedSongs
  currentSong: Song | null
  viewMode: "grouped" | "list"
  onSongSelect: (song: Song) => void
  onSongRemove: (songId: string) => void
  isLoading?: boolean
  loadingProgress?: { current: number; total: number }
}

export function MobilePlaylist({
  songs,
  filteredSongs,
  groupedSongs,
  currentSong,
  viewMode,
  onSongSelect,
  onSongRemove,
  isLoading = false,
  loadingProgress = { current: 0, total: 0 },
}: MobilePlaylistProps) {
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
          group relative flex items-center gap-3 p-3 rounded-lg transition-all duration-150 ease-out cursor-pointer
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
                font-medium text-sm truncate transition-colors duration-150 ease-out
                ${isCurrentSong ? "text-primary" : "text-foreground group-hover:text-foreground"}
              `}
              >
                {song.title}
              </h4>
              {isCurrentSong && (
                <div className="flex-shrink-0">
                  <Play className="w-3 h-3 text-primary" />
                </div>
              )}
            </div>

            {showArtistAlbum && (
              <p className="text-xs text-muted-foreground truncate transition-colors duration-150 ease-out group-hover:text-muted-foreground/80 mb-1">
                {song.artists ? song.artists.join(", ") : (song.artist || "Unknown Artist")}
                {song.album && ` • ${song.album}`}
              </p>
            )}

            <div className="flex items-center gap-1 flex-wrap">
              <Badge
                variant="outline"
                className={`
                text-xs h-5 px-1 transition-all duration-150 ease-out
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
                  text-xs h-5 px-1 transition-all duration-150 ease-out
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
                {formatBitrate(song.bitrate)}
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
              h-8 w-8 flex-shrink-0 transition-all duration-150 ease-out
              opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100
              hover:bg-destructive/10 hover:text-destructive
              ${isCurrentSong ? "opacity-60 hover:opacity-100" : ""}
            `}
              onClick={(e) => {
                e.stopPropagation()
                onSongRemove(song.id)
              }}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>

          {/* Subtle border highlight for current song */}
          {isCurrentSong && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
          )}
        </div>
      )
    },
  )

  SongItem.displayName = "SongItem"

  return (
    <div className="flex-1 overflow-hidden">
      {/* Loading State */}
      {isLoading && (
        <div className="p-4 bg-muted/50 rounded-lg mx-4 mb-4">
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
          <p className="text-xs text-muted-foreground mt-2">Processing audio files...</p>
        </div>
      )}

      <ScrollArea className="h-full">
        <div className="px-4 pb-32 space-y-2">
          {songs.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <Music className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">No songs in playlist</p>
              <p className="text-xs">Add some music files to get started</p>
            </div>
          ) : filteredSongs.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">No songs found</p>
              <p className="text-xs">Try adjusting your search terms</p>
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
                <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10 py-2">
                  <h3 className="font-semibold text-base">{artist}</h3>
                  <Separator className="mt-2" />
                </div>

                {Object.entries(albums).map(([album, albumSongs]) => (
                  <div key={`${artist}-${album}`} className="ml-2 space-y-2">
                    <h4 className="font-medium text-muted-foreground text-sm uppercase tracking-wide">{album}</h4>
                    <div className="space-y-1 ml-2">
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
    </div>
  )
}
