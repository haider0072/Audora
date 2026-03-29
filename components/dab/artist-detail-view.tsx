"use client"

import { memo, useState } from "react"
import { ArrowLeft, User, Disc, Calendar, Music } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { TidalDiscographyResult } from "@/lib/tidal-types"

interface ArtistDetailViewProps {
  data: TidalDiscographyResult
  onAlbumClick: (albumId: string) => void
  onBack: () => void
}

export const ArtistDetailView = memo(function ArtistDetailView({
  data,
  onAlbumClick,
  onBack,
}: ArtistDetailViewProps) {
  const { artist, albums } = data
  const [showFullBio, setShowFullBio] = useState(false)

  const bio = artist.biography || ""
  const shortBio = bio.length > 200 ? bio.slice(0, 200) + "..." : bio

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 space-y-3 pb-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="h-8 gap-1.5 -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        {/* Artist info */}
        <div className="flex gap-4 items-start">
          <div className="h-20 w-20 rounded-full overflow-hidden flex-shrink-0 bg-white/10">
            {artist.image ? (
              <img src={artist.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <User className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate">{artist.name}</h2>
            {artist.albumCount != null && (
              <p className="text-sm text-muted-foreground">
                {artist.albumCount} album{artist.albumCount !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>

        {/* Biography */}
        {bio && (
          <div className="text-xs text-muted-foreground leading-relaxed">
            <p>{showFullBio ? bio : shortBio}</p>
            {bio.length > 200 && (
              <button
                onClick={() => setShowFullBio(!showFullBio)}
                className="text-primary hover:underline mt-1"
              >
                {showFullBio ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Albums */}
      <div className="flex items-center gap-2 px-1 py-2">
        <Disc className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Discography ({albums.length})
        </h3>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-1 pb-4">
          {albums.map((album) => (
            <button
              key={album.id}
              onClick={() => onAlbumClick(album.id)}
              className="flex items-center gap-3 py-2.5 px-3 rounded-md hover:bg-white/5 w-full text-left"
            >
              <div className="h-14 w-14 rounded overflow-hidden flex-shrink-0 bg-white/10">
                {album.cover ? (
                  <img src={album.cover} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <Disc className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{album.title}</p>
                <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                  {album.releaseDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {album.releaseDate.slice(0, 4)}
                    </span>
                  )}
                  {album.trackCount > 0 && (
                    <span className="flex items-center gap-1">
                      <Music className="h-3 w-3" />
                      {album.trackCount} tracks
                    </span>
                  )}
                </div>
                {album.genre && (
                  <span className="inline-block text-xs bg-white/10 px-1.5 py-0.5 rounded-full mt-1">
                    {album.genre}
                  </span>
                )}
              </div>
            </button>
          ))}

          {albums.length === 0 && (
            <div className="flex flex-col items-center py-8 text-muted-foreground">
              <Disc className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No albums found</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
})
