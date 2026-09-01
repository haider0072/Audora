import { useRef, useState, useCallback, useEffect } from "react"
import type { EqualizerBand } from "@/components/refined-equalizer"
import { PEAKING_Q } from "@/hooks/use-equalizer-manager"
import { cancelRamps, dbToGain, rampToValue, volumeToGain } from "@/lib/audio-params"
import { setPlaybackTime } from "@/lib/playback-time-store"
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
  duration: number
  volume: number[]
  isMuted: boolean
  filterNodes: BiquadFilterNode[]

  // Actions
  setIsPlaying: (playing: boolean) => void
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
  setNormalizationEnabled: (enabled: boolean) => void
  setPreamp: (db: number) => void

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
 *                                     ├→ preampGain → filters[] → normGain → userGain → analyser → dest
 *   secondarySource → secondaryMixGain ─┘
 *
 * Transparency contract: with a flat EQ, normalization off, and volume at
 * 100%, every gain in the chain is exactly 1.0 and the biquads are identity —
 * the browser's decoded PCM reaches the DAC untouched. There is deliberately
 * no compressor/limiter in the path; clipping from EQ boosts or normalization
 * is prevented by `updateGainStructure`'s auto-headroom pre-attenuation
 * instead of dynamic processing.
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
  const preampGainRef = useRef<GainNode | null>(null)
  const normalizationGainRef = useRef<GainNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const playPromiseRef = useRef<Promise<void> | null>(null)

  // Gain-structure refs (dB domain). Effective pre-EQ gain is
  // preampDb + auto-headroom; see updateGainStructure.
  const preampDbRef = useRef(0)
  const eqMaxBoostRef = useRef(0)
  const normDbRef = useRef(0)
  const normalizationEnabledRef = useRef(false)

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
  // True while a crossfade's gain curves are (or may still be) in flight.
  const crossfadeActiveRef = useRef(false)
  // Pending setTimeout id for the deferred pause after a pause-fade.
  const pendingPauseRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Pending setTimeout id for settling the crossfade once its curves complete.
  const pendingCrossfadeStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Mirror of the latest user volume (0-100) for ramp targets without stale closures.
  const volumeRef = useRef(80)

  // State
  const [isPlaying, setIsPlaying] = useState(false)
  // Playback position deliberately does NOT live here — it changes ~4x/sec and
  // would re-render every consumer of this hook along with it. See
  // `lib/playback-time-store` and read it with `usePlaybackTime`.
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
   * Recompute the static gain structure (preamp + normalization nodes).
   *
   * Auto-headroom: the pre-EQ gain is reduced by the total possible boost
   * (max positive EQ band gain + positive normalization correction) so that
   * full-scale material can never exceed 0 dBFS at the destination. The Web
   * Audio graph is float32 throughout and only clamps at the DAC, so a single
   * compensation point is sufficient — no limiter/compressor needed.
   *
   * The manual preamp is applied on top and may be positive; that is an
   * explicit user override and is not headroom-compensated.
   */
  const updateGainStructure = useCallback(() => {
    const ctx = audioContextRef.current
    if (!ctx) return
    const normDb = normalizationEnabledRef.current ? normDbRef.current : 0
    const headroomDb = -(Math.max(0, eqMaxBoostRef.current) + Math.max(0, normDb))
    if (preampGainRef.current) {
      rampToValue(preampGainRef.current.gain, ctx, dbToGain(preampDbRef.current + headroomDb))
    }
    if (normalizationGainRef.current) {
      rampToValue(normalizationGainRef.current.gain, ctx, dbToGain(normDb))
    }
  }, [])

  // Track the largest positive EQ band gain for auto-headroom.
  useEffect(() => {
    eqMaxBoostRef.current = equalizerBands.reduce((max, band) => Math.max(max, band.gain), 0)
    updateGainStructure()
  }, [equalizerBands, updateGainStructure])

  /**
   * Initialize Web Audio API context and create dual-source audio graph.
   *
   * IMPORTANT: createMediaElementSource can only be called ONCE per
   * HTMLMediaElement. Guard on sourceNodeRef to prevent InvalidStateError.
   */
  const initializeAudioContext = useCallback(() => {
    if (!audioContextRef.current && !sourceNodeRef.current && audioRef.current) {
      // latencyHint "playback" favors larger, glitch-resistant buffers over
      // interactive latency — right trade-off for a music player. The sample
      // rate is left at the device default on purpose: the OS output rate is
      // fixed, so forcing e.g. 96 kHz would just add a second resample stage
      // for no fidelity gain (exclusive-mode output does not exist on the web).
      const ctx = window.AudioContext
        ? new AudioContext({ latencyHint: "playback" })
        : new (window as any).webkitAudioContext()
      audioContextRef.current = ctx

      // Once the graph owns the signal, the elements must stay at unity —
      // the master gain node is the single volume stage (element.volume would
      // otherwise attenuate a second time before the graph even sees samples).
      audioRef.current.volume = 1
      audioRef.current.muted = false
      if (secondaryAudioRef?.current) {
        secondaryAudioRef.current.volume = 1
        secondaryAudioRef.current.muted = false
      }

      // Create core nodes
      const masterGain = ctx.createGain()
      masterGain.gain.value = volumeToGain(volumeRef.current)
      gainNodeRef.current = masterGain
      const analyser = ctx.createAnalyser()
      analyserRef.current = analyser

      // Pre-EQ gain: manual preamp + auto-headroom (see updateGainStructure)
      const preampGain = ctx.createGain()
      preampGain.gain.value = 1
      preampGainRef.current = preampGain

      // Normalization gain (per-song loudness correction; unity when disabled)
      const normalizationGain = ctx.createGain()
      normalizationGain.gain.value = 1
      normalizationGainRef.current = normalizationGain

      // Primary source + mix gain
      const primarySource = ctx.createMediaElementSource(audioRef.current)
      sourceNodeRef.current = primarySource
      const primaryMixGain = ctx.createGain()
      primaryMixGain.gain.value = 1
      primaryMixGainRef.current = primaryMixGain
      primarySource.connect(primaryMixGain)

      // Secondary source + mix gain (for gapless)
      if (secondaryAudioRef?.current) {
        const secondarySource = ctx.createMediaElementSource(secondaryAudioRef.current)
        secondarySourceNodeRef.current = secondarySource
        const secondaryMixGain = ctx.createGain()
        secondaryMixGain.gain.value = 0
        secondaryMixGainRef.current = secondaryMixGain
        secondarySource.connect(secondaryMixGain)
      }

      // Create equalizer filter nodes
      const filters = equalizerBands.map((band, index) => {
        const filter = ctx.createBiquadFilter()
        filter.type = index === 0 ? "lowshelf" : index === equalizerBands.length - 1 ? "highshelf" : "peaking"
        if (filter.type === "peaking") filter.Q.value = PEAKING_Q
        filter.frequency.value = band.frequency
        filter.gain.value = band.gain
        return filter
      })
      setFilterNodes(filters)
      filterNodesRef.current = filters

      // Connect graph: mixGains → preamp → filters → normGain → userGain → analyser → dest
      primaryMixGain.connect(preampGain)
      if (secondaryMixGainRef.current) {
        secondaryMixGainRef.current.connect(preampGain)
      }

      // Chain filters together
      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i + 1])
      }

      const firstFilter = filters[0]
      const lastFilter = filters[filters.length - 1]
      if (firstFilter && lastFilter) {
        preampGain.connect(firstFilter)
        lastFilter.connect(normalizationGain)
      } else {
        preampGain.connect(normalizationGain)
      }
      normalizationGain.connect(masterGain)
      masterGain.connect(analyser)
      analyser.connect(ctx.destination)

      // Seed preamp/normalization from current settings (auto-headroom included)
      eqMaxBoostRef.current = equalizerBands.reduce((max, band) => Math.max(max, band.gain), 0)
      updateGainStructure()
    }
  }, [equalizerBands, audioRef, secondaryAudioRef, updateGainStructure])

  /**
   * Settle any in-flight crossfade instantly: incoming track at unity mix,
   * outgoing track silenced and paused. Idempotent — safe to call when no
   * crossfade is active (it still clears a stale settle timeout).
   *
   * The settle is deliberately instant, not ramped: it runs either once the
   * master gain is silent (deferred pause path) or at a track-change/seek
   * boundary where a hard cut is expected. In the one rare race where it can
   * be briefly audible (resume within the 0.4s pause-fade), a deterministic
   * micro-cut beats leaving curves and element state to fight each other.
   *
   * NOTE: relies on activeElementRef already pointing at the incoming track
   * (swapToPreloaded swaps it synchronously when the crossfade starts).
   */
  const finalizeCrossfade = useCallback(() => {
    if (pendingCrossfadeStopRef.current) {
      clearTimeout(pendingCrossfadeStopRef.current)
      pendingCrossfadeStopRef.current = null
    }
    if (!crossfadeActiveRef.current) return
    crossfadeActiveRef.current = false

    const t = audioContextRef.current?.currentTime ?? 0
    const incomingMixGain = getActiveMixGain()
    const outgoingMixGain = getInactiveMixGain()
    if (incomingMixGain) {
      cancelRamps(incomingMixGain.gain, t)
      incomingMixGain.gain.value = 1
    }
    if (outgoingMixGain) {
      cancelRamps(outgoingMixGain.gain, t)
      outgoingMixGain.gain.value = 0
    }
    const outgoingAudio = getInactiveAudio()
    if (outgoingAudio && !outgoingAudio.paused) {
      outgoingAudio.pause()
      outgoingAudio.currentTime = 0
    }
  }, [getActiveMixGain, getInactiveMixGain, getInactiveAudio])

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

    // Settle any previous transition first (rapid double-skip) so its curves
    // and settle timeout can't fight the one we're about to start.
    finalizeCrossfade()

    // If we're swapping out of a paused state (e.g. skip near end-of-track),
    // the pause-fade may have left the master gain at ~0 — clear it so the
    // incoming track is audible.
    if (pendingPauseRef.current) {
      clearTimeout(pendingPauseRef.current)
      pendingPauseRef.current = null
    }
    if (gainNodeRef.current) {
      const gt = ctx?.currentTime ?? 0
      cancelRamps(gainNodeRef.current.gain, gt)
      gainNodeRef.current.gain.value = volumeToGain(volumeRef.current)
    }

    inactiveAudio.play().catch(() => {})

    // Default to the auto-advance length; manual changes pass a shorter one.
    const crossfadeSec = durationSec ?? crossfadeDurationRef.current

    if (crossfadeSec > 0 && ctx) {
      // Equal-power crossfade: ramp old out, new in, then settle once done.
      const now = ctx.currentTime
      cancelRamps(activeMixGain.gain, now)
      cancelRamps(inactiveMixGain.gain, now)
      activeMixGain.gain.setValueCurveAtTime(FADE_OUT_CURVE, now, crossfadeSec)
      inactiveMixGain.gain.setValueCurveAtTime(FADE_IN_CURVE, now, crossfadeSec)

      crossfadeActiveRef.current = true
      pendingCrossfadeStopRef.current = setTimeout(() => {
        pendingCrossfadeStopRef.current = null
        finalizeCrossfade()
      }, crossfadeSec * 1000 + 50)
    } else {
      // Instant swap: mute old, unmute new
      const t = ctx?.currentTime ?? 0
      cancelRamps(activeMixGain.gain, t)
      cancelRamps(inactiveMixGain.gain, t)
      activeMixGain.gain.value = 0
      inactiveMixGain.gain.value = 1
      if (activeAudio) {
        activeAudio.pause()
        activeAudio.currentTime = 0
      }
    }

    // Swap active tracking. The crossfade settle path (finalizeCrossfade)
    // depends on this happening while the curves run: after the swap,
    // "active" is the incoming track and "inactive" the outgoing one.
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
  }, [getActiveAudio, getInactiveAudio, getActiveMixGain, getInactiveMixGain, finalizeCrossfade])

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
      cancelRamps(inactiveMixGain.gain, ctx.currentTime)
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
    // Settle any in-flight crossfade (clears its timeout + curves).
    finalizeCrossfade()

    // Stop secondary audio if playing
    const secondaryAudio = secondaryAudioRef?.current
    if (secondaryAudio) {
      secondaryAudio.pause()
      // eslint-disable-next-line react-hooks/immutability -- HTMLMediaElement, not React state
      secondaryAudio.currentTime = 0
    }

    // Cancel any pending pause-fade timeout and restore the master gain. A
    // pause-fade ramps the master gain to ~0 and defers the element.pause();
    // skipping to a new track from a paused state must NOT inherit that silence
    // (the bug: next track played but was inaudible until a manual pause/play).
    if (pendingPauseRef.current) {
      clearTimeout(pendingPauseRef.current)
      pendingPauseRef.current = null
    }

    // Reset mix gains: primary=1, secondary=0 (cancel any scheduled crossfade ramps first)
    const ctxTime = audioContextRef.current?.currentTime ?? 0
    if (primaryMixGainRef.current) {
      cancelRamps(primaryMixGainRef.current.gain, ctxTime)
      primaryMixGainRef.current.gain.value = 1
    }
    if (secondaryMixGainRef.current) {
      cancelRamps(secondaryMixGainRef.current.gain, ctxTime)
      secondaryMixGainRef.current.gain.value = 0
    }
    // Restore master gain to the current volume so the new track starts
    // audible. Ramped: a skip can land mid pause-fade, and an instant jump
    // from the partially-faded level would click.
    const ctx = audioContextRef.current
    if (gainNodeRef.current && ctx) {
      rampToValue(gainNodeRef.current.gain, ctx, volumeToGain(volumeRef.current), 0.01)
    } else if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volumeToGain(volumeRef.current)
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
  }, [secondaryAudioRef, finalizeCrossfade])

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
    // If playback was paused mid-crossfade, the blend was frozen — settle it
    // now so exactly one track is audible on resume. (The master gain is near
    // silence at this point, so the clamp itself is inaudible.)
    finalizeCrossfade()

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
        const target = volumeToGain(volumeRef.current)
        // Read the clock only now — resume()/play() above may have taken time.
        const now = ctx.currentTime
        // cancelRamps holds the currently-audible value, so the anchor below
        // ramps from what the listener actually hears (no pop when play is
        // hit mid pause-fade).
        cancelRamps(gain.gain, now)
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
  }, [getActiveAudio, finalizeCrossfade])

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
      cancelRamps(gain.gain, now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(0.0001, now + PAUSE_FADE_SECONDS)

      // Freeze any in-flight crossfade blend while the master fades out; it
      // is settled for good once we're silent (deferred pause below). Doing
      // the settle now would audibly cut the blend mid-fade.
      if (crossfadeActiveRef.current) {
        if (primaryMixGainRef.current) cancelRamps(primaryMixGainRef.current.gain, now)
        if (secondaryMixGainRef.current) cancelRamps(secondaryMixGainRef.current.gain, now)
      }

      if (pendingPauseRef.current) clearTimeout(pendingPauseRef.current)
      pendingPauseRef.current = setTimeout(() => {
        audio.pause()
        pendingPauseRef.current = null
        // Silent now — settle the frozen blend and stop the outgoing element.
        finalizeCrossfade()
      }, PAUSE_FADE_SECONDS * 1000 + 20)
    } else {
      audio.pause()
    }

    setIsPlaying(false)
  }, [getActiveAudio, finalizeCrossfade])

  /**
   * Seek to a specific time in the audio. Settles any in-flight crossfade
   * first — seeking during a transition should land cleanly on the active
   * track only, not resume a half-finished blend.
   */
  const seek = useCallback((time: number) => {
    finalizeCrossfade()
    const audio = getActiveAudio()
    if (audio) {
      audio.currentTime = time
    }
  }, [getActiveAudio, finalizeCrossfade])

  /**
   * Change volume and update audio nodes.
   *
   * After the Web Audio graph exists, the media elements are pinned to unity
   * and the master gain node is the single volume stage (applying both would
   * square the attenuation). Before the graph exists (nothing has ever
   * played), element volume is the only stage available.
   */
  const changeVolume = useCallback((value: number[]) => {
    setVolume(value)
    const vol = value[0]
    volumeRef.current = vol

    const ctx = audioContextRef.current
    if (ctx && gainNodeRef.current) {
      if (audioRef.current) {
        audioRef.current.volume = 1
        audioRef.current.muted = false
      }
      if (secondaryAudioRef?.current) {
        secondaryAudioRef.current.volume = 1
        secondaryAudioRef.current.muted = false
      }
      // Skip touching the master gain mid pause-fade — the new level is captured
      // in volumeRef and applied on the next play() ramp, avoiding an audible blip.
      if (!pendingPauseRef.current) {
        rampToValue(gainNodeRef.current.gain, ctx, volumeToGain(vol), 0.01)
      }
    } else {
      if (audioRef.current) {
        audioRef.current.volume = vol / 100
        audioRef.current.muted = vol === 0
      }
      if (secondaryAudioRef?.current) {
        secondaryAudioRef.current.volume = vol / 100
        secondaryAudioRef.current.muted = vol === 0
      }
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
   * Set the loudness-normalization gain correction (in dB) for the current
   * song. Only takes effect while normalization is enabled; the engine keeps
   * the last value so toggling normalization on applies it immediately.
   */
  const applyNormalization = useCallback((dbCorrection: number) => {
    normDbRef.current = dbCorrection
    updateGainStructure()
  }, [updateGainStructure])

  /** Enable/disable loudness normalization (default: disabled = transparent). */
  const setNormalizationEnabled = useCallback((enabled: boolean) => {
    normalizationEnabledRef.current = enabled
    updateGainStructure()
  }, [updateGainStructure])

  /** Set the manual preamp (dB, applied pre-EQ on top of auto-headroom). */
  const setPreamp = useCallback((db: number) => {
    preampDbRef.current = db
    updateGainStructure()
  }, [updateGainStructure])

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
          preampGainRef.current?.disconnect()
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
        preampGainRef.current = null
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
      setPlaybackTime(time)
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
    duration,
    volume,
    isMuted,
    filterNodes,

    // Actions
    setIsPlaying,
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
    setNormalizationEnabled,
    setPreamp,

    // Gapless methods
    preloadNextSong,
    swapToPreloaded,
    resetGaplessState,
    isPreloaded,
    crossfadeTo,
  }
}
