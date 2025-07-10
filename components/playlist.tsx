"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Music, Play, Trash2, Clock } from "lucide-react"
import type { AudioMetadata } from "../utils/metadata-extractor"

interface Song extends AudioMetadata {
  id: string
  file: File
  url: string
}

interface PlaylistProps {
  songs: Song[]
  currentSong: Song | null
  onSongSelect: (song: Song) => void
  onSongRemove: (songId: string) => void
}

export function Playlist({ songs, currentSong, onSongSelect, onSongRemove }: PlaylistProps) {
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

  const getTotalDuration = () => {
    return songs.reduce((total, song) => total + (song.duration || 0), 0)
  }

  return (
    <Card>
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
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          <div className="space-y-2">
            {songs.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Music className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No songs in playlist</p>
                <p className="text-sm">Add some music files to get started</p>
              </div>
            ) : (
              songs.map((song) => (
                <div
                  key={song.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
                    currentSong?.id === song.id ? "bg-primary/10 border-primary" : ""
                  }`}
                  onClick={() => onSongSelect(song)}
                >
                  <div className="flex-shrink-0">
                    {song.albumArt ? (
                      <img
                        src={song.albumArt || "/placeholder.svg"}
                        alt="Album Art"
                        className="w-12 h-12 rounded object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                        <Music className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium truncate">{song.title}</h4>
                      {currentSong?.id === song.id && <Play className="w-4 h-4 text-primary flex-shrink-0" />}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {song.artist || "Unknown Artist"}
                      {song.album && ` • ${song.album}`}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {song.format}
                      </Badge>
                      {song.isHiRes && (
                        <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                          Hi-Res
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{formatBitrate(song.bitrate)}bps</span>
                      {song.duration && (
                        <span className="text-xs text-muted-foreground">{formatTime(song.duration)}</span>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSongRemove(song.id)
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
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
