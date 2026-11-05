"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

/** Where a lookup for the song on screen has got to. */
export type SongResource<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "error"; error: string }

type Outcome<T> = { ok: true; value: T } | { ok: false; error: string }

interface Settled<T> {
  key: string
  attempt: number
  outcome: Outcome<T>
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong."
}

/**
 * Looks something up for a song, once for each `key`: its lyrics, what is
 * known about it, its video. A null key means there is nothing to look up.
 * Only the newest key's answer is kept, so a slow answer for a song played
 * earlier never lands on the one playing now. `retry` asks again.
 */
export function useSongResource<T>(
  key: string | null,
  load: () => Promise<T>,
): { resource: SongResource<T>; retry: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled<T> | null>(null)

  // The newest `load`, so the lookup runs when the key changes rather than
  // whenever a caller passes a new function for the same song.
  const loadRef = useRef(load)
  useLayoutEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    if (key === null) return
    let current = true
    loadRef.current().then(
      (value) => {
        if (current) setSettled({ key, attempt, outcome: { ok: true, value } })
      },
      (error: unknown) => {
        console.error("Lookup failed:", error)
        if (current) setSettled({ key, attempt, outcome: { ok: false, error: messageOf(error) } })
      },
    )
    return () => {
      current = false
    }
  }, [key, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  let resource: SongResource<T>
  if (key === null) resource = { status: "idle" }
  else if (settled?.key !== key || settled.attempt !== attempt) resource = { status: "loading" }
  else if (settled.outcome.ok) resource = { status: "ready", value: settled.outcome.value }
  else resource = { status: "error", error: settled.outcome.error }

  return { resource, retry }
}

/** The key for a song's artist and title, or null when either is missing. */
export function songInfoKey(song: { artist?: string; title?: string } | null): string | null {
  return song?.artist && song.title ? `${song.artist}\u0000${song.title}` : null
}
