import { SIGNAL_POLL_INTERVAL_MS, SignalingChannel, type SignalMessage } from "./signaling"
import { SYNC_PROTOCOL_VERSION, type SyncMessage } from "./protocol"

/**
 * The peer-to-peer link between two devices in a sync session.
 *
 * Once paired, control messages travel directly between the two browsers over
 * the local network rather than through any server. That is the whole point of
 * using WebRTC here: a round trip stays around a millisecond, which is what
 * makes the clock estimate tight enough to be worth acting on. A relay would
 * add tens of milliseconds of jitter to the one measurement everything else
 * is built on.
 *
 * `iceServers` is deliberately empty. With no STUN or TURN configured the
 * connection can only form from host candidates, which means the two devices
 * must be on the same network — exactly the case this feature is for, and the
 * case with the lowest possible latency. The cost is that a router with client
 * isolation turned on will refuse to pair; that surfaces as a plain failure
 * rather than silently falling back to a slow relayed path.
 */

export type TransportStatus =
  | "idle"
  | "signaling"
  | "connecting"
  | "connected"
  | "failed"
  | "closed"

export interface SyncTransportOptions {
  room: string
  peerId: string
  /** The host creates the offer and both data channels. */
  isHost: boolean
  deviceName: string
  onMessage: (message: SyncMessage) => void
  onStatusChange: (status: TransportStatus, detail?: string) => void
}

/** Ordered and reliable: transport commands must not arrive out of order. */
const CONTROL_CHANNEL = "audora-control"

/**
 * Unordered and lossy: clock pings. A retransmitted ping would report the
 * round trip of the retransmission rather than the network, poisoning the very
 * measurement it exists to take, and a lost one costs nothing because another
 * follows immediately.
 */
const CLOCK_CHANNEL = "audora-clock"

/** How long to keep trying before calling the pairing a failure. */
const CONNECT_TIMEOUT_MS = 25_000

export class SyncTransport {
  private pc: RTCPeerConnection | null = null
  private control: RTCDataChannel | null = null
  private clock: RTCDataChannel | null = null
  private signaling: SignalingChannel
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null
  /** Candidates that arrived before the remote description was in place. */
  private pendingCandidates: RTCIceCandidateInit[] = []
  private remoteDescriptionSet = false
  private status: TransportStatus = "idle"
  private disposed = false

  constructor(private readonly options: SyncTransportOptions) {
    this.signaling = new SignalingChannel(options.room, options.peerId)
  }

  /**
   * Establish the peer connection. Resolves once signaling is under way; the
   * caller learns the outcome through `onStatusChange`.
   */
  async connect(): Promise<void> {
    if (this.pc) return

    this.setStatus("signaling")

    const pc = new RTCPeerConnection({ iceServers: [] })
    this.pc = pc

    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      void this.signaling.send("ice", event.candidate.toJSON()).catch(() => {
        // A dropped candidate is survivable — others follow, and ICE retries.
      })
    }

    pc.onconnectionstatechange = () => {
      if (this.disposed) return
      if (pc.connectionState === "failed") {
        this.fail("Could not reach the other device. Both must be on the same network.")
      } else if (pc.connectionState === "disconnected") {
        this.setStatus("failed", "Connection to the other device was lost.")
      }
    }

    if (this.options.isHost) {
      this.attachControl(pc.createDataChannel(CONTROL_CHANNEL, { ordered: true }))
      this.attachClock(
        pc.createDataChannel(CLOCK_CHANNEL, { ordered: false, maxRetransmits: 0 }),
      )
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await this.signaling.send("offer", offer)
    } else {
      pc.ondatachannel = (event) => {
        if (event.channel.label === CONTROL_CHANNEL) this.attachControl(event.channel)
        else if (event.channel.label === CLOCK_CHANNEL) this.attachClock(event.channel)
      }
    }

    this.setStatus("connecting")
    this.startPolling()
    this.startConnectTimeout()
  }

  /** Send a control message. Dropped silently when the channel is not open. */
  send(message: SyncMessage): void {
    if (this.control?.readyState !== "open") return
    this.control.send(JSON.stringify(message))
  }

  /** Send a clock message on the lossy channel. */
  sendClock(message: SyncMessage): void {
    if (this.clock?.readyState !== "open") return
    this.clock.send(JSON.stringify(message))
  }

  get isConnected(): boolean {
    return this.status === "connected"
  }

  close(): void {
    if (this.disposed) return
    this.disposed = true

    this.stopPolling()
    this.clearConnectTimeout()
    void this.signaling.sendBye()
    this.signaling.stop()

    this.control?.close()
    this.clock?.close()
    this.pc?.close()

    this.control = null
    this.clock = null
    this.pc = null

    this.setStatus("closed")
  }

  private attachControl(channel: RTCDataChannel): void {
    this.control = channel
    channel.onopen = () => {
      // Signaling has done its job the moment the direct link is up.
      this.stopPolling()
      this.clearConnectTimeout()
      this.signaling.stop()
      this.setStatus("connected")
      this.send({
        t: "hello",
        version: SYNC_PROTOCOL_VERSION,
        deviceName: this.options.deviceName,
        isHost: this.options.isHost,
      })
    }
    channel.onmessage = (event) => this.dispatch(event.data)
    channel.onclose = () => {
      if (!this.disposed) this.setStatus("failed", "The other device disconnected.")
    }
  }

  private attachClock(channel: RTCDataChannel): void {
    this.clock = channel
    channel.onmessage = (event) => this.dispatch(event.data)
  }

  private dispatch(data: unknown): void {
    if (typeof data !== "string") return
    let message: SyncMessage
    try {
      message = JSON.parse(data) as SyncMessage
    } catch {
      // A frame that is not our JSON did not come from a peer we can talk to.
      // Dropping it is right, and logging every one would hand a noisy peer a
      // way to flood the console.
      return
    }
    if (!message || typeof message.t !== "string") return
    this.options.onMessage(message)
  }

  private startPolling(): void {
    if (this.pollTimer) return
    this.pollTimer = setInterval(() => {
      void this.drainSignals()
    }, SIGNAL_POLL_INTERVAL_MS)
    void this.drainSignals()
  }

  private stopPolling(): void {
    if (!this.pollTimer) return
    clearInterval(this.pollTimer)
    this.pollTimer = null
  }

  private async drainSignals(): Promise<void> {
    if (this.disposed || !this.pc) return

    let messages: SignalMessage[]
    try {
      messages = await this.signaling.poll()
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Pairing failed")
      return
    }

    for (const message of messages) {
      try {
        await this.handleSignal(message)
      } catch (error) {
        console.error("Sync handshake step failed:", error)
      }
    }
  }

  private async handleSignal(message: SignalMessage): Promise<void> {
    const pc = this.pc
    if (!pc) return

    switch (message.type) {
      case "offer": {
        if (this.options.isHost) return
        await pc.setRemoteDescription(message.payload as RTCSessionDescriptionInit)
        this.remoteDescriptionSet = true
        await this.flushCandidates()
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await this.signaling.send("answer", answer)
        break
      }
      case "answer": {
        if (!this.options.isHost || this.remoteDescriptionSet) return
        await pc.setRemoteDescription(message.payload as RTCSessionDescriptionInit)
        this.remoteDescriptionSet = true
        await this.flushCandidates()
        break
      }
      case "ice": {
        const candidate = message.payload as RTCIceCandidateInit
        // A candidate cannot be added before the remote description exists, and
        // trickled candidates routinely arrive first.
        if (!this.remoteDescriptionSet) this.pendingCandidates.push(candidate)
        else await pc.addIceCandidate(candidate)
        break
      }
      case "bye": {
        if (this.status !== "connected") {
          this.fail("The other device left before pairing finished.")
        }
        break
      }
    }
  }

  private async flushCandidates(): Promise<void> {
    const pending = this.pendingCandidates
    this.pendingCandidates = []
    for (const candidate of pending) {
      try {
        await this.pc?.addIceCandidate(candidate)
      } catch (error) {
        console.error("Discarding unusable ICE candidate:", error)
      }
    }
  }

  private startConnectTimeout(): void {
    this.timeoutTimer = setTimeout(() => {
      if (this.status !== "connected") {
        this.fail("Pairing timed out. Check that both devices are on the same network.")
      }
    }, CONNECT_TIMEOUT_MS)
  }

  private clearConnectTimeout(): void {
    if (!this.timeoutTimer) return
    clearTimeout(this.timeoutTimer)
    this.timeoutTimer = null
  }

  private fail(detail: string): void {
    this.stopPolling()
    this.clearConnectTimeout()
    this.setStatus("failed", detail)
  }

  private setStatus(status: TransportStatus, detail?: string): void {
    if (this.status === status && !detail) return
    this.status = status
    this.options.onStatusChange(status, detail)
  }
}

/** A short, recognisable name for this device, shown on the other screen. */
export function describeDevice(): string {
  if (typeof navigator === "undefined") return "Unknown device"
  const ua = navigator.userAgent
  if (/Macintosh|Mac OS X/.test(ua)) return "Mac"
  if (/Windows/.test(ua)) return "Windows PC"
  if (/Android/.test(ua)) return "Android"
  if (/iPhone|iPad/.test(ua)) return "iOS"
  if (/Linux/.test(ua)) return "Linux"
  return "This device"
}
