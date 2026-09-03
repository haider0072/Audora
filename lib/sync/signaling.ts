/**
 * Client half of the pairing handshake.
 *
 * Wraps the room endpoint in the two operations the connection setup needs:
 * leave a message for the other peer, and collect whatever the other peer has
 * left since the last look. Messages this peer wrote are filtered out on read,
 * so callers never have to recognise their own echo.
 *
 * Used only while a peer connection is being established. Once the data
 * channel opens the caller stops polling and this goes quiet for good.
 */

export type SignalType = "offer" | "answer" | "ice" | "bye"

export interface SignalMessage {
  peerId: string
  type: SignalType
  payload: unknown
}

/** Gap between polls during a handshake — brisk, but it only runs for seconds. */
export const SIGNAL_POLL_INTERVAL_MS = 600

export class SignalingChannel {
  private cursor = 0
  private stopped = false

  constructor(
    private readonly room: string,
    private readonly peerId: string,
  ) {}

  private get endpoint(): string {
    return `/api/sync/${encodeURIComponent(this.room)}`
  }

  /** Leave a message in the room for the other peer. */
  async send(type: SignalType, payload: unknown): Promise<void> {
    if (this.stopped) return

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peerId: this.peerId, type, payload } satisfies SignalMessage),
    })

    if (!response.ok) {
      throw new Error(await describeFailure(response))
    }
  }

  /**
   * Collect messages left by the other peer since the previous poll.
   *
   * The cursor only advances on a successful read, so a failed poll costs a
   * round trip rather than a dropped offer.
   */
  async poll(): Promise<SignalMessage[]> {
    if (this.stopped) return []

    const response = await fetch(`${this.endpoint}?since=${this.cursor}`, {
      cache: "no-store",
    })

    if (!response.ok) {
      throw new Error(await describeFailure(response))
    }

    const body = (await response.json()) as { messages?: unknown[]; next?: number }
    if (typeof body.next === "number") this.cursor = body.next

    return (body.messages ?? []).filter(isSignalMessage).filter((m) => m.peerId !== this.peerId)
  }

  /** Tell the other peer this side is going away. Best effort. */
  async sendBye(): Promise<void> {
    try {
      await this.send("bye", null)
    } catch {
      // A peer that is already gone does not need the notice, and the caller
      // is tearing down regardless.
    }
  }

  stop(): void {
    this.stopped = true
  }
}

function isSignalMessage(value: unknown): value is SignalMessage {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<SignalMessage>
  return typeof candidate.peerId === "string" && typeof candidate.type === "string"
}

/**
 * Turn a failed response into something worth showing a user. The endpoint
 * reports its own reason for a 503 (sync not configured on the deployment),
 * which is far more useful than the status code alone.
 */
async function describeFailure(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string }
    if (body.error) return body.error
  } catch {
    // Fall through to the generic message.
  }
  return `Pairing service returned ${response.status}`
}

/** Identifier for this browser within a room; distinguishes the two peers. */
export function createPeerId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** A fresh six-digit room code, generated on the hosting device. */
export function createRoomCode(): string {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return String(bytes[0] % 1_000_000).padStart(6, "0")
}
