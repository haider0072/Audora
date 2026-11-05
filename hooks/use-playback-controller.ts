"use client"

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"

import type { Song } from "@/lib/song"
import type { RollDirection } from "@/components/player/rolling-text"
import type { useAudioEngine } from "@/hooks/use-audio-engine"
import type { usePlaylistManager } from "@/hooks/use-playlist-manager"
import { toast } from "@/hooks/use-toast"
import { LoudnessAnalyzer } from "@/lib/loudness-analyzer"
import { createMediaUrl, releaseMediaUrl, songSource, type PlayableSource } from "@/lib/media-source"
import { waitForCanPlay } from "@/lib/utils"

type AudioEngine = ReturnType<typeof useAudioEngine>
type PlaylistManager = ReturnType<typeof usePlaylistManager>

interface TransportHandlers {
  ended: () => void
  nearEnd: () => void
}

/**
 * Stable callbacks for the audio engine's track events. The engine is created
 * before the controller that handles those events, so the engine gets these,
 * and the controller points them at its latest handlers once it exists.
 */
export function useTransportEvents() {
  const handlers = useRef<TransportHandlers>({ ended: () => {}, nearEnd: () => {} })
  const onEnded = useCallback(() => handlers.current.ended(), [])
  const onNearEnd = useCallback(() => handlers.current.nearEnd(), [])
  return { handlers, onEnded, onNearEnd }
}

export type TransportEvents = ReturnType<typeof useTransportEvents>

interface SelectOptions {
  /** The song follows on from the last one: gapless when it was preloaded. */
  isAutoAdvance?: boolean
  /** Which way the change reads on screen: 1 forward, -1 back. */
  direction?: RollDirection
}

interface PlaybackControllerOptions {
  audioRef: RefObject<HTMLAudioElement | null>
  engine: AudioEngine
  playlist: PlaylistManager
  normalizationEnabled: boolean
  preloadUpcomingSongs: () => void
  /** True while this device follows another in a sync session: track changes then come from the host. */
  isFollowingRef: RefObject<boolean>
  events: TransportEvents
}

function errorName(error: unknown): string | undefined {
  return error instanceof DOMException || error instanceof Error ? error.name : undefined
}

/** Wait out a `play()` still in flight. One that a newer load interrupted is expected. */
async function settlePendingPlay(pending: Promise<void> | null) {
  if (!pending) return
  try {
    await pending
  } catch (error) {
    if (errorName(error) !== "AbortError") console.error("Play promise error:", error)
  }
}

/** Tell the listener why a song did not start, unless they caused it themselves. */
function reportPlaybackError(error: unknown) {
  const name = errorName(error)
  if (name === "AbortError") return
  if (name === "NotAllowedError") {
    // The browser wants a fresh tap before it plays (mobile autoplay rules).
    toast({ title: "Tap play to start", description: "The browser needs a tap before this song can play." })
    return
  }
  console.error("Error playing song:", error)
  toast({ title: "This song couldn't play", variant: "destructive" })
}

/**
 * Choosing and transporting songs, shared by the desktop and phone players.
 *
 * A pick answers in the same frame: `displaySong` switches to it at once, and
 * `isLoading` holds until its sound starts. The audio path is unchanged — a
 * preloaded next song still swaps in gaplessly, a pick while music plays
 * still crossfades in once the new song can play, and a pick from silence
 * loads straight into the primary element.
 */
export function usePlaybackController({
  audioRef,
  engine,
  playlist,
  normalizationEnabled,
  preloadUpcomingSongs,
  isFollowingRef,
  events,
}: PlaybackControllerOptions) {
  const {
    isPlaying, setIsPlaying, playPromiseRef, initializeAudioContext, play, pause,
    applyNormalization, preloadNextSong, swapToPreloaded, resetGaplessState, isPreloaded, crossfadeTo,
  } = engine
  const { currentSong, setCurrentSong, setSongs, sortedSongs, getNextSong, getPreviousSong, notifySongSelected } = playlist

  /** The song picked but not yet heard. */
  const [pendingSong, setPendingSong] = useState<Song | null>(null)
  const [direction, setDirection] = useState<RollDirection>(1)
  const selectionRef = useRef<AbortController | null>(null)
  /** The song preloaded into the idle element for a gapless advance. */
  const gaplessNextRef = useRef<Song | null>(null)

  /** Let go of the outgoing song's media URL, unless the incoming song reuses it. */
  const releaseOutgoingUrl = useCallback(
    (incoming: Song) => {
      if (currentSong?.url !== incoming.url) releaseMediaUrl(currentSong?.url)
    },
    [currentSong?.url],
  )

  /** Point the primary element at a song's source and make it the current song. */
  const loadIntoPrimary = useCallback(
    (audio: HTMLAudioElement, song: Song, source: PlayableSource) => {
      const audioUrl = createMediaUrl(source)
      setCurrentSong({ ...song, url: audioUrl })
      audio.src = audioUrl
      audio.load()
    },
    [setCurrentSong],
  )

  /** The picked song is now the one playing. */
  const commit = useCallback(
    (song: Song, isAutoAdvance: boolean) => {
      releaseOutgoingUrl(song)
      setCurrentSong(song)
      setIsPlaying(true)
      notifySongSelected(song, isAutoAdvance)
      preloadUpcomingSongs()
    },
    [releaseOutgoingUrl, setCurrentSong, setIsPlaying, notifySongSelected, preloadUpcomingSongs],
  )

  const selectSong = useCallback(
    async (song: Song, { isAutoAdvance = false, direction: changeDirection = 1 }: SelectOptions = {}) => {
      // A newer pick supersedes this one at every await below.
      selectionRef.current?.abort()
      const abort = new AbortController()
      selectionRef.current = abort
      const isCurrent = () => !abort.signal.aborted

      setDirection(changeDirection)
      // A preloaded next song swaps in at once, so it needs no loading state.
      const expectsGapless = isAutoAdvance && isPreloaded && gaplessNextRef.current?.id === song.id
      if (!expectsGapless) setPendingSong(song)

      await settlePendingPlay(playPromiseRef.current)
      if (!isCurrent()) return

      if (expectsGapless && gaplessNextRef.current?.id === song.id) {
        applyNormalization(song.gainCorrection ?? 0)
        gaplessNextRef.current = null
        if (swapToPreloaded()) {
          commit(song, isAutoAdvance)
          return
        }
        setPendingSong(song) // the swap fell through; load it the slow way
      }
      gaplessNextRef.current = null

      // Loudness is measured lazily, on first play, and only while
      // normalization is on: decoding a whole FLAC for a correction that would
      // not be applied is wasted memory.
      if (normalizationEnabled && song.loudnessLUFS == null && song.file) {
        LoudnessAnalyzer.analyze(song.file)
          .then((loudness) => {
            setSongs((prev) =>
              prev.map((s) =>
                s.id === song.id ? { ...s, loudnessLUFS: loudness.lufs, gainCorrection: loudness.gainCorrection } : s,
              ),
            )
            // The listener may have moved on before the analysis finished.
            if (isCurrent()) applyNormalization(loudness.gainCorrection)
          })
          .catch((error: unknown) => console.warn("Loudness analysis failed; playing without a correction:", error))
      }

      const source = songSource(song)
      if (!source) {
        console.error("Song has neither a local file nor a cloud copy:", song.id)
        toast({ title: "This song can't be played", variant: "destructive" })
        setPendingSong(null)
        return
      }

      // While something plays, blend into the new song through the idle
      // element. False means there is nothing to fade from (or crossfade is
      // off), and the song loads normally below.
      applyNormalization(song.gainCorrection ?? 0)
      const faded = await crossfadeTo(source, abort.signal)
      if (!isCurrent()) return
      if (faded) {
        commit(song, isAutoAdvance)
        setPendingSong(null)
        return
      }

      // Load into the primary element. The song's correction is already applied
      // above, and a loudness analysis that finished meanwhile has set a fresher one.
      resetGaplessState()
      releaseOutgoingUrl(song)
      preloadUpcomingSongs()
      setIsPlaying(false)
      notifySongSelected(song, isAutoAdvance)

      const audio = audioRef.current
      if (!audio) {
        setCurrentSong(song)
        setPendingSong(null)
        return
      }
      audio.pause()
      loadIntoPrimary(audio, song, source)

      try {
        await waitForCanPlay(audio)
        if (!isCurrent()) return
        initializeAudioContext()
        playPromiseRef.current = audio.play()
        await playPromiseRef.current
        if (isCurrent()) setIsPlaying(true)
      } catch (error) {
        if (!isCurrent()) return
        setIsPlaying(false)
        reportPlaybackError(error)
      } finally {
        if (isCurrent()) setPendingSong(null)
      }
    },
    [
      audioRef, isPreloaded, normalizationEnabled, playPromiseRef,
      applyNormalization, swapToPreloaded, crossfadeTo, resetGaplessState, initializeAudioContext, setIsPlaying,
      commit, releaseOutgoingUrl, loadIntoPrimary, notifySongSelected, preloadUpcomingSongs, setCurrentSong, setSongs,
    ],
  )

  /**
   * Put the current song into the primary element when nothing is loaded.
   * After a restored session the playlist holds a song but no element has a
   * source yet, so anything that starts playback has to cover that case — the
   * play button and, in a sync session, the follower.
   */
  const ensureSourceLoaded = useCallback(async () => {
    const audio = audioRef.current
    const source = songSource(currentSong)
    if (!audio || audio.src || !currentSong || !source) return

    resetGaplessState() // load into the primary element
    loadIntoPrimary(audio, currentSong, source)
    await waitForCanPlay(audio)
  }, [audioRef, currentSong, resetGaplessState, loadIntoPrimary])

  const startPlayback = useCallback(async () => {
    try {
      await ensureSourceLoaded()
      initializeAudioContext()
      await play()
    } catch (error) {
      setIsPlaying(false)
      reportPlaybackError(error)
    }
  }, [ensureSourceLoaded, initializeAudioContext, play, setIsPlaying])

  const togglePlayPause = useCallback(async () => {
    if (!currentSong) return
    await settlePendingPlay(playPromiseRef.current)
    if (isPlaying) pause()
    else await startPlayback()
  }, [currentSong, isPlaying, pause, playPromiseRef, startPlayback])

  // The Next button and a song ending take the same path, so a preloaded next
  // song swaps in gaplessly either way.
  const skipToNext = useCallback(() => {
    // A follower takes track changes from the host. Advancing on its own would
    // race the host's own advance and leave the two devices on different songs.
    if (isFollowingRef.current) return
    const next = getNextSong()
    if (next) void selectSong(next, { isAutoAdvance: true, direction: 1 })
  }, [getNextSong, isFollowingRef, selectSong])

  const skipToPrevious = useCallback(() => {
    const previous = getPreviousSong()
    if (previous) void selectSong(previous, { direction: -1 })
  }, [getPreviousSong, selectSong])

  const displaySong = pendingSong ?? currentSong

  // The list handler reads these through a ref so its identity never changes:
  // a new handler would re-render every row, and a pick changes all three.
  const listState = useRef({ selectSong, displaySongId: displaySong?.id, sortedSongs })
  useEffect(() => {
    listState.current = { selectSong, displaySongId: displaySong?.id, sortedSongs }
  }, [selectSong, displaySong?.id, sortedSongs])

  /** A pick from the list rolls the way it moves through the list. */
  const handleSongSelect = useCallback((song: Song) => {
    const { selectSong: select, displaySongId, sortedSongs: order } = listState.current
    const from = displaySongId ? order.findIndex((s) => s.id === displaySongId) : -1
    const to = order.findIndex((s) => s.id === song.id)
    void select(song, { direction: from !== -1 && to < from ? -1 : 1 })
  }, [])

  /** Preload the next song into the idle element so the change is gapless. */
  const prepareGaplessNext = useCallback(() => {
    const next = getNextSong()
    const source = songSource(next)
    if (next && source) {
      gaplessNextRef.current = next
      preloadNextSong(source)
    }
  }, [getNextSong, preloadNextSong])

  useEffect(() => {
    events.handlers.current = { ended: skipToNext, nearEnd: prepareGaplessNext }
  }, [events, skipToNext, prepareGaplessNext])

  return {
    selectSong,
    handleSongSelect,
    startPlayback,
    togglePlayPause,
    skipToNext,
    skipToPrevious,
    /** What the screen shows as playing: the pick, from the moment it is made. */
    displaySong,
    /** A picked song is loading. */
    isLoading: pendingSong !== null,
    /** Which way the last change reads on screen. */
    direction,
  }
}
