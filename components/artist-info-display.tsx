"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SpotifyService, type SpotifyResult } from "@/lib/spotify-service"
import { Loader2, User, X, RefreshCw, AlertCircle, ExternalLink, Disc3, Music, Calendar, HardDrive, FileAudio, Volume2 } from "lucide-react"
import type { Song } from "./enhanced-playlist"

interface ArtistInfoDisplayProps {
  isVisible: boolean
  onClose: () => void
  currentSong: Song | null
}

function formatFollowers(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return count.toString()
}

function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function formatReleaseDate(date: string): string {
  if (!date) return ""
  const d = new Date(date)
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return ""
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`
  return `${bytes} B`
}

function formatBitrate(bitrate?: number): string {
  if (!bitrate) return ""
  return bitrate >= 1000 ? `${(bitrate / 1000).toFixed(1)} Mbps` : `${Math.round(bitrate)} kbps`
}

function formatSampleRate(rate?: number): string {
  if (!rate) return ""
  return `${(rate / 1000).toFixed(1)} kHz`
}

function formatLocalDuration(seconds?: number): string {
  if (!seconds) return ""
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function PopularityBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}/100</span>
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}

export function ArtistInfoDisplay({ isVisible, onClose, currentSong }: ArtistInfoDisplayProps) {
  const [data, setData] = useState<SpotifyResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [lastFetchedSongId, setLastFetchedSongId] = useState<string | null>(null)

  const fetchArtistInfo = async (song: Song) => {
    if (!song.artist || !song.title) {
      setError("Not enough song information to look up artist.")
      return
    }

    setIsLoading(true)
    setError(null)
    setData(null)
    setNotConfigured(false)
    setLastFetchedSongId(song.id)

    try {
      const result = await SpotifyService.getArtistInfo(song.artist, song.title)

      if (!result.found && !result.artist) {
        // Check if it's a "not configured" scenario (no track/artist data at all)
        // vs "not found" (API was called but no match)
        // The API returns { found: false } for both, but if the API is not configured
        // it won't even have attempted to search
        setData(result)
      } else {
        setData(result)
      }
    } catch (e: any) {
      setError(e.message || "An error occurred while fetching artist info.")
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (currentSong && isVisible && currentSong.id !== lastFetchedSongId) {
      fetchArtistInfo(currentSong)
    }
  }, [currentSong, isVisible, lastFetchedSongId])

  const handleRetry = () => {
    if (currentSong) {
      setLastFetchedSongId(null)
      fetchArtistInfo(currentSong)
    }
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <Loader2 className="w-12 h-12 animate-spin mb-4" />
          <p className="text-lg">Looking up artist info...</p>
          <p className="text-sm mt-2">Searching Spotify</p>
        </div>
      )
    }

    if (notConfigured) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <AlertCircle className="w-12 h-12 mb-4" />
          <p className="text-lg font-semibold text-center">Spotify Not Configured</p>
          <p className="text-sm text-center mt-2 max-w-md">
            Add your Spotify API credentials to <code className="bg-muted px-1.5 py-0.5 rounded text-xs">.env.local</code> to enable this feature.
          </p>
          <p className="text-xs text-center mt-2 text-muted-foreground/70">
            Get credentials at developer.spotify.com/dashboard
          </p>
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

    if (data && data.found && data.artist) {
      return (
        <div className="space-y-6 w-full">
          {/* Artist Header */}
          <div className="flex items-start gap-4">
            {data.artist.image ? (
              <img
                src={data.artist.image}
                alt={data.artist.name}
                className="w-24 h-24 rounded-full object-cover flex-shrink-0 shadow-lg"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <User className="w-10 h-10 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-2">
              <h3 className="text-xl font-bold truncate">{data.artist.name}</h3>
              {data.artist.genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {data.artist.genres.slice(0, 4).map((genre) => (
                    <Badge key={genre} variant="secondary" className="text-xs">
                      {genre}
                    </Badge>
                  ))}
                </div>
              )}
              {data.artist.followers > 0 && (
                <p className="text-sm text-muted-foreground">
                  {formatFollowers(data.artist.followers)} followers
                </p>
              )}
              {data.artist.spotifyUrl && (
                <a href={data.artist.spotifyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="w-3 h-3" />
                  Open on Spotify
                </a>
              )}
            </div>
          </div>

          {/* Album Info */}
          {data.album && data.album.name && (
            <div className="flex items-start gap-3 bg-muted/30 rounded-lg p-3">
              {data.album.image ? (
                <img
                  src={data.album.image}
                  alt={data.album.name}
                  className="w-16 h-16 rounded-md object-cover flex-shrink-0 shadow-md"
                />
              ) : (
                <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                  <Disc3 className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-1">
                <h4 className="text-sm font-semibold truncate">{data.album.name}</h4>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {data.album.releaseDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatReleaseDate(data.album.releaseDate)}
                    </span>
                  )}
                  {data.album.totalTracks > 0 && (
                    <span className="flex items-center gap-1">
                      <Music className="w-3 h-3" />
                      {data.album.totalTracks} tracks
                    </span>
                  )}
                </div>
                {data.album.spotifyUrl && (
                  <a href={data.album.spotifyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <ExternalLink className="w-3 h-3" />
                    View Album
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Track Details */}
          {data.track && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Track Details</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {data.track.trackNumber > 0 && (
                  <div className="bg-muted/30 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">Track #</p>
                    <p className="font-medium">{data.track.trackNumber}</p>
                  </div>
                )}
                {data.track.durationMs > 0 && (
                  <div className="bg-muted/30 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="font-medium">{formatDuration(data.track.durationMs)}</p>
                  </div>
                )}
                {data.track.explicit && (
                  <div className="bg-muted/30 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">Content</p>
                    <p className="font-medium">Explicit</p>
                  </div>
                )}
              </div>
              {data.track.spotifyUrl && (
                <a href={data.track.spotifyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="w-3 h-3" />
                  Listen on Spotify
                </a>
              )}
            </div>
          )}

          {/* Popularity Bars */}
          {data.track && data.track.popularity > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Song Popularity</h4>
              <PopularityBar label={currentSong?.title || "Track"} value={data.track.popularity} />
            </div>
          )}

          {data.artist.popularity > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Artist Popularity</h4>
              <PopularityBar label={data.artist.name} value={data.artist.popularity} />
            </div>
          )}

          {/* Related Artists */}
          {data.relatedArtists && data.relatedArtists.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Related Artists</h4>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                {data.relatedArtists.map((ra) => (
                  <a
                    key={ra.name}
                    href={ra.spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-1.5 flex-shrink-0 w-20 group"
                  >
                    {ra.image ? (
                      <img
                        src={ra.image}
                        alt={ra.name}
                        className="w-16 h-16 rounded-full object-cover shadow-md group-hover:ring-2 ring-primary transition-all"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                        <User className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <span className="text-xs text-center truncate w-full group-hover:text-primary transition-colors">
                      {ra.name}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Local File Metadata */}
          {currentSong && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileAudio className="w-3.5 h-3.5" />
                File Metadata
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {currentSong.composer && (
                  <div className="bg-muted/30 rounded-lg p-2.5 col-span-2">
                    <p className="text-xs text-muted-foreground">Composer</p>
                    <p className="font-medium">{currentSong.composer}</p>
                  </div>
                )}
                {currentSong.lyricist && (
                  <div className="bg-muted/30 rounded-lg p-2.5 col-span-2">
                    <p className="text-xs text-muted-foreground">Lyricist / Writer</p>
                    <p className="font-medium">{currentSong.lyricist}</p>
                  </div>
                )}
                {currentSong.albumArtist && currentSong.albumArtist !== currentSong.artist && (
                  <div className="bg-muted/30 rounded-lg p-2.5 col-span-2">
                    <p className="text-xs text-muted-foreground">Album Artist</p>
                    <p className="font-medium">{currentSong.albumArtist}</p>
                  </div>
                )}
                {currentSong.genre && (
                  <div className="bg-muted/30 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">Genre</p>
                    <p className="font-medium">{currentSong.genre}</p>
                  </div>
                )}
                {currentSong.year && (
                  <div className="bg-muted/30 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">Year</p>
                    <p className="font-medium">{currentSong.year}</p>
                  </div>
                )}
                {currentSong.trackNumber && (
                  <div className="bg-muted/30 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">Track #</p>
                    <p className="font-medium">{currentSong.trackNumber}</p>
                  </div>
                )}
                {currentSong.discNumber && (
                  <div className="bg-muted/30 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">Disc #</p>
                    <p className="font-medium">{currentSong.discNumber}</p>
                  </div>
                )}
                {currentSong.label && (
                  <div className="bg-muted/30 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">Label</p>
                    <p className="font-medium">{currentSong.label}</p>
                  </div>
                )}
                {currentSong.isrc && (
                  <div className="bg-muted/30 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">ISRC</p>
                    <p className="font-medium font-mono text-xs">{currentSong.isrc}</p>
                  </div>
                )}
                {currentSong.copyright && (
                  <div className="bg-muted/30 rounded-lg p-2.5 col-span-2">
                    <p className="text-xs text-muted-foreground">Copyright</p>
                    <p className="font-medium text-xs">{currentSong.copyright}</p>
                  </div>
                )}
                {currentSong.format && (
                  <div className="bg-muted/30 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">Format</p>
                    <p className="font-medium">{currentSong.format}</p>
                  </div>
                )}
                {currentSong.bitrate && (
                  <div className="bg-muted/30 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">Bitrate</p>
                    <p className="font-medium">{formatBitrate(currentSong.bitrate)}</p>
                  </div>
                )}
                {currentSong.sampleRate && (
                  <div className="bg-muted/30 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">Sample Rate</p>
                    <p className="font-medium">{formatSampleRate(currentSong.sampleRate)}</p>
                  </div>
                )}
                {currentSong.duration && (
                  <div className="bg-muted/30 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="font-medium">{formatLocalDuration(currentSong.duration)}</p>
                  </div>
                )}
                {currentSong.fileSize && (
                  <div className="bg-muted/30 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">File Size</p>
                    <p className="font-medium">{formatFileSize(currentSong.fileSize)}</p>
                  </div>
                )}
                {currentSong.loudnessLUFS !== undefined && (
                  <div className="bg-muted/30 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">Loudness</p>
                    <p className="font-medium">{currentSong.loudnessLUFS.toFixed(1)} LUFS</p>
                  </div>
                )}
                {currentSong.encoder && (
                  <div className="bg-muted/30 rounded-lg p-2.5 col-span-2">
                    <p className="text-xs text-muted-foreground">Encoder</p>
                    <p className="font-medium text-xs">{currentSong.encoder}</p>
                  </div>
                )}
              </div>
              {currentSong.isHiRes && (
                <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                  Hi-Res Audio
                </Badge>
              )}
            </div>
          )}
        </div>
      )
    }

    if (data && !data.found) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <User className="w-12 h-12 mb-4" />
          <p className="text-lg font-semibold text-center">Couldn't find this artist on Spotify</p>
          <p className="text-sm text-center mt-2">
            Try a different song or check the artist name
          </p>
          <Button onClick={handleRetry} variant="outline" className="mt-4 bg-transparent">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <User className="w-12 h-12 mb-4" />
        <p>Select a song to see artist info.</p>
      </div>
    )
  }

  return (
    <div className="h-[84vh] w-full flex flex-col bg-card/50 rounded-lg border overflow-hidden">
      <div className="flex flex-row items-center justify-between p-4 border-b shrink-0 min-h-0">
        <h2 className="text-xl font-bold flex items-center gap-2 truncate">
          <User className="w-5 h-5 flex-shrink-0" />
          <span className="truncate">Artist Info</span>
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
