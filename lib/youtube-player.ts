/** The parts of YouTube's IFrame Player API the app uses. */
export interface YouTubePlayer {
  pauseVideo(): void
  destroy(): void
}

export interface YouTubePlayerEvent {
  data: number
  target: YouTubePlayer
}

export interface YouTubePlayerOptions {
  videoId: string
  width?: string | number
  height?: string | number
  playerVars?: Record<string, string | number>
  events?: {
    onStateChange?: (event: YouTubePlayerEvent) => void
    onError?: (event: YouTubePlayerEvent) => void
  }
}

export interface YouTubeApi {
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer
  PlayerState: { PLAYING: number }
}

declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

const API_URL = "https://www.youtube.com/iframe_api"

let loading: Promise<YouTubeApi> | null = null

/** YouTube's player API, loaded the first time a video is played and shared after that. */
export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (!loading) {
    loading = new Promise<YouTubeApi>((resolve, reject) => {
      // The API calls this global once it is ready. Anything else waiting on it still hears.
      const previous = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        previous?.()
        if (window.YT) resolve(window.YT)
      }
      const script = document.createElement("script")
      script.src = API_URL
      script.async = true
      script.onerror = () => {
        loading = null
        reject(new Error("Couldn't load YouTube's player."))
      }
      document.head.appendChild(script)
    })
  }
  return loading
}
