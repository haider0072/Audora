import { useRef, useState, useCallback, useEffect } from "react"
import type { EqualizerBand } from "@/components/refined-equalizer"
import { DEFAULT_Q_VALUES } from "@/hooks/use-equalizer-manager"
import { waitForCanPlay } from "@/lib/utils"

export interface UseAudioEngineOptions {
  audioRef: React.RefObject<HTMLAudioElement | null>
  secondaryAudioRef?: React.RefObject<HTMLAudioElement | null>
  equalizerBands: EqualizerBand[]
  onTimeUpdate?: (time: number) => void
  onDurationChange?: (duration: number) => void
  onEnded?: () => void
  onNearEnd?: () => void
  /**
   * Auto-advance crossfade length in seconds (0 = gapless, instant swap when a
   * track ends on its own). Used by the gapless swap + the early crossfade-start
   * trigger.
   */
  crossfadeDuration?: number
  /**
   * Manual track-change crossfade length in seconds (0 = hard cut). Used when
   * the user changes track (Next/Prev/pick), independent of the auto length.
   */
  manualCrossfadeDuration?: number
  /**
   * Fired `crossfadeDuration` seconds before the active track ends, so the
   * player can advance early and let the two tracks overlap. Only fires when
   * auto crossfade is enabled and the next track is already preloaded.
   */
  onCrossfadeStart?: () => void
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
  swapToPreloaded: (durationSec?: number) => boolean
  resetGaplessState: () => void
  isPreloaded: boolean

  // Crossfade on demand (manual next / non-preloaded). Loads the file into the
  // inactive element and equal-power crossfades into it. Returns false when
  // crossfade is disabled or nothing is currently playing (caller falls back).
  crossfadeTo: (file: File, signal?: AbortSignal) => Promise<boolean>
}

const PRELOAD_THRESHOLD_SECONDS = 3
/** Master-gain fade time for pause/play, in seconds (anti-click + smooth). */
const PAUSE_FADE_SECONDS = 0.4
/** Headroom (seconds) added on top of crossfade for preloading the next track. */
const CROSSFADE_PRELOAD_HEADROOM = 2

// Equal-power crossfade curves (cos/sin) — keep constant perceived loudness
// across the blend instead of the ~-6dB dip a linear crossfade leaves at the
// midpoint. Precomputed once at module load.
const CROSSFADE_CURVE_POINTS = 64
const FADE_OUT_CURVE = new Float32Array(CROSSFADE_CURVE_POINTS)
const FADE_IN_CURVE = new Float32Array(CROSSFADE_CURVE_POINTS)
for (let i = 0; i < CROSSFADE_CURVE_POINTS; i++) {
  const t = i / (CROSSFADE_CURVE_POINTS - 1)
  FADE_OUT_CURVE[i] = Math.cos((t * Math.PI) / 2)
  FADE_IN_CURVE[i] = Math.sin((t * Math.PI) / 2)
}

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
    crossfadeDuration = 0, manualCrossfadeDuration = 0, onCrossfadeStart,
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

  // Crossfade / fade refs
  const crossfadeDurationRef = useRef(crossfadeDuration)
  crossfadeDurationRef.current = crossfadeDuration
  const manualCrossfadeDurationRef = useRef(manualCrossfadeDuration)
  manualCrossfadeDurationRef.current = manualCrossfadeDuration
  const crossfadeStartedRef = useRef(false)
  // Bumped on every swap/reset so a stale "pause old track" timeout from an
  // interrupted crossfade can detect it's no longer the current transition.
  const crossfadeTokenRef = useRef(0)
  // Pending setTimeout id for the deferred pause after a pause-fade.
  const pendingPauseRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Pending setTimeout id for pausing the outgoing track after a crossfade.
  const pendingCrossfadeStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Mirror of the latest user volume (0-100) for ramp targets without stale closures.
  const volumeRef = useRef(80)

  // State
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState([80])
  const [isMuted, setIsMuted] = useState(false)
  const volumeBeforeMuteRef = useRef(80)
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

  // Keep volumeRef in sync so gain-ramp targets never use a stale value.
  useEffect(() => {
    volumeRef.current = volume[0]
  }, [volume])

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
   * Swap to the preloaded song. When crossfade is enabled the outgoing and
   * incoming mix gains are ramped with an equal-power curve so the two tracks
   * overlap smoothly; otherwise it's an instant gapless swap.
   * Returns true if swap succeeded.
   */
  const swapToPreloaded = useCallback((durationSec?: number): boolean => {
    if (!preloadedRef.current) return false

    const activeAudio = getActiveAudio()
    const inactiveAudio = getInactiveAudio()
    const activeMixGain = getActiveMixGain()
    const inactiveMixGain = getInactiveMixGain()
    const ctx = audioContextRef.current

    if (!inactiveAudio || !activeMixGain || !inactiveMixGain) return false

    inactiveAudio.play().catch(() => {})

    // Default to the auto-advance length; manual changes pass a shorter one.
    const crossfadeSec = durationSec ?? crossfadeDurationRef.current
    const token = ++crossfadeTokenRef.current

    if (crossfadeSec > 0 && ctx) {
      // Equal-power crossfade: ramp old out, new in, then pause old once done.
      const now = ctx.currentTime
      activeMixGain.gain.cancelScheduledValues(now)
      inactiveMixGain.gain.cancelScheduledValues(now)
      activeMixGain.gain.setValueCurveAtTime(FADE_OUT_CURVE, now, crossfadeSec)
      inactiveMixGain.gain.setValueCurveAtTime(FADE_IN_CURVE, now, crossfadeSec)

      const fadingAudio = activeAudio
      if (pendingCrossfadeStopRef.current) clearTimeout(pendingCrossfadeStopRef.current)
      pendingCrossfadeStopRef.current = setTimeout(() => {
        pendingCrossfadeStopRef.current = null
        // Skip if a newer transition superseded this one (interrupted crossfade).
        if (crossfadeTokenRef.current !== token) return
        if (fadingAudio) {
          fadingAudio.pause()
          fadingAudio.currentTime = 0
        }
        // Clamp the (now inactive) gain to exactly 0 after the curve completes.
        activeMixGain.gain.cancelScheduledValues(ctx.currentTime)
        activeMixGain.gain.value = 0
      }, crossfadeSec * 1000 + 50)
    } else {
      // Instant swap: mute old, unmute new
      activeMixGain.gain.cancelScheduledValues(ctx?.currentTime ?? 0)
      inactiveMixGain.gain.cancelScheduledValues(ctx?.currentTime ?? 0)
      activeMixGain.gain.value = 0
      inactiveMixGain.gain.value = 1
      if (activeAudio) {
        activeAudio.pause()
        activeAudio.currentTime = 0
      }
    }

    // Swap active tracking
    activeElementRef.current = activeElementRef.current === "primary" ? "secondary" : "primary"

    // Update duration from the new active audio (loadedmetadata already fired during preload)
    if (inactiveAudio.duration) {
      setDuration(inactiveAudio.duration)
    }

    preloadedRef.current = false
    setIsPreloaded(false)
    nearEndFiredRef.current = false
    crossfadeStartedRef.current = false

    return true
  }, [getActiveAudio, getInactiveAudio, getActiveMixGain, getInactiveMixGain])

  /**
   * Crossfade into an arbitrary file (manual "Next", or any non-preloaded
   * track change). Loads it into the inactive element, waits until it can play,
   * then runs the same equal-power crossfade as the gapless swap.
   *
   * Returns false (so the caller can fall back to a normal load) when crossfade
   * is disabled, the graph isn't ready, or nothing is currently playing.
   */
  const crossfadeTo = useCallback(async (file: File, signal?: AbortSignal): Promise<boolean> => {
    const crossfadeSec = manualCrossfadeDurationRef.current
    if (crossfadeSec <= 0) return false

    const ctx = audioContextRef.current
    const activeAudio = getActiveAudio()
    const inactiveAudio = getInactiveAudio()
    const inactiveMixGain = getInactiveMixGain()

    // Need an initialized graph and an actively-playing track to fade from.
    if (!ctx || !inactiveAudio || !inactiveMixGain) return false
    if (!activeAudio || activeAudio.paused) return false

    try {
      if (preloadedUrlRef.current) {
        URL.revokeObjectURL(preloadedUrlRef.current)
        preloadedUrlRef.current = null
      }

      const url = URL.createObjectURL(file)
      preloadedUrlRef.current = url
      inactiveAudio.src = url
      inactiveAudio.load()

      await waitForCanPlay(inactiveAudio)
      if (signal?.aborted) return false

      inactiveAudio.currentTime = 0
      // Start the incoming track silent; swapToPreloaded ramps it up.
      inactiveMixGain.gain.cancelScheduledValues(ctx.currentTime)
      inactiveMixGain.gain.value = 0

      preloadedRef.current = true
      setIsPreloaded(true)
      return swapToPreloaded(crossfadeSec)
    } catch {
      preloadedRef.current = false
      setIsPreloaded(false)
      return false
    }
  }, [getActiveAudio, getInactiveAudio, getInactiveMixGain, swapToPreloaded])

  /**
   * Reset gapless state back to primary element.
   * Call this before the slow (non-gapless) selectSong path to ensure
   * we load into the correct audio element.
   */
  const resetGaplessState = useCallback(() => {
    // Invalidate any in-flight crossfade so its deferred "pause old track"
    // timeout becomes a no-op, then cancel it outright.
    crossfadeTokenRef.current++
    if (pendingCrossfadeStopRef.current) {
      clearTimeout(pendingCrossfadeStopRef.current)
      pendingCrossfadeStopRef.current = null
    }

    // Stop secondary audio if playing
    const secondaryAudio = secondaryAudioRef?.current
    if (secondaryAudio) {
      secondaryAudio.pause()
      secondaryAudio.currentTime = 0
    }

    // Reset mix gains: primary=1, secondary=0 (cancel any scheduled crossfade ramps first)
    const ctxTime = audioContextRef.current?.currentTime ?? 0
    if (primaryMixGainRef.current) {
      primaryMixGainRef.current.gain.cancelScheduledValues(ctxTime)
      primaryMixGainRef.current.gain.value = 1
    }
    if (secondaryMixGainRef.current) {
      secondaryMixGainRef.current.gain.cancelScheduledValues(ctxTime)
      secondaryMixGainRef.current.gain.value = 0
    }

    // Reset active tracking to primary
    activeElementRef.current = "primary"

    // Clear preload state
    preloadedRef.current = false
    setIsPreloaded(false)
    nearEndFiredRef.current = false
    crossfadeStartedRef.current = false

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

    // Cancel any pending deferred-pause from an interrupted pause-fade.
    if (pendingPauseRef.current) {
      clearTimeout(pendingPauseRef.current)
      pendingPauseRef.current = null
    }

    try {
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume()
      }

      playPromiseRef.current = audio.play()
      await playPromiseRef.current
      setIsPlaying(true)

      // Fade the master gain up to the current volume (anti-click smooth start).
      const gain = gainNodeRef.current
      const ctx = audioContextRef.current
      if (gain && ctx) {
        const target = volumeRef.current / 100
        const now = ctx.currentTime
        gain.gain.cancelScheduledValues(now)
        gain.gain.setValueAtTime(Math.min(gain.gain.value, target), now)
        gain.gain.linearRampToValueAtTime(target, now + PAUSE_FADE_SECONDS)
      }
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        console.error("Error playing audio:", error)
        throw error
      }
      setIsPlaying(false)
    }
  }, [getActiveAudio])

  /**
   * Pause audio playback with a short fade-out (anti-click). The element is
   * paused only after the master gain has ramped to silence.
   */
  const pause = useCallback(() => {
    const audio = getActiveAudio()
    if (!audio) return

    const gain = gainNodeRef.current
    const ctx = audioContextRef.current

    if (gain && ctx) {
      const now = ctx.currentTime
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(0.0001, now + PAUSE_FADE_SECONDS)

      if (pendingPauseRef.current) clearTimeout(pendingPauseRef.current)
      pendingPauseRef.current = setTimeout(() => {
        audio.pause()
        pendingPauseRef.current = null
      }, PAUSE_FADE_SECONDS * 1000 + 20)
    } else {
      audio.pause()
    }

    setIsPlaying(false)
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
    const vol = value[0]
    volumeRef.current = vol
    if (audioRef.current) {
      audioRef.current.volume = vol / 100
      audioRef.current.muted = vol === 0
    }
    if (secondaryAudioRef?.current) {
      secondaryAudioRef.current.volume = vol / 100
      secondaryAudioRef.current.muted = vol === 0
    }
    // Skip touching the master gain mid pause-fade — the new level is captured
    // in volumeRef and applied on the next play() ramp, avoiding an audible blip.
    if (gainNodeRef.current && !pendingPauseRef.current) {
      const ctx = audioContextRef.current
      const now = ctx?.currentTime ?? 0
      gainNodeRef.current.gain.cancelScheduledValues(now)
      gainNodeRef.current.gain.value = vol / 100
    }
    setIsMuted(vol === 0)
    if (vol > 0) {
      volumeBeforeMuteRef.current = vol
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
    if (isMuted) {
      const restoreVol = volumeBeforeMuteRef.current || 80
      changeVolume([restoreVol])
    } else {
      volumeBeforeMuteRef.current = volume[0] || 80
      changeVolume([0])
    }
  }, [isMuted, volume, changeVolume])

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
      if (pendingPauseRef.current) {
        clearTimeout(pendingPauseRef.current)
        pendingPauseRef.current = null
      }
      if (pendingCrossfadeStopRef.current) {
        clearTimeout(pendingCrossfadeStopRef.current)
        pendingCrossfadeStopRef.current = null
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

      if (!(audio.duration > 0)) return
      const remaining = audio.duration - time
      const crossfadeSec = crossfadeDurationRef.current

      // Preload the next track early. With crossfade on we need it ready before
      // the crossfade begins, so push the preload window out by some headroom.
      const preloadThreshold =
        crossfadeSec > 0 ? crossfadeSec + CROSSFADE_PRELOAD_HEADROOM : PRELOAD_THRESHOLD_SECONDS
      if (remaining <= preloadThreshold && remaining > 0 && !nearEndFiredRef.current) {
        nearEndFiredRef.current = true
        onNearEnd?.()
      }

      // Begin the crossfade `crossfadeSec` before the end so the two tracks
      // overlap. Requires the next track to be preloaded; otherwise we fall back
      // to the regular `ended` swap. Guard `time > crossfadeSec` so very short
      // clips don't trigger near their start.
      if (
        crossfadeSec > 0 &&
        preloadedRef.current &&
        !crossfadeStartedRef.current &&
        remaining <= crossfadeSec &&
        remaining > 0 &&
        time > crossfadeSec
      ) {
        crossfadeStartedRef.current = true
        onCrossfadeStart?.()
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
      crossfadeStartedRef.current = false
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
  }, [audioRef, secondaryAudioRef, onTimeUpdate, onDurationChange, onEnded, onNearEnd, onCrossfadeStart])

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
    crossfadeTo,
  }
}
