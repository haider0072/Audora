import { useEffect } from "react"
import type { Song } from "@/components/enhanced-playlist"

export interface UseMediaControlsOptions {
  currentSong: Song | null
  isPlaying: boolean
  songs: Song[]
  audioRef: React.RefObject<HTMLAudioElement | null>
  onPlayPause: () => void
  onSkipNext: () => void
  onSkipPrevious: () => void
  onStop: () => void
  onVolumeAdjust: (delta: number) => void
  onToggleMute: () => void
  onPlayFirstSong?: () => void
  enableExtendedShortcuts?: boolean
}

/**
 * Custom hook for keyboard shortcuts and Media Session API integration
 *
 * Handles:
 * - Media key events (play/pause, next, previous, stop, volume)
 * - Space bar for play/pause
 * - Media Session API metadata and action handlers
 * - Extended shortcuts: Ctrl/Cmd+arrows, F7-F12 (desktop only)
 */
export function useMediaControls(options: UseMediaControlsOptions) {
  const {
    currentSong, isPlaying, songs, audioRef,
    onPlayPause, onSkipNext, onSkipPrevious, onStop,
    onVolumeAdjust, onToggleMute, onPlayFirstSong,
    enableExtendedShortcuts = false,
  } = options

  useEffect(() => {
    const handleMediaKeys = (e: KeyboardEvent) => {
      const isMediaKey = [
        "MediaPlayPause", "MediaTrackNext", "MediaTrackPrevious",
        "MediaStop", "AudioVolumeUp", "AudioVolumeDown", "AudioVolumeMute",
      ].includes(e.code)

      const isSpaceOnBody =
        e.code === "Space" &&
        (e.target === document.body ||
          (e.target as HTMLElement)?.tagName === "BODY" ||
          !(e.target as HTMLElement)?.matches("input, textarea, [contenteditable]"))

      if (isMediaKey || isSpaceOnBody) {
        e.preventDefault()
        e.stopPropagation()

        switch (e.code) {
          case "MediaPlayPause":
          case "Space":
            if (currentSong) {
              onPlayPause()
            } else if (songs.length > 0 && onPlayFirstSong) {
              onPlayFirstSong()
            }
            break
          case "MediaTrackNext":
            if (songs.length > 0) onSkipNext()
            break
          case "MediaTrackPrevious":
            if (songs.length > 0) onSkipPrevious()
            break
          case "MediaStop":
            onStop()
            break
          case "AudioVolumeUp":
            onVolumeAdjust(5)
            break
          case "AudioVolumeDown":
            onVolumeAdjust(-5)
            break
          case "AudioVolumeMute":
            onToggleMute()
            break
        }
      }

      // Extended shortcuts (desktop only)
      if (enableExtendedShortcuts) {
        if (e.ctrlKey || e.metaKey) {
          switch (e.code) {
            case "ArrowRight":
              e.preventDefault()
              if (songs.length > 0) onSkipNext()
              break
            case "ArrowLeft":
              e.preventDefault()
              if (songs.length > 0) onSkipPrevious()
              break
            case "ArrowUp":
              e.preventDefault()
              onVolumeAdjust(5)
              break
            case "ArrowDown":
              e.preventDefault()
              onVolumeAdjust(-5)
              break
          }
        }

        switch (e.code) {
          case "F7":
            e.preventDefault()
            if (songs.length > 0) onSkipPrevious()
            break
          case "F8":
            e.preventDefault()
            if (currentSong) {
              onPlayPause()
            } else if (songs.length > 0 && onPlayFirstSong) {
              onPlayFirstSong()
            }
            break
          case "F9":
            e.preventDefault()
            if (songs.length > 0) onSkipNext()
            break
          case "F10":
            e.preventDefault()
            onToggleMute()
            break
          case "F11":
            e.preventDefault()
            onVolumeAdjust(-5)
            break
          case "F12":
            e.preventDefault()
            onVolumeAdjust(5)
            break
        }
      }
    }

    document.addEventListener("keydown", handleMediaKeys, { capture: true })

    // Media Session API
    if ("mediaSession" in navigator && currentSong) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.title || "Unknown Title",
        artist: currentSong.artist || "Unknown Artist",
        album: currentSong.album || "Unknown Album",
        artwork: currentSong.albumArt
          ? [{ src: currentSong.albumArt, sizes: "256x256", type: "image/jpeg" }]
          : [],
      })

      navigator.mediaSession.setActionHandler("play", () => {
        if (!isPlaying && currentSong) onPlayPause()
      })
      navigator.mediaSession.setActionHandler("pause", () => {
        if (isPlaying) onPlayPause()
      })
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        if (songs.length > 0) onSkipNext()
      })
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        if (songs.length > 0) onSkipPrevious()
      })
      navigator.mediaSession.setActionHandler("stop", () => onStop())

      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused"
    }

    return () => {
      document.removeEventListener("keydown", handleMediaKeys, { capture: true })
      if ("mediaSession" in navigator) {
        navigator.mediaSession.setActionHandler("play", null)
        navigator.mediaSession.setActionHandler("pause", null)
        navigator.mediaSession.setActionHandler("nexttrack", null)
        navigator.mediaSession.setActionHandler("previoustrack", null)
        navigator.mediaSession.setActionHandler("stop", null)
      }
    }
  }, [
    currentSong, isPlaying, songs, enableExtendedShortcuts,
    onPlayPause, onSkipNext, onSkipPrevious, onStop,
    onVolumeAdjust, onToggleMute, onPlayFirstSong,
  ])
}
