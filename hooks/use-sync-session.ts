"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { ClockSync } from "@/lib/sync/clock"
import { SYNC_PROTOCOL_VERSION, type SyncMessage } from "@/lib/sync/protocol"
import { createPeerId, createRoomCode } from "@/lib/sync/signaling"
import { resetSyncStats, setClockStats } from "@/lib/sync/sync-stats-store"
import { SyncTransport, describeDevice, type TransportStatus } from "@/lib/sync/transport"

/**
 * Owns one sync session: the link to the other device, which side is driving,
 * and how far apart the two clocks are.
 *
 * Deliberately knows nothing about playback. It carries messages and maintains
 * the clock estimate; `use-sync-playback` decides what the messages mean. That
 * split keeps the part that has to be right about time separate from the part
 * that has to be right about audio.
 */

export type SyncRole = "host" | "follower"

/**
 * Ping cadence before the clock estimate has settled. Fast, because until it
 * locks the follower has nothing trustworthy to correct against.
 */
const CLOCK_PING_FAST_MS = 150

/** Cadence once locked — enough to track drift without being chatty. */
const CLOCK_PING_STEADY_MS = 750

export interface UseSyncSessionReturn {
  status: TransportStatus
  /** Human-readable reason for a failure, when there is one. */
  detail: string | null
  role: SyncRole
  room: string | null
  /** Name the other device reported, once it has said hello. */
  peerName: string | null
  /**
   * Current clock estimate. A function rather than a value because it changes
   * several times a second: returning it as state would re-render every
   * consumer at that rate. The displayable copy lives in `sync-stats-store`.
   */
  getClock: () => { offsetMs: number; locked: boolean }
  /** True once the peer connection is up. */
  isConnected: boolean
  /** True while this device is taking transport from the other one. */
  isFollowing: boolean

  /** Start a session as host and return the room code to read out. */
  startHosting: () => string
  /** Join an existing session as follower. */
  join: (room: string) => void
  /** Hand transport control to the peer, becoming the follower. */
  handOver: () => void
  leave: () => void
  send: (message: SyncMessage) => void
  /**
   * Listen for messages from the peer. Clock pings are handled internally and
   * never reach subscribers. Returns an unsubscribe function.
   */
  subscribe: (handler: (message: SyncMessage) => void) => () => void
}

export function useSyncSession(): UseSyncSessionReturn {
  const transportRef = useRef<SyncTransport | null>(null)
  const clockRef = useRef(new ClockSync())
  const pingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingSeqRef = useRef(0)
  /** t0 for each in-flight ping, so a late pong still measures its own trip. */
  const pendingPingsRef = useRef(new Map<number, number>())
  const roleRef = useRef<SyncRole>("host")
  // Subscribers live in a ref so the transport's message handler stays stable
  // across renders while still reaching whoever is currently listening.
  const subscribersRef = useRef(new Set<(message: SyncMessage) => void>())

  const [status, setStatus] = useState<TransportStatus>("idle")
  const [detail, setDetail] = useState<string | null>(null)
  const [role, setRole] = useState<SyncRole>("host")
  const [room, setRoom] = useState<string | null>(null)
  const [peerName, setPeerName] = useState<string | null>(null)

  const stopPinging = useCallback(() => {
    if (pingTimerRef.current) {
      clearTimeout(pingTimerRef.current)
      pingTimerRef.current = null
    }
    pendingPingsRef.current.clear()
  }, [])

  /**
   * Run the clock ping loop.
   *
   * Each ping schedules the next rather than running on an interval, because
   * the cadence drops once the estimate locks and an interval would keep
   * firing at the rate it was created with.
   */
  const startPinging = useCallback(() => {
    function scheduleNext() {
      const clock = clockRef.current
      const delay = clock.isLocked ? CLOCK_PING_STEADY_MS : CLOCK_PING_FAST_MS

      pingTimerRef.current = setTimeout(() => {
        const transport = transportRef.current
        if (!transport?.isConnected) return

        const seq = ++pingSeqRef.current
        const t0 = performance.now()
        pendingPingsRef.current.set(seq, t0)

        // Anything this old lost its pong; holding it would leak.
        if (pendingPingsRef.current.size > 32) {
          const oldest = pendingPingsRef.current.keys().next().value
          if (oldest !== undefined) pendingPingsRef.current.delete(oldest)
        }

        transport.sendClock({ t: "ping", seq, t0 })
        scheduleNext()
      }, delay)
    }

    scheduleNext()
  }, [])

  const handleMessage = useCallback((message: SyncMessage) => {
    const transport = transportRef.current

    switch (message.t) {
      case "ping":
        // Reply on the same lossy channel with the local reading of "now".
        transport?.sendClock({ t: "pong", seq: message.seq, t0: message.t0, t1: performance.now() })
        return

      case "pong": {
        const sentAt = pendingPingsRef.current.get(message.seq)
        if (sentAt === undefined) return
        pendingPingsRef.current.delete(message.seq)

        const clock = clockRef.current
        clock.addRoundTrip(sentAt, message.t1, performance.now())
        setClockStats(clock.bestRtt, clock.offset, clock.isLocked)
        return
      }

      case "hello":
        setPeerName(message.deviceName)
        if (message.version !== SYNC_PROTOCOL_VERSION) {
          setDetail("The other device is running a different version of Audora.")
        }
        return

      case "handover":
        // The peer gave up control, so this device now drives.
        roleRef.current = "host"
        setRole("host")
        return

      default:
        subscribersRef.current.forEach((handler) => handler(message))
    }
  }, [])

  const subscribe = useCallback((handler: (message: SyncMessage) => void) => {
    const subscribers = subscribersRef.current
    subscribers.add(handler)
    return () => {
      subscribers.delete(handler)
    }
  }, [])

  const openTransport = useCallback(
    (roomCode: string, asHost: boolean) => {
      transportRef.current?.close()
      stopPinging()
      clockRef.current.reset()
      resetSyncStats()
      setPeerName(null)
      setDetail(null)

      roleRef.current = asHost ? "host" : "follower"
      setRole(roleRef.current)
      setRoom(roomCode)

      const transport = new SyncTransport({
        room: roomCode,
        peerId: createPeerId(),
        isHost: asHost,
        deviceName: describeDevice(),
        onMessage: handleMessage,
        onStatusChange: (next, why) => {
          setStatus(next)
          setDetail(why ?? null)
          if (next === "connected") startPinging()
          else stopPinging()
        },
      })

      transportRef.current = transport
      void transport.connect().catch((error: unknown) => {
        setStatus("failed")
        setDetail(error instanceof Error ? error.message : "Could not start pairing")
      })
    },
    [handleMessage, startPinging, stopPinging],
  )

  const startHosting = useCallback((): string => {
    const code = createRoomCode()
    openTransport(code, true)
    return code
  }, [openTransport])

  const join = useCallback(
    (roomCode: string) => {
      openTransport(roomCode, false)
    },
    [openTransport],
  )

  const handOver = useCallback(() => {
    if (roleRef.current !== "host") return
    transportRef.current?.send({ t: "handover" })
    roleRef.current = "follower"
    setRole("follower")
  }, [])

  const leave = useCallback(() => {
    stopPinging()
    transportRef.current?.close()
    transportRef.current = null
    clockRef.current.reset()
    resetSyncStats()
    setStatus("idle")
    setDetail(null)
    setRoom(null)
    setPeerName(null)
  }, [stopPinging])

  const getClock = useCallback(() => {
    const clock = clockRef.current
    return { offsetMs: clock.offset, locked: clock.isLocked }
  }, [])

  const send = useCallback((message: SyncMessage) => {
    transportRef.current?.send(message)
  }, [])

  // Tear the session down with the component; a live peer connection and its
  // ping loop would otherwise outlive the player.
  useEffect(() => {
    return () => {
      if (pingTimerRef.current) clearTimeout(pingTimerRef.current)
      transportRef.current?.close()
      transportRef.current = null
    }
  }, [])

  const isConnected = status === "connected"

  return {
    status,
    detail,
    role,
    room,
    peerName,
    getClock,
    isConnected,
    isFollowing: isConnected && role === "follower",
    startHosting,
    join,
    handOver,
    leave,
    send,
    subscribe,
  }
}
