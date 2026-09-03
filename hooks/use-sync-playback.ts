"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import {
  DRIFT_SEEK_SEC,
  decideCorrection,
  projectHostPosition,
  type PlaybackState,
  type SyncMessage,
  type TrackKey,
} from "@/lib/sync/protocol"
import { getNullOffsetSec } from "@/lib/sync/null-offset"
import { setDriftStat } from "@/lib/sync/sync-stats-store"
import type { UseSyncSessionReturn } from "@/hooks/use-sync-session"

/**
 * Keeps this device's playback in step with the other one.
 *
 * The host does almost nothing: it describes where it is, often enough that
 * the follower is never extrapolating far. All the work is on the follower,
 * which repeatedly asks "where should I be?", compares that to where it is,
 * and closes the gap by running fractionally fast or slow.
 *
 * Playback is reached only through the adapter. The hook never touches the
 * audio engine, the playlist, or React state belonging to the player, which
 * is what lets the same logic serve both the desktop and mobile shells.
 */

/** How often the host describes itself. */
const BROADCAST_INTERVAL_MS = 2_000

/** How often the follower checks itself against the host. */
const CORRECTION_INTERVAL_MS = 1_000

/**
 * Quiet period after a seek or a track load. An element that has just been
 * repositioned reports its old position for a moment, and correcting against
 * that reading would seek again, and again.
 */
const SEEK_SETTLE_MS = 700

export interface SyncPlaybackAdapter {
  /** Cross-device key of the loaded track, or null when nothing is loaded. */
  getTrackKey: () => TrackKey | null
  /** Display label for the loaded track. */
  getTrackLabel: () => string
  getPosition: () => number
  isPlaying: () => boolean
  /** `AudioContext.outputLatency` in seconds, or 0 when unknown. */
  getOutputLatency: () => number
  /** Load the track with this key. False when this device does not have it. */
  selectTrackByKey: (key: TrackKey) => Promise<boolean>
  play: () => void
  pause: () => void
  seek: (position: number) => void
  setRate: (rate: number) => void
}

export interface UseSyncPlaybackOptions {
  session: UseSyncSessionReturn
  adapter: SyncPlaybackAdapter
}

export interface UseSyncPlaybackReturn {
  /** Label of a host track this device does not hold, when that happens. */
  missingTrackLabel: string | null
  /** Describe this device to the peer. The host calls this on every change. */
  broadcast: () => void
}

export function useSyncPlayback(options: UseSyncPlaybackOptions): UseSyncPlaybackReturn {
  const { session, adapter } = options
  const { isConnected, isFollowing, getClock, send, subscribe } = session

  // The timers below run between renders, so everything they read is mirrored
  // into refs. Written in an effect rather than during render: this codebase
  // treats a ref write in the render path as a lint error, and an effect with
  // no dependency list runs after every commit anyway.
  const adapterRef = useRef(adapter)
  useEffect(() => {
    adapterRef.current = adapter
  })

  const latestStateRef = useRef<PlaybackState | null>(null)
  const seqRef = useRef(0)
  const trimmingRef = useRef(false)
  const settleUntilRef = useRef(0)
  /** Guards the async track load so a burst of states cannot stack loads. */
  const loadingKeyRef = useRef<TrackKey | null>(null)

  const [missingTrackLabel, setMissingTrackLabel] = useState<string | null>(null)

  const broadcast = useCallback(() => {
    const source = adapterRef.current
    send({
      t: "state",
      state: {
        trackKey: source.getTrackKey(),
        trackLabel: source.getTrackLabel(),
        position: source.getPosition(),
        playing: source.isPlaying(),
        sampledAt: performance.now(),
        rate: 1,
        outputLatency: source.getOutputLatency(),
        seq: ++seqRef.current,
      },
    })
  }, [send])

  /**
   * Load the track the host is on.
   *
   * Kept separate from the correction tick so a track change can act the
   * moment its state message lands rather than waiting for the next tick — at
   * a track boundary that difference is an audible gap.
   */
  const adoptTrack = useCallback(
    async (state: PlaybackState) => {
      const key = state.trackKey
      if (!key || loadingKeyRef.current === key) return
      loadingKeyRef.current = key

      try {
        const found = await adapterRef.current.selectTrackByKey(key)
        if (!found) {
          setMissingTrackLabel(state.trackLabel)
          send({ t: "missing", trackKey: key })
          return
        }
        setMissingTrackLabel(null)
        // A freshly loaded element starts at zero; let the next tick place it
        // rather than seeking against a position that is about to change.
        settleUntilRef.current = performance.now() + SEEK_SETTLE_MS
      } catch (error) {
        console.error("Could not load the track the other device is playing:", error)
        setMissingTrackLabel(state.trackLabel)
      } finally {
        loadingKeyRef.current = null
      }
    },
    [send],
  )

  // Host: describe playback on a heartbeat. Transport changes are announced
  // immediately by the player calling `broadcast`; this covers the drift in
  // between and gives a freshly joined follower something to lock onto.
  useEffect(() => {
    if (!isConnected || isFollowing) return

    broadcast()
    const timer = setInterval(broadcast, BROADCAST_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [isConnected, isFollowing, broadcast])

  // Follower: take in the host's state.
  useEffect(() => {
    if (!isFollowing) {
      latestStateRef.current = null
      return
    }

    return subscribe((message: SyncMessage) => {
      if (message.t !== "state") return
      const incoming = message.state
      const current = latestStateRef.current
      // Out-of-order delivery would otherwise rewind the target.
      if (current && incoming.seq <= current.seq) return
      latestStateRef.current = incoming

      if (incoming.trackKey && incoming.trackKey !== adapterRef.current.getTrackKey()) {
        void adoptTrack(incoming)
      }
    })
  }, [isFollowing, subscribe, adoptTrack])

  // Follower: hold position against the host.
  useEffect(() => {
    if (!isFollowing) {
      // Leaving follower duty must not leave the deck running trimmed.
      adapterRef.current.setRate(1)
      trimmingRef.current = false
      setDriftStat(null)
      return
    }

    const correct = () => {
      const state = latestStateRef.current
      const source = adapterRef.current
      if (!state) return

      // Acting on an unsettled clock would mean seeking to a guess.
      const clock = getClock()
      if (!clock.locked) return

      if (!state.trackKey) {
        if (source.isPlaying()) source.pause()
        setDriftStat(null)
        return
      }

      // Position is meaningless against the wrong track.
      if (state.trackKey !== source.getTrackKey()) {
        void adoptTrack(state)
        return
      }

      if (state.playing && !source.isPlaying()) {
        source.play()
      } else if (!state.playing && source.isPlaying()) {
        source.pause()
        source.setRate(1)
        trimmingRef.current = false
      }

      if (performance.now() < settleUntilRef.current) return

      const target = projectHostPosition({
        state,
        localNow: performance.now(),
        clockOffsetMs: clock.offsetMs,
        localOutputLatency: source.getOutputLatency(),
        nullOffsetSec: getNullOffsetSec(),
      })

      const error = target - source.getPosition()

      if (!state.playing) {
        // There is no drift to trim while stopped, but a seek made on the
        // other device still has to land here — otherwise it would not appear
        // until playback resumed.
        setDriftStat(null)
        if (Math.abs(error) > DRIFT_SEEK_SEC) {
          source.seek(target)
          settleUntilRef.current = performance.now() + SEEK_SETTLE_MS
        }
        return
      }

      setDriftStat(error * 1000)

      const correction = decideCorrection(error, target, trimmingRef.current)
      switch (correction.kind) {
        case "seek":
          source.setRate(1)
          source.seek(correction.position)
          trimmingRef.current = false
          settleUntilRef.current = performance.now() + SEEK_SETTLE_MS
          break
        case "trim":
          source.setRate(correction.rate)
          trimmingRef.current = true
          break
        case "locked":
          source.setRate(1)
          trimmingRef.current = false
          break
      }
    }

    const timer = setInterval(correct, CORRECTION_INTERVAL_MS)
    return () => {
      clearInterval(timer)
      adapterRef.current.setRate(1)
      trimmingRef.current = false
      setDriftStat(null)
    }
  }, [isFollowing, getClock, adoptTrack])

  // A session that ends while a track was missing should not keep saying so.
  useEffect(() => {
    if (!isConnected) setMissingTrackLabel(null)
  }, [isConnected])

  return { missingTrackLabel, broadcast }
}
