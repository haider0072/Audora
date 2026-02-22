import { useRef, useState, useCallback, useEffect } from "react"
import type { EqualizerBand } from "@/components/refined-equalizer"
import { DEFAULT_Q_VALUES } from "@/hooks/use-equalizer-manager"

export interface UseAudioEngineOptions {
  audioRef: React.RefObject<HTMLAudioElement | null>
  secondaryAudioRef?: React.RefObject<HTMLAudioElement | null>
  equalizerBands: EqualizerBand[]
  onTimeUpdate?: (time: number) => void
  onDurationChange?: (duration: number) => void
  onEnded?: () => void
  onNearEnd?: () => void
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
  applyNormalization: (dbCorrection: number) => void

  // Gapless methods
  preloadNextSong: (file: File) => Promise<boolean>
  swapToPreloaded: () => boolean
  resetGaplessState: () => void
  isPreloaded: boolean
}

const PRELOAD_THRESHOLD_SECONDS = 3

/**
 * Custom hook for managing Web Audio API, playback, and audio node connections.
 *
 * Audio graph (with dual sources for gapless):
 *   primarySource → primaryMixGain ─┐
 *                                     ├→ filters[] → limiter → normGain → userGain → analyser → dest
 *   secondarySource → secondaryMixGain ─┘
 *
 * When secondaryAudioRef is not provided, falls back to single-source mode.
 */
export function useAudioEngine(options: UseAudioEngineOptions): UseAudioEngineReturn {
  const {
    audioRef, secondaryAudioRef, equalizerBands,
    onTimeUpdate, onDurationChange, onEnded, onNearEnd,
  } = options

  // Core audio refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const secondarySourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const primaryMixGainRef = useRef<GainNode | null>(null)
  const secondaryMixGainRef = useRef<GainNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const limiterNodeRef = useRef<DynamicsCompressorNode | null>(null)
  const normalizationGainRef = useRef<GainNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const playPromiseRef = useRef<Promise<void> | null>(null)

  // Gapless refs
  const activeElementRef = useRef<"primary" | "secondary">("primary")
  const preloadedRef = useRef(false)
  const preloadedUrlRef = useRef<string | null>(null)
  const nearEndFiredRef = useRef(false)

  // State
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState([80])
  const [isMuted, setIsMuted] = useState(false)
  const [filterNodes, setFilterNodes] = useState<BiquadFilterNode[]>([])
  const [isPreloaded, setIsPreloaded] = useState(false)
  const filterNodesRef = useRef<BiquadFilterNode[]>([])

  // Helper to get active/inactive audio elements
  const getActiveAudio = useCallback(() => {
    return activeElementRef.current === "primary"
      ? audioRef.current
      : secondaryAudioRef?.current ?? null
  }, [audioRef, secondaryAudioRef])

  const getInactiveAudio = useCallback(() => {
    if (!secondaryAudioRef?.current) return null
    return activeElementRef.current === "primary"
      ? secondaryAudioRef.current
      : audioRef.current
  }, [audioRef, secondaryAudioRef])

  const getActiveMixGain = useCallback(() => {
    return activeElementRef.current === "primary"
      ? primaryMixGainRef.current
      : secondaryMixGainRef.current
  }, [])

  const getInactiveMixGain = useCallback(() => {
    return activeElementRef.current === "primary"
      ? secondaryMixGainRef.current
      : primaryMixGainRef.current
  }, [])

  /**
   * Initialize Web Audio API context and create dual-source audio graph.
   *
   * IMPORTANT: createMediaElementSource can only be called ONCE per
   * HTMLMediaElement. Guard on sourceNodeRef to prevent InvalidStateError.
   */
  const initializeAudioContext = useCallback(() => {
    if (!audioContextRef.current && !sourceNodeRef.current && audioRef.current) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioContextRef.current = ctx

      // Create core nodes
      gainNodeRef.current = ctx.createGain()
      analyserRef.current = ctx.createAnalyser()

      // Peak limiter (brick-wall, always-on)
      limiterNodeRef.current = ctx.createDynamicsCompressor()
      limiterNodeRef.current.threshold.value = -1
      limiterNodeRef.current.ratio.value = 20
      limiterNodeRef.current.knee.value = 0
      limiterNodeRef.current.attack.value = 0.001
      limiterNodeRef.current.release.value = 0.01

      // Normalization gain (per-song loudness correction)
      normalizationGainRef.current = ctx.createGain()
      normalizationGainRef.current.gain.value = 1

      // Primary source + mix gain
      sourceNodeRef.current = ctx.createMediaElementSource(audioRef.current)
      primaryMixGainRef.current = ctx.createGain()
      primaryMixGainRef.current.gain.value = 1
      sourceNodeRef.current.connect(primaryMixGainRef.current)

      // Secondary source + mix gain (for gapless)
      if (secondaryAudioRef?.current) {
        secondarySourceNodeRef.current = ctx.createMediaElementSource(secondaryAudioRef.current)
        secondaryMixGainRef.current = ctx.createGain()
        secondaryMixGainRef.current.gain.value = 0
        secondarySourceNodeRef.current.connect(secondaryMixGainRef.current)
      }

      // Create equalizer filter nodes
      const filters = equalizerBands.map((band, index) => {
        const filter = ctx.createBiquadFilter()
        filter.type = index === 0 ? "lowshelf" : index === equalizerBands.length - 1 ? "highshelf" : "peaking"
        if (filter.type === "peaking") filter.Q.value = DEFAULT_Q_VALUES[band.frequency] ?? 1.0
        filter.frequency.value = band.frequency
        filter.gain.value = band.gain
        return filter
      })
      setFilterNodes(filters)
      filterNodesRef.current = filters

      // Connect graph: mixGains → filters → limiter → normGain → userGain → analyser → dest
      const firstFilter = filters[0]

      // Both mix gains connect to first filter (or limiter if no filters)
      const mergeTarget: AudioNode = firstFilter || limiterNodeRef.current!
      primaryMixGainRef.current.connect(mergeTarget)
      if (secondaryMixGainRef.current) {
        secondaryMixGainRef.current.connect(mergeTarget)
      }

      // Chain filters together
      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i + 1])
      }

      // Last filter → limiter → normGain → userGain → analyser → destination
      const lastFilter = filters[filters.length - 1] || mergeTarget
      if (filters.length > 0) {
        lastFilter.connect(limiterNodeRef.current!)
      }
      limiterNodeRef.current!.connect(normalizationGainRef.current!)
      normalizationGainRef.current!.connect(gainNodeRef.current!)
      gainNodeRef.current!.connect(analyserRef.current!)
      analyserRef.current!.connect(ctx.destination)
    }
  }, [equalizerBands, audioRef, secondaryAudioRef])

  /**
   * Preload next song into the inactive audio element for gapless playback.
   * Returns true if preload succeeded.
   */
  const preloadNextSong = useCallback(async (file: File): Promise<boolean> => {
    const inactiveAudio = getInactiveAudio()
    if (!inactiveAudio) return false

    try {
      // Clean up previous preloaded URL
      if (preloadedUrlRef.current) {
        URL.revokeObjectURL(preloadedUrlRef.current)
        preloadedUrlRef.current = null
      }

      const url = URL.createObjectURL(file)
      preloadedUrlRef.current = url
      inactiveAudio.src = url
      inactiveAudio.load()

      await new Promise<void>((resolve, reject) => {
        const onCanPlay = () => {
          inactiveAudio.removeEventListener("canplay", onCanPlay)
          inactiveAudio.removeEventListener("error", onError)
          resolve()
        }
        const onError = () => {
          inactiveAudio.removeEventListener("canplay", onCanPlay)
          inactiveAudio.removeEventListener("error", onError)
          reject(new Error("Preload failed"))
        }
        inactiveAudio.addEventListener("canplay", onCanPlay)
        inactiveAudio.addEventListener("error", onError)
      })

      preloadedRef.current = true
      setIsPreloaded(true)
      return true
    } catch (error) {
      console.error("Gapless preload failed:", error)
      preloadedRef.current = false
      setIsPreloaded(false)
      return false
    }
  }, [getInactiveAudio])

  /**
   * Swap to the preloaded song — instant gapless transition.
   * Returns true if swap succeeded.
   */
  const swapToPreloaded = useCallback((): boolean => {
    if (!preloadedRef.current) return false

    const activeAudio = getActiveAudio()
    const inactiveAudio = getInactiveAudio()
    const activeMixGain = getActiveMixGain()
    const inactiveMixGain = getInactiveMixGain()

    if (!inactiveAudio || !activeMixGain || !inactiveMixGain) return false

    // Instant swap: mute old, unmute new
    activeMixGain.gain.value = 0
    inactiveMixGain.gain.value = 1

    inactiveAudio.play().catch(() => {})

    if (activeAudio) {
      activeAudio.pause()
      activeAudio.currentTime = 0
    }

    // Swap active tracking
    activeElementRef.current = activeElementRef.current === "primary" ? "secondary" : "primary"

    preloadedRef.current = false
    setIsPreloaded(false)
    nearEndFiredRef.current = false

    return true
  }, [getActiveAudio, getInactiveAudio, getActiveMixGain, getInactiveMixGain])

  /**
   * Reset gapless state back to primary element.
   * Call this before the slow (non-gapless) selectSong path to ensure
   * we load into the correct audio element.
   */
  const resetGaplessState = useCallback(() => {
    // Stop secondary audio if playing
    const secondaryAudio = secondaryAudioRef?.current
    if (secondaryAudio) {
      secondaryAudio.pause()
      secondaryAudio.currentTime = 0
    }

    // Reset mix gains: primary=1, secondary=0
    if (primaryMixGainRef.current) primaryMixGainRef.current.gain.value = 1
    if (secondaryMixGainRef.current) secondaryMixGainRef.current.gain.value = 0

    // Reset active tracking to primary
    activeElementRef.current = "primary"

    // Clear preload state
    preloadedRef.current = false
    setIsPreloaded(false)
    nearEndFiredRef.current = false

    if (preloadedUrlRef.current) {
      URL.revokeObjectURL(preloadedUrlRef.current)
      preloadedUrlRef.current = null
    }
  }, [secondaryAudioRef])

  /**
   * Play audio with proper promise handling
   */
  const play = useCallback(async () => {
    const audio = getActiveAudio()
    if (!audio) return

    try {
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume()
      }

      playPromiseRef.current = audio.play()
      await playPromiseRef.current
      setIsPlaying(true)
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        console.error("Error playing audio:", error)
        throw error
      }
      setIsPlaying(false)
    }
  }, [getActiveAudio])

  /**
   * Pause audio playback
   */
  const pause = useCallback(() => {
    const audio = getActiveAudio()
    if (audio) {
      audio.pause()
      setIsPlaying(false)
    }
  }, [getActiveAudio])

  /**
   * Seek to a specific time in the audio
   */
  const seek = useCallback((time: number) => {
    const audio = getActiveAudio()
    if (audio) {
      audio.currentTime = time
    }
  }, [getActiveAudio])

  /**
   * Change volume and update audio nodes
   */
  const changeVolume = useCallback((value: number[]) => {
    setVolume(value)
    // Set volume on both audio elements
    if (audioRef.current) {
      audioRef.current.volume = value[0] / 100
    }
    if (secondaryAudioRef?.current) {
      secondaryAudioRef.current.volume = value[0] / 100
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = value[0] / 100
    }
  }, [audioRef, secondaryAudioRef])

  /**
   * Adjust volume by a delta amount
   */
  const adjustVolume = useCallback((delta: number) => {
    const newVolume = Math.max(0, Math.min(100, volume[0] + delta))
    changeVolume([newVolume])
  }, [volume, changeVolume])

  /**
   * Apply loudness normalization gain correction (in dB) for the current song
   */
  const applyNormalization = useCallback((dbCorrection: number) => {
    if (normalizationGainRef.current) {
      const linearGain = Math.pow(10, dbCorrection / 20)
      normalizationGainRef.current.gain.value = linearGain
    }
  }, [])

  /**
   * Toggle mute state
   */
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const newMuted = !prev
      if (audioRef.current) audioRef.current.muted = newMuted
      if (secondaryAudioRef?.current) secondaryAudioRef.current.muted = newMuted
      return newMuted
    })
  }, [audioRef, secondaryAudioRef])

  /**
   * Cleanup AudioContext and audio nodes on unmount only.
   */
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        try {
          sourceNodeRef.current?.disconnect()
          secondarySourceNodeRef.current?.disconnect()
          primaryMixGainRef.current?.disconnect()
          secondaryMixGainRef.current?.disconnect()
          limiterNodeRef.current?.disconnect()
          normalizationGainRef.current?.disconnect()
          gainNodeRef.current?.disconnect()
          analyserRef.current?.disconnect()
          filterNodesRef.current.forEach((f) => { try { f.disconnect() } catch {} })
        } catch {}
        audioContextRef.current.close().catch(() => {})
        audioContextRef.current = null
        sourceNodeRef.current = null
        secondarySourceNodeRef.current = null
        primaryMixGainRef.current = null
        secondaryMixGainRef.current = null
        limiterNodeRef.current = null
        normalizationGainRef.current = null
        gainNodeRef.current = null
        analyserRef.current = null
      }
      if (preloadedUrlRef.current) {
        URL.revokeObjectURL(preloadedUrlRef.current)
        preloadedUrlRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Setup audio event listeners for time updates, metadata, and end events.
   * Listens on BOTH audio elements — uses activeElementRef to filter events.
   */
  useEffect(() => {
    const primaryAudio = audioRef.current
    const secondaryAudio = secondaryAudioRef?.current
    if (!primaryAudio) return

    const handleTimeUpdate = (e: Event) => {
      const audio = e.target as HTMLAudioElement
      const isPrimary = audio === primaryAudio
      const isActive =
        (isPrimary && activeElementRef.current === "primary") ||
        (!isPrimary && activeElementRef.current === "secondary")

      if (!isActive) return

      const time = audio.currentTime
      setCurrentTime(time)
      onTimeUpdate?.(time)

      // Fire onNearEnd when approaching song end
      const remaining = audio.duration - time
      if (remaining <= PRELOAD_THRESHOLD_SECONDS && remaining > 0 && !nearEndFiredRef.current && audio.duration > 0) {
        nearEndFiredRef.current = true
        onNearEnd?.()
      }
    }

    const handleLoadedMetadata = (e: Event) => {
      const audio = e.target as HTMLAudioElement
      const isPrimary = audio === primaryAudio
      const isActive =
        (isPrimary && activeElementRef.current === "primary") ||
        (!isPrimary && activeElementRef.current === "secondary")

      if (!isActive) return

      const dur = audio.duration
      setDuration(dur)
      onDurationChange?.(dur)
    }

    const handleEnded = (e: Event) => {
      const audio = e.target as HTMLAudioElement
      const isPrimary = audio === primaryAudio
      const isActive =
        (isPrimary && activeElementRef.current === "primary") ||
        (!isPrimary && activeElementRef.current === "secondary")

      if (!isActive) return

      setIsPlaying(false)
      nearEndFiredRef.current = false
      onEnded?.()
    }

    primaryAudio.addEventListener("timeupdate", handleTimeUpdate)
    primaryAudio.addEventListener("loadedmetadata", handleLoadedMetadata)
    primaryAudio.addEventListener("ended", handleEnded)

    if (secondaryAudio) {
      secondaryAudio.addEventListener("timeupdate", handleTimeUpdate)
      secondaryAudio.addEventListener("loadedmetadata", handleLoadedMetadata)
      secondaryAudio.addEventListener("ended", handleEnded)
    }

    return () => {
      primaryAudio.removeEventListener("timeupdate", handleTimeUpdate)
      primaryAudio.removeEventListener("loadedmetadata", handleLoadedMetadata)
      primaryAudio.removeEventListener("ended", handleEnded)

      if (secondaryAudio) {
        secondaryAudio.removeEventListener("timeupdate", handleTimeUpdate)
        secondaryAudio.removeEventListener("loadedmetadata", handleLoadedMetadata)
        secondaryAudio.removeEventListener("ended", handleEnded)
      }
    }
  }, [audioRef, secondaryAudioRef, onTimeUpdate, onDurationChange, onEnded, onNearEnd])

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
    applyNormalization,

    // Gapless methods
    preloadNextSong,
    swapToPreloaded,
    resetGaplessState,
    isPreloaded,
  }
}
