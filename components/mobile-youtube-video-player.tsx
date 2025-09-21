'use client'

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
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
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  forceRefresh?: number
}

declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady: () => void
  }
}

export const MobileYouTubeVideoPlayer = forwardRef<
  unknown,
  MobileYouTubeVideoPlayerProps
>(function MobileYouTubeVideoPlayer({
  currentSong,
  isPlaying,
  currentTime,
  onPlayPause,
  onSeek,
  isOpen,
  onOpenChange,
  forceRefresh
}, ref) {
  // Remove sync and custom controls state
  // Remove: videoVolume, isVideoMuted, autoPlayVideos, syncMode, showSettings
  // Remove: useEffect for sync, play/pause, volume, mute

  // Only keep state for currentVideo, videoOptions, isLoading
  const [currentVideo, setCurrentVideo] = useState<YouTubeVideo | null>(null)
  const [videoOptions, setVideoOptions] = useState<YouTubeVideo[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Add a key to force iframe reload
  const [videoKey, setVideoKey] = useState(0);

  const playerRef = useRef<any>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Expose resetVideo to parent
  useImperativeHandle(ref, () => ({
    resetVideo: () => {
      if (videoOptions.length > 0) {
        setCurrentVideo(videoOptions[0]);
        setVideoKey(prev => prev + 1); // force iframe reload
      }
    }
  }));

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

  // Force refresh when new songs are imported
  useEffect(() => {
    if (forceRefresh && currentSong?.title && currentSong?.artist && isOpen) {
      console.log('Force refreshing mobile YouTube videos for newly imported song')
      setVideoOptions([])
      setCurrentVideo(null)
      searchForVideos()
    }
  }, [forceRefresh, currentSong?.title, currentSong?.artist, isOpen])

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
        
        // Auto-play the first video
        if (result.videos[0]) {
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
        autoplay: 1, // Always autoplay
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
          // No custom volume/mute logic here
        },
        onStateChange: (event: any) => {
          // No custom sync logic here
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
  }, [videoOptions])

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

  // Only render the video UI if isOpen is true
  if (!isOpen) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="p-0">
        <SheetHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-2">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Youtube className="h-4 w-4 text-red-500" />
            Music Video
            {currentVideo && (
              <Badge variant="secondary" className="text-xs">
                {formatViewCount(currentVideo.viewCount)} views
              </Badge>
            )}
          </SheetTitle>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </SheetHeader>
        <div className="relative aspect-video bg-black">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : currentVideo ? (
            <iframe
              key={videoKey}
              ref={iframeRef}
              className="w-full h-full"
              src={`https://www.youtube.com/embed/${currentVideo.id}?autoplay=1&controls=1&modestbranding=1&rel=0&mute=1`}
              title={currentVideo.title}
              frameBorder="0"
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Youtube className="h-12 w-12 mx-auto mb-2" />
                <p>No video available</p>
              </div>
            </div>
          )}
        </div>
        {/* Video Options */}
        {videoOptions.length > 1 && (
          <div className="p-4">
            <div className="text-sm font-medium mb-2">Alternative Videos</div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {videoOptions.slice(1).map((video) => (
                <div
                  key={video.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                  onClick={() => setCurrentVideo(video)}
                >
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-16 h-12 object-cover rounded"
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
      </SheetContent>
    </Sheet>
  );
}); 