/**
 * @jest-environment node
 */
import {
  FREE_ATTEMPTS,
  GLOBAL_MAX_FAILURES,
  GLOBAL_WINDOW_MS,
  checkLogin,
  clientAddressOf,
  emptyThrottle,
  recordFailure,
  recordSuccess,
  type ThrottleState,
} from "@/lib/cloud/login-throttle"

const now = Date.UTC(2026, 10, 4, 12)

function failTimes(state: ThrottleState, clientId: string, times: number, at = now): ThrottleState {
  for (let i = 0; i < times; i++) state = recordFailure(state, clientId, at)
  return state
}

describe("login throttle", () => {
  it("allows the free attempts, then locks the client", () => {
    const beforeLock = failTimes(emptyThrottle(), "a", FREE_ATTEMPTS - 1)
    expect(checkLogin(beforeLock, "a", now)).toEqual({ allowed: true })

    const locked = recordFailure(beforeLock, "a", now)
    const verdict = checkLogin(locked, "a", now)
    expect(verdict.allowed).toBe(false)
    expect(!verdict.allowed && verdict.retryAfterMs).toBe(60_000)
  })

  it("doubles the lockout with every further failure", () => {
    const state = failTimes(emptyThrottle(), "a", FREE_ATTEMPTS + 2)
    const verdict = checkLogin(state, "a", now)
    expect(!verdict.allowed && verdict.retryAfterMs).toBe(4 * 60_000)
  })

  it("lets the client try again once the lockout has passed", () => {
    const state = failTimes(emptyThrottle(), "a", FREE_ATTEMPTS)
    expect(checkLogin(state, "a", now + 60_001)).toEqual({ allowed: true })
  })

  it("does not lock one client for another's failures", () => {
    const state = failTimes(emptyThrottle(), "a", FREE_ATTEMPTS + 3)
    expect(checkLogin(state, "b", now)).toEqual({ allowed: true })
  })

  it("locks every client once failures across all of them reach the global ceiling", () => {
    let state = emptyThrottle()
    for (let i = 0; i < GLOBAL_MAX_FAILURES; i++) state = recordFailure(state, `client-${i}`, now + i)

    const verdict = checkLogin(state, "fresh-client", now + GLOBAL_MAX_FAILURES)
    expect(verdict.allowed).toBe(false)
    // Unlocks when the oldest failure that counts leaves the window.
    expect(checkLogin(state, "fresh-client", now + GLOBAL_WINDOW_MS)).toEqual({ allowed: true })
  })

  it("clears a client's record on success, and reports when there was nothing to clear", () => {
    const state = failTimes(emptyThrottle(), "a", 3)
    const cleared = recordSuccess(state, "a")
    expect(cleared?.clients.a).toBeUndefined()
    expect(recordSuccess(emptyThrottle(), "a")).toBeNull()
  })

  it("forgets idle clients and old global failures, so the record stays small", () => {
    const old = failTimes(emptyThrottle(), "idle", 2, now)
    const dayLater = now + 25 * 60 * 60 * 1000
    const state = recordFailure(old, "new", dayLater)
    expect(Object.keys(state.clients)).toEqual(["new"])
    expect(state.recent).toEqual([dayLater])
  })
})

describe("clientAddressOf", () => {
  it("prefers the platform's client address, then the first forwarded hop", () => {
    expect(clientAddressOf(new Headers({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4")
    expect(clientAddressOf(new Headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8")
    expect(clientAddressOf(new Headers())).toBe("unknown")
  })
})
