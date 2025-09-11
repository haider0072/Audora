'use client'

import { Badge } from '@/components/ui/badge'
import { AlbumArtDisplay } from '@/components/album-art-display'
import { createLogger } from '@/lib/logger'
import { Song } from '@/lib/schemas'

const logger = createLogger('SongInfoDisplay')

interface SongInfoDisplayProps {
  song: Song
  currentBitrate?: number
  isTransitioning?: boolean
}

export function SongInfoDisplay({ song, currentBitrate, isTransitioning = false }: SongInfoDisplayProps) {
  const formatBitrate = (bitrate: number): string => {
    if (bitrate >= 1000) {
      return `${(bitrate / 1000).toFixed(1)}k`
    }
    return bitrate.toString()
  }

  const formatSampleRate = (sampleRate: number): string => {
    return `${(sampleRate / 1000).toFixed(1)}kHz`
  }

  logger.debug('Displaying song info', { 
    title: song.title, 
    artist: song.artist,
    isTransitioning 
  })

  return (
    <div className="space-y-6">
      <div className="flex gap-6">
        <AlbumArtDisplay
          songId={song.id}
          albumArt={song.albumArt}
          title={`${song.title} album art`}
          isTransitioning={isTransitioning}
          className="shadow-2xl shadow-black/30 flex-shrink-0 w-64 h-64"
        />
        
        <div
          className={`flex-1 space-y-3 transition-all duration-500 ease-out ${
            isTransitioning ? "translate-x-4 opacity-70" : "translate-x-0 opacity-100"
          }`}
        >
          <div className="space-y-2">
            <h2 className="text-2xl font-bold line-clamp-2 leading-tight">
              {song.title}
            </h2>
            
            {song.artist && (
              <p className="text-xl text-muted-foreground font-medium">
                {song.artist}
              </p>
            )}
            
            {song.album && (
              <p className="text-lg text-muted-foreground">
                {song.album}
              </p>
            )}
          </div>
          
          <div className="flex flex-wrap gap-2">
            {song.isHiRes && (
              <Badge
                variant="secondary"
                className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 shadow-sm"
              >
                Hi-Res Audio
              </Badge>
            )}
            
            {song.format && (
              <Badge variant="outline" className="shadow-sm">
                {song.format.toUpperCase()}
              </Badge>
            )}
            
            {currentBitrate && (
              <Badge variant="outline" className="shadow-sm">
                {formatBitrate(currentBitrate)}bps
              </Badge>
            )}
            
            {song.sampleRate && (
              <Badge variant="outline" className="shadow-sm">
                {formatSampleRate(song.sampleRate)}
              </Badge>
            )}
            
            {song.metadata?.channels && (
              <Badge variant="outline" className="shadow-sm">
                {song.metadata.channels === 1 ? 'Mono' : 
                 song.metadata.channels === 2 ? 'Stereo' : 
                 `${song.metadata.channels} Channel`}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}