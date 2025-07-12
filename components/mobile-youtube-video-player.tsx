'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { 
  Youtube,
  X,
  Volume2,
  VolumeX,
  Maximize2,
  RefreshCw,
  Settings,
  Play,
  Pause
} from 'lucide-react'
import { YouTubeService, type YouTubeVideo } from '@/utils/youtube-service'
import { VideoCache } from '@/utils/video-cache'
import { toast } from '@/hooks/use-toast'

interface MobileYouTubeVideoPlayerProps {
  currentSong?: {
    title?: string
    artist?: string
    duration?: number
  } | null
  isPlaying: boolean
  currentTime: number
  onPlayPause?: () => void
  onSeek?: (time: number) => void
}

declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady: () => void
  }
}

export function MobileYouTubeVideoPlayer({
  currentSong,
  isPlaying,
  currentTime,
  onPlayPause,
  onSeek
}: MobileYouTubeVideoPlayerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentVideo, setCurrentVideo] = useState<YouTubeVideo | null>(null)
  const [videoOptions, setVideoOptions] = useState<YouTubeVideo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [videoVolume, setVideoVolume] = useState(80)
  const [isVideoMuted, setIsVideoMuted] = useState(false)
  const [autoPlayVideos, setAutoPlayVideos] = useState(true)
  const [syncMode, setSyncMode] = useState<'auto' | 'manual'>('auto')
  const [showSettings, setShowSettings] = useState(false)

  const playerRef = useRef<any>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Load YouTube IFrame API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      const firstScriptTag = document.getElementsByTagName('script')[0]
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag)

      window.onYouTubeIframeAPIReady = () => {
        console.log('YouTube IFrame API ready')
      }
    }
  }, [])

  // Search for videos when sheet opens
  useEffect(() => {
    if (isOpen && currentSong?.title && currentSong?.artist) {
      searchForVideos()
    }
  }, [isOpen, currentSong?.title, currentSong?.artist])

  // Sync video playback with audio
  useEffect(() => {
    if (playerRef.current && currentVideo && syncMode === 'auto') {
      const timeDiff = Math.abs(playerRef.current.getCurrentTime() - currentTime)
      
      // If time difference is more than 2 seconds, sync
      if (timeDiff > 2) {
        playerRef.current.seekTo(currentTime, true)
      }
    }
  }, [currentTime, currentVideo, syncMode])

  // Handle play/pause sync
  useEffect(() => {
    if (playerRef.current && currentVideo) {
      if (isPlaying) {
        playerRef.current.playVideo()
      } else {
        playerRef.current.pauseVideo()
      }
    }
  }, [isPlaying, currentVideo])

  const searchForVideos = async () => {
    if (!currentSong?.title || !currentSong?.artist) return

    setIsLoading(true)
    try {
      // Check if we have cached videos first
      const hasCached = VideoCache.hasCachedVideos(currentSong.artist, currentSong.title)
      
      const result = await YouTubeService.searchMusicVideo(
        currentSong.artist,
        currentSong.title
      )

      if (result.videos.length > 0) {
        setVideoOptions(result.videos)
        setCurrentVideo(result.videos[0])
        
        if (autoPlayVideos) {
          loadVideo(result.videos[0])
        }

        // Show cache status
        if (hasCached) {
          toast({
            title: "Cached Video Loaded",
            description: "Video loaded from local cache (faster)",
          })
        } else {
          toast({
            title: "Video Found",
            description: "Video cached for future use",
          })
        }
      } else {
        toast({
          title: "No Videos Found",
          description: `No music videos found for "${currentSong.title}" by ${currentSong.artist}`,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error searching for videos:', error)
      toast({
        title: "Video Search Error",
        description: "Failed to search for music videos",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const loadVideo = useCallback((video: YouTubeVideo) => {
    if (!window.YT || !iframeRef.current) return

    setCurrentVideo(video)

    // Create new player
    playerRef.current = new window.YT.Player(iframeRef.current, {
      height: '100%',
      width: '100%',
      videoId: video.id,
      playerVars: {
        autoplay: autoPlayVideos ? 1 : 0,
        controls: 1,
        modestbranding: 1,
        rel: 0,
        enablejsapi: 1,
        origin: window.location.origin,
        widget_referrer: window.location.origin,
      },
      events: {
        onReady: (event: any) => {
          console.log('YouTube player ready')
          event.target.setVolume(videoVolume)
          if (isVideoMuted) {
            event.target.mute()
          }
        },
        onStateChange: (event: any) => {
          // Sync with audio player if needed
          if (syncMode === 'auto' && event.data === window.YT.PlayerState.PLAYING) {
            const videoTime = event.target.getCurrentTime()
            const audioTime = currentTime
            
            if (Math.abs(videoTime - audioTime) > 2) {
              event.target.seekTo(audioTime, true)
            }
          }
        },
        onError: (event: any) => {
          console.error('YouTube player error:', event.data)
          toast({
            title: "Video Error",
            description: "Failed to load video. Trying next option...",
            variant: "destructive",
          })
          
          // Try next video
          const currentIndex = videoOptions.findIndex(v => v.id === video.id)
          if (currentIndex < videoOptions.length - 1) {
            loadVideo(videoOptions[currentIndex + 1])
          }
        }
      }
    })
  }, [videoOptions, autoPlayVideos, videoVolume, isVideoMuted, syncMode, currentTime])

  const handleVideoVolumeChange = (volume: number) => {
    setVideoVolume(volume)
    if (playerRef.current) {
      playerRef.current.setVolume(volume)
    }
  }

  const toggleVideoMute = () => {
    setIsVideoMuted(!isVideoMuted)
    if (playerRef.current) {
      if (isVideoMuted) {
        playerRef.current.unMute()
      } else {
        playerRef.current.mute()
      }
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatViewCount = (count: number) => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`
    }
    return count.toString()
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <Youtube className="h-4 w-4" />
          Video
        </Button>
      </SheetTrigger>
      
      <SheetContent side="bottom" className="h-[90vh] p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Youtube className="h-5 w-5 text-red-500" />
              Music Video
              {currentVideo && (
                <Badge variant="secondary" className="text-xs">
                  {formatViewCount(currentVideo.viewCount)} views
                </Badge>
              )}
            </SheetTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-col h-full">
          {/* Video Player */}
          <div className="flex-1 relative bg-black">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <RefreshCw className="h-8 w-8 animate-spin text-white" />
              </div>
            ) : currentVideo ? (
              <>
                <iframe
                  ref={iframeRef}
                  className="w-full h-full"
                  title={currentVideo.title}
                />
                
                {/* Video Controls Overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                  <div className="flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleVideoMute}
                        className="text-white hover:bg-white/20"
                      >
                        {isVideoMuted ? (
                          <VolumeX className="h-4 w-4" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </Button>
                      
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={videoVolume}
                        onChange={(e) => handleVideoVolumeChange(parseInt(e.target.value))}
                        className="w-16"
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-white">
                <div className="text-center">
                  <Youtube className="h-12 w-12 mx-auto mb-2" />
                  <p>No video available</p>
                </div>
              </div>
            )}
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="p-4 border-t bg-muted/50">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Auto-play videos</label>
                  <input
                    type="checkbox"
                    checked={autoPlayVideos}
                    onChange={(e) => setAutoPlayVideos(e.target.checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Sync mode</label>
                  <select
                    value={syncMode}
                    onChange={(e) => setSyncMode(e.target.value as 'auto' | 'manual')}
                    className="text-sm border rounded px-2 py-1"
                  >
                    <option value="auto">Automatic</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Video Options */}
          {videoOptions.length > 1 && (
            <div className="p-4 border-t bg-muted/50 max-h-32 overflow-y-auto">
              <h3 className="text-sm font-medium mb-2">Alternative Videos</h3>
              <div className="space-y-2">
                {videoOptions.slice(1).map((video) => (
                  <div
                    key={video.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                    onClick={() => loadVideo(video)}
                  >
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-12 h-9 object-cover rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{video.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {video.channelTitle} • {formatTime(video.duration)}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {video.relevanceScore}%
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
} 