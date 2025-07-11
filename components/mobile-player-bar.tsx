"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Play, Pause, SkipBack, SkipForward, Volume2, Heart, Share2, MoreHorizontal, Radio } from "lucide-react"
import { NetworkSharingPanel } from "./network-sharing-panel"
import { NetworkSharingService } from "../utils/network-sharing"

interface MobilePlayerBarProps {
  currentSong?: {
    id: string
    title?: string
    artist?: string
    album?: string
    albumArt?: string
  } | null
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isLiked: boolean
  onPlayPause: () => void
  onPrevious: () => void
  onNext: () => void
  onVolumeChange: (volume: number) => void
  onLike: () => void
  onSeek: (time: number) => void
  songs: Array<{
    id: string
    title?: string
    artist?: string
    album?: string
    duration?: number
    format?: string
    isHiRes?: boolean
  }>
  onPlaylistUpdate?: (songs: any[]) => void
  onPlaybackStateUpdate?: (isPlaying: boolean, currentTime: number, currentSong?: string) => void
}

export function MobilePlayerBar({
  currentSong,
  isPlaying,
  currentTime,
  duration,
  volume,
  isLiked,
  onPlayPause,
  onPrevious,
  onNext,
  onVolumeChange,
  onLike,
  onSeek,
  songs,
  onPlaylistUpdate,
  onPlaybackStateUpdate,
}: MobilePlayerBarProps) {
  const [showNetworkSharing, setShowNetworkSharing] = useState(false)
  const [sharingService] = useState(() => NetworkSharingService.getInstance())
  const [isSharing, setIsSharing] = useState(false)

  // Check sharing status
  useState(() => {
    const checkSharingStatus = () => {
      setIsSharing(sharingService.isSharing())
    }

    checkSharingStatus()
    const interval = setInterval(checkSharingStatus, 1000)

    return () => clearInterval(interval)
  })

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <>
      <Card className="fixed bottom-0 left-0 right-0 z-50 rounded-none border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="p-3">
          {/* Progress Bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <div
              className="w-full h-1 bg-muted rounded-full cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const x = e.clientX - rect.left
                const percentage = x / rect.width
                const newTime = percentage * duration
                onSeek(newTime)
              }}
            >
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>

          {/* Player Controls */}
          <div className="flex items-center justify-between">
            {/* Song Info */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {currentSong?.albumArt ? (
                <img
                  src={currentSong.albumArt || "/placeholder.svg"}
                  alt={currentSong.album || "Album art"}
                  className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Play className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-sm truncate">{currentSong?.title || "No song selected"}</h3>
                <p className="text-xs text-muted-foreground truncate">{currentSong?.artist || "Unknown artist"}</p>
              </div>
            </div>

            {/* Control Buttons */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onLike} className={isLiked ? "text-red-500" : ""}>
                <Heart className={`w-4 h-4 ${isLiked ? "fill-current" : ""}`} />
              </Button>

              <Button variant="ghost" size="sm" onClick={onPrevious}>
                <SkipBack className="w-4 h-4" />
              </Button>

              <Button variant="default" size="sm" onClick={onPlayPause} className="w-10 h-10 rounded-full">
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>

              <Button variant="ghost" size="sm" onClick={onNext}>
                <SkipForward className="w-4 h-4" />
              </Button>

              <Sheet open={showNetworkSharing} onOpenChange={setShowNetworkSharing}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className={isSharing ? "text-green-600" : ""}>
                    {isSharing ? (
                      <div className="relative">
                        <Share2 className="w-4 h-4" />
                        <Radio className="w-2 h-2 absolute -top-1 -right-1 text-green-600" />
                      </div>
                    ) : (
                      <Share2 className="w-4 h-4" />
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[80vh]">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                      <Share2 className="w-5 h-5" />
                      Network Sharing
                      {isSharing && (
                        <Badge variant="default" className="bg-green-600">
                          <Radio className="w-3 h-3 mr-1" />
                          Live
                        </Badge>
                      )}
                    </SheetTitle>
                    <SheetDescription>
                      Share your playlist with friends or join someone else's listening session.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 overflow-y-auto max-h-[calc(80vh-120px)]">
                    <NetworkSharingPanel
                      songs={songs}
                      currentSong={currentSong}
                      isPlaying={isPlaying}
                      currentTime={currentTime}
                      onPlaylistUpdate={onPlaylistUpdate}
                      onPlaybackStateUpdate={onPlaybackStateUpdate}
                      onClose={() => setShowNetworkSharing(false)}
                    />
                  </div>
                </SheetContent>
              </Sheet>

              <Button variant="ghost" size="sm">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Volume Control */}
          <div className="mt-3 flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-muted-foreground" />
            <div
              className="flex-1 h-1 bg-muted rounded-full cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const x = e.clientX - rect.left
                const percentage = x / rect.width
                const newVolume = percentage * 100
                onVolumeChange(newVolume)
              }}
            >
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${volume}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-8 text-right">{Math.round(volume)}%</span>
          </div>
        </div>
      </Card>

      {/* Spacer to prevent content from being hidden behind the fixed player */}
      <div className="h-32" />
    </>
  )
}
