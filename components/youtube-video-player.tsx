'use client'

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
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
  onVideoReady?: () => void // NEW PROP
  onSync?: () => void // NEW PROP
  forceRefresh?: number
}

declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady: () => void
  }
}

export const YouTubeVideoPlayer = forwardRef<
  unknown,
  YouTubeVideoPlayerProps
>(function YouTubeVideoPlayer({
  currentSong,
  isPlaying,
  currentTime,
  onPlayPause,
  onSeek,
  className = '',
  isVisible,
  onClose,
  onVideoReady, // NEW PROP
  onSync, // NEW PROP
  forceRefresh
}, ref) {
  const [currentVideo, setCurrentVideo] = useState<YouTubeVideo | null>(null)
  const [videoOptions, setVideoOptions] = useState<YouTubeVideo[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const playerRef = useRef<any>(null)
  const playerContainerId = 'youtube-player-container';
  const containerRef = useRef<HTMLDivElement>(null)

  // Expose resetVideo to parent
  useImperativeHandle(ref, () => ({
    resetVideo: () => {
      console.log('resetVideo called');
      if (videoOptions.length > 0) {
        setCurrentVideo(videoOptions[0]);
        loadVideo(videoOptions[0]);
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

  const MAX_LOAD_VIDEO_RETRIES = 10;

  const loadVideo = useCallback((video: YouTubeVideo, retryCount = 0) => {
    console.log('loadVideo called for:', video.title, 'retryCount:', retryCount);
    if (!window.YT || !window.YT.Player) {
      console.log('YouTube API not ready, waiting...');
      setTimeout(() => loadVideo(video, retryCount), 100);
      return;
    }
    setCurrentVideo(video);
    // Destroy previous player if exists
    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch (e) {
        console.log('Error destroying previous player:', e);
      }
      playerRef.current = null;
    }
    setTimeout(() => {
      const targetElement = document.getElementById(playerContainerId);
      if (!targetElement) {
        if (retryCount < MAX_LOAD_VIDEO_RETRIES) {
          console.warn('Target element not found, retrying loadVideo...', retryCount + 1);
          setTimeout(() => loadVideo(video, retryCount + 1), 100);
        } else {
          console.error('Target element not found after retries:', playerContainerId);
        }
        return;
      }
      console.log('Creating YouTube player for video:', video.id);
      playerRef.current = new window.YT.Player(playerContainerId, {
        height: '360',
        width: '640',
        videoId: video.id,
        playerVars: {
          autoplay: 1,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          enablejsapi: 1,
          origin: window.location.origin,
          mute: 1, // Mute video by default
        },
        events: {
          onReady: (event: any) => {
            console.log('YouTube player ready');
            try {
              event.target.mute();
              event.target.setVolume(0);
              console.log('Video muted successfully (onReady)');
            } catch (e) {
              console.log('Error muting video (onReady):', e);
            }
          },
          onStateChange: (event: any) => {
            console.log('YouTube player state changed:', event.data);
            if (event.data === window.YT.PlayerState.PLAYING && onVideoReady) {
              console.log('Video started playing - calling onVideoReady');
              onVideoReady();
              try {
                event.target.mute();
                event.target.setVolume(0);
                console.log('Video muted successfully (onStateChange)');
              } catch (e) {
                console.log('Error ensuring video mute (onStateChange):', e);
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
    }, 100);
  }, [videoOptions, onVideoReady]);

  // Ensure searchForVideos is called whenever currentSong or isVisible changes, or if videoOptions are empty but isVisible is true
  useEffect(() => {
    console.log('YouTube useEffect:', {
      currentSong: currentSong?.title,
      hasArtist: !!currentSong?.artist,
      hasTitle: !!currentSong?.title,
      isVisible,
      videoOptionsLength: videoOptions.length,
      willTriggerSearch: currentSong?.title && currentSong?.artist && isVisible && videoOptions.length === 0
    })
    if (currentSong?.title && currentSong?.artist && isVisible) {
      if (videoOptions.length === 0) {
        console.log('Triggering searchForVideos due to empty videoOptions');
        searchForVideos();
      } else {
        // Always reload video when switching to video mode or song changes
        loadVideo(videoOptions[0]);
      }
    }
  }, [currentSong?.title, currentSong?.artist, isVisible]);

  // Force refresh when new songs are imported
  useEffect(() => {
    if (forceRefresh && currentSong?.title && currentSong?.artist && isVisible) {
      console.log('Force refreshing YouTube videos for newly imported song')
      setVideoOptions([])
      setCurrentVideo(null)
      searchForVideos()
    }
  }, [forceRefresh, currentSong?.title, currentSong?.artist, isVisible])

  // Search for videos when song changes
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

  // Clean up player on unmount or video change
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, []);

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
              {/* SYNC BUTTON */}
              <Button
                variant="outline"
                size="sm"
                onClick={onSync}
                className="ml-2"
              >
                Sync
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
              <div
              id={playerContainerId}
              className="w-full h-full" style={{ minHeight: '360px' }}
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
                  onClick={() => {
                    console.log('Loading alternative video:', video.title);
                    loadVideo(video);
                  }}
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
    </div>
  );
}); 
