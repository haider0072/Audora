'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Minimize2,
  Youtube,
  Music,
  X,
  Settings,
  RefreshCw
} from 'lucide-react'
import { YouTubeService, type YouTubeVideo } from '@/utils/youtube-service'
import { VideoCache } from '@/utils/video-cache'
import { toast } from '@/hooks/use-toast'

interface YouTubeVideoPlayerProps {
  currentSong?: {
    title?: string
    artist?: string
    duration?: number
  } | null
  isPlaying: boolean
  currentTime: number
  onPlayPause?: () => void
  onSeek?: (time: number) => void
  className?: string
  isVisible: boolean
  onClose: () => void
}

declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady: () => void
  }
}

export function YouTubeVideoPlayer({
  currentSong,
  isPlaying,
  currentTime,
  onPlayPause,
  onSeek,
  className = '',
  isVisible,
  onClose
}: YouTubeVideoPlayerProps) {
  const [currentVideo, setCurrentVideo] = useState<YouTubeVideo | null>(null)
  const [videoOptions, setVideoOptions] = useState<YouTubeVideo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [videoVolume, setVideoVolume] = useState(80)
  const [isVideoMuted, setIsVideoMuted] = useState(false)
  const [autoPlayVideos, setAutoPlayVideos] = useState(true)
  const [syncMode, setSyncMode] = useState<'auto' | 'manual'>('auto')

  const playerRef = useRef<any>(null)
  const playerContainerId = 'youtube-player-container';
  const containerRef = useRef<HTMLDivElement>(null)

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

  // Search for videos when song changes
  useEffect(() => {
    if (currentSong?.title && currentSong?.artist && isVisible) {
      searchForVideos()
    }
  }, [currentSong?.title, currentSong?.artist, isVisible])

  // Sync video playback with audio
  useEffect(() => {
    if (
      playerRef.current &&
      typeof playerRef.current.getCurrentTime === 'function' &&
      currentVideo &&
      syncMode === 'auto'
    ) {
      const timeDiff = Math.abs(playerRef.current.getCurrentTime() - currentTime)
      
      // If time difference is more than 2 seconds, sync
      if (timeDiff > 2) {
        playerRef.current.seekTo(currentTime, true)
      }
    }
  }, [currentTime, currentVideo, syncMode])

  // Handle play/pause sync
  useEffect(() => {
    if (
      playerRef.current &&
      typeof playerRef.current.playVideo === 'function' &&
      typeof playerRef.current.pauseVideo === 'function' &&
      currentVideo
    ) {
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
    if (!window.YT) return;

    setCurrentVideo(video);

    // Destroy previous player if exists
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    // Create new player
    playerRef.current = new window.YT.Player(playerContainerId, {
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
          console.log('YouTube player ready');
          event.target.setVolume(videoVolume);
          if (isVideoMuted) {
            event.target.mute();
          }
        },
        onStateChange: (event: any) => {
          if (syncMode === 'auto' && event.data === window.YT.PlayerState.PLAYING) {
            const videoTime = event.target.getCurrentTime();
            const audioTime = currentTime;
            if (Math.abs(videoTime - audioTime) > 2) {
              event.target.seekTo(audioTime, true);
            }
          }
        },
        onError: (event: any) => {
          console.error('YouTube player error:', event.data);
          toast({
            title: 'Video Error',
            description: 'Failed to load video. Trying next option...',
            variant: 'destructive',
          });
          const currentIndex = videoOptions.findIndex(v => v.id === video.id);
          if (currentIndex < videoOptions.length - 1) {
            loadVideo(videoOptions[currentIndex + 1]);
          }
        },
      },
    });
  }, [videoOptions, autoPlayVideos, videoVolume, isVideoMuted, syncMode, currentTime]);

  // Clean up player on unmount or video change
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return

    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen()
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      }
    }
    setIsFullscreen(!isFullscreen)
  }

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
      return `${(count / 1000000).toFixed(1)}M`    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`
    }
    return count.toString()
  }

  // Only render the video UI if isVisible is true
  if (!isVisible) return null;

  return (
    <div ref={containerRef} className={`youtube-video-player-container ${className}`}>
      {/* Back to Player button */}
      <button
        className="absolute top-2 left-2 z-20 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 flex items-center gap-2 focus:outline-none"
        aria-label="Back to Player"
        onClick={onClose}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        <span className="hidden sm:inline">Back to Player</span>
      </button>
      {/* Cross (close) button */}
      <button
        className="absolute top-2 right-2 z-20 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 focus:outline-none"
        aria-label="Close video"
        onClick={onClose}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      {/* Video Player */}
      <Card ref={containerRef} className="relative overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Youtube className="h-4 w-4 text-red-500" />
              Music Video
              {currentVideo && (
                <Badge variant="secondary" className="text-xs">
                  {formatViewCount(currentVideo.viewCount)} views
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          <div className="relative aspect-video bg-black">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : currentVideo ? (
              <>
                <div id={playerContainerId} className="w-full h-full" />
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
                        className="w-20"
                      />
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleFullscreen}
                      className="text-white hover:bg-white/20"
                    >
                      {isFullscreen ? (
                        <Minimize2 className="h-4 w-4" />
                      ) : (
                        <Maximize2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Youtube className="h-12 w-12 mx-auto mb-2" />
                  <p>No video available</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Video Options */}
      {videoOptions.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Alternative Videos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {videoOptions.slice(1).map((video) => (
                <div
                  key={video.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                  onClick={() => loadVideo(video)}
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
          </CardContent>
        </Card>
      )}

      {/* Settings Dialog */}
      <Dialog>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Video Settings</DialogTitle>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>
    </div>
  )
} 
