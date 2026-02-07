import { useRef, useState, useCallback, useEffect } from "react"
import type { EqualizerBand } from "@/components/refined-equalizer"

export interface UseAudioEngineOptions {
  audioRef: React.RefObject<HTMLAudioElement | null>
  equalizerBands: EqualizerBand[]
  onTimeUpdate?: (time: number) => void
  onDurationChange?: (duration: number) => void
  onEnded?: () => void
}

export interface UseAudioEngineReturn {
  // Refs
  audioContextRef: React.RefObject<AudioContext | null>
  sourceNodeRef: React.RefObject<MediaElementAudioSourceNode | null>
  gainNodeRef: React.RefObject<GainNode | null>
  analyserRef: React.RefObject<AnalyserNode | null>
  playPromiseRef: React.MutableRefObject<Promise<void> | null>

  // State
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number[]
  isMuted: boolean
  filterNodes: BiquadFilterNode[]

  // Actions
  setIsPlaying: (playing: boolean) => void
  setCurrentTime: (time: number) => void
  setDuration: (duration: number) => void
  setVolume: (volume: number[]) => void
  setIsMuted: (muted: boolean) => void
  setFilterNodes: (nodes: BiquadFilterNode[]) => void

  // Methods
  initializeAudioContext: () => void
  play: () => Promise<void>
  pause: () => void
  seek: (time: number) => void
  changeVolume: (value: number[]) => void
  toggleMute: () => void
  adjustVolume: (delta: number) => void
}

/**
 * Custom hook for managing Web Audio API, playback, and audio node connections
 *
 * Handles:
 * - Audio context initialization
 * - Equalizer filter nodes
 * - Playback state management
 * - Volume and mute controls
 * - Audio event listeners
 */
export function useAudioEngine(options: UseAudioEngineOptions): UseAudioEngineReturn {
  const { audioRef, equalizerBands, onTimeUpdate, onDurationChange, onEnded } = options

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const playPromiseRef = useRef<Promise<void> | null>(null)

  // State
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState([80])
  const [isMuted, setIsMuted] = useState(false)
  const [filterNodes, setFilterNodes] = useState<BiquadFilterNode[]>([])

  /**
   * Initialize Web Audio API context and create audio graph:
   * source -> filters[] -> gain -> analyser -> destination
   */
  const initializeAudioContext = useCallback(() => {
    if (!audioContextRef.current && audioRef.current) {
      // Create audio context
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioRef.current)
      gainNodeRef.current = audioContextRef.current.createGain()
      analyserRef.current = audioContextRef.current.createAnalyser()

      // Create equalizer filter nodes
      const filters = equalizerBands.map((band, index) => {
        const filter = audioContextRef.current!.createBiquadFilter()
        filter.type = index === 0 ? "lowshelf" : index === equalizerBands.length - 1 ? "highshelf" : "peaking"
        if (filter.type === "peaking") filter.Q.value = 1
        filter.frequency.value = band.frequency
        filter.gain.value = band.gain
        return filter
      })
      setFilterNodes(filters)

      // Connect audio graph: source -> filters -> gain -> analyser -> destination
      let currentNode: AudioNode = sourceNodeRef.current!
      filters.forEach((filter) => {
        currentNode.connect(filter)
        currentNode = filter
      })
      currentNode.connect(gainNodeRef.current!)
      gainNodeRef.current!.connect(analyserRef.current!)
      analyserRef.current!.connect(audioContextRef.current.destination)
    }
  }, [equalizerBands, audioRef])

  /**
   * Play audio with proper promise handling
   */
  const play = useCallback(async () => {
    if (!audioRef.current) return

    try {
      // Resume audio context if suspended
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume()
      }

      playPromiseRef.current = audioRef.current.play()
      await playPromiseRef.current
      setIsPlaying(true)
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        console.error("Error playing audio:", error)
        throw error
      }
      setIsPlaying(false)
    }
  }, [audioRef, playPromiseRef])

  /**
   * Pause audio playback
   */
  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
    }
  }, [audioRef])

  /**
   * Seek to a specific time in the audio
   */
  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
    }
  }, [audioRef])

  /**
   * Change volume and update audio nodes
   */
  const changeVolume = useCallback((value: number[]) => {
    setVolume(value)
    if (audioRef.current) {
      audioRef.current.volume = value[0] / 100
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = value[0] / 100
    }
  }, [audioRef])

  /**
   * Adjust volume by a delta amount
   */
  const adjustVolume = useCallback((delta: number) => {
    const newVolume = Math.max(0, Math.min(100, volume[0] + delta))
    changeVolume([newVolume])
  }, [volume, changeVolume])

  /**
   * Toggle mute state
   */
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const newMuted = !prev
      if (audioRef.current) {
        audioRef.current.muted = newMuted
      }
      return newMuted
    })
  }, [audioRef])

  /**
   * Cleanup AudioContext and audio nodes on unmount
   */
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        // Disconnect all nodes before closing
        try {
          sourceNodeRef.current?.disconnect()
          gainNodeRef.current?.disconnect()
          analyserRef.current?.disconnect()
          filterNodes.forEach((f) => { try { f.disconnect() } catch {} })
        } catch {}
        audioContextRef.current.close().catch(() => {})
        audioContextRef.current = null
        sourceNodeRef.current = null
        gainNodeRef.current = null
        analyserRef.current = null
      }
    }
  }, [filterNodes])

  /**
   * Setup audio event listeners for time updates, metadata, and end events
   */
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      const time = audio.currentTime
      setCurrentTime(time)
      onTimeUpdate?.(time)
    }

    const handleLoadedMetadata = () => {
      const dur = audio.duration
      setDuration(dur)
      onDurationChange?.(dur)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      onEnded?.()
    }

    audio.addEventListener("timeupdate", handleTimeUpdate)
    audio.addEventListener("loadedmetadata", handleLoadedMetadata)
    audio.addEventListener("ended", handleEnded)

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate)
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata)
      audio.removeEventListener("ended", handleEnded)
    }
  }, [onTimeUpdate, onDurationChange, onEnded])

  return {
    // Refs
    audioContextRef,
    sourceNodeRef,
    gainNodeRef,
    analyserRef,
    playPromiseRef,

    // State
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    filterNodes,

    // Actions
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setVolume,
    setIsMuted,
    setFilterNodes,

    // Methods
    initializeAudioContext,
    play,
    pause,
    seek,
    changeVolume,
    toggleMute,
    adjustVolume,
  }
}
