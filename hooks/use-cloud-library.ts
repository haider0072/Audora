"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { Song } from "@/components/enhanced-playlist"
import { mergeCloudLibrary } from "@/lib/cloud/merge"
import type { CloudIndexResponse, CloudLibraryResponse, CloudSong } from "@/lib/cloud/types"

/**
 * The cloud library on this device: sign-in state, the song list, and keeping
 * that list folded into the player's own.
 *
 * Signed URLs in the listing stay valid for days, but this is a player left
 * open for weeks, so the listing is refetched whenever the tab comes back into
 * view after `REFRESH_AFTER_MS`.
 */

export type CloudLibraryStatus =
  /** This deployment has no cloud library configured. */
  | "unavailable"
  | "signed-out"
  | "loading"
  | "ready"
  | "error"

const REFRESH_AFTER_MS = 12 * 60 * 60 * 1000

export interface UseCloudLibraryOptions {
  /** False until the local library has been restored; merging earlier would be overwritten. */
  isReady: boolean
  /** Local list length, so songs added later are re-checked against the cloud. */
  songCount: number
  setSongs: (update: (previous: Song[]) => Song[]) => void
}

export interface UseCloudLibraryReturn {
  status: CloudLibraryStatus
  songCount: number
  /** Uploads not yet indexed. Non-zero while indexing runs. */
  pending: number
  error: string | null
  signIn: (password: string) => Promise<boolean>
  /** Sign this device out, or with `everywhere` every device signed in. */
  signOut: (options?: { everywhere?: boolean }) => Promise<void>
  refresh: () => void
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string }
    return body.error ?? `Request failed (${response.status})`
  } catch {
    return `Request failed (${response.status})`
  }
}

export function useCloudLibrary({ isReady, songCount, setSongs }: UseCloudLibraryOptions): UseCloudLibraryReturn {
  const [status, setStatus] = useState<CloudLibraryStatus>("loading")
  const [cloudSongs, setCloudSongs] = useState<CloudSong[]>([])
  const [pending, setPending] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const loadedAtRef = useRef(0)
  /** Bumped by every load and by sign-out, so a superseded load stops applying results. */
  const generationRef = useRef(0)

  const load = useCallback(async () => {
    const generation = ++generationRef.current
    const isCurrent = () => generation === generationRef.current

    setStatus((previous) => (previous === "ready" ? previous : "loading"))
    setError(null)

    try {
      const session = await fetch("/api/cloud/session", { cache: "no-store" })
      if (!session.ok) throw new Error(await readError(session))
      const { configured, authenticated } = (await session.json()) as {
        configured: boolean
        authenticated: boolean
      }
      if (!isCurrent()) return
      if (!configured) return setStatus("unavailable")
      if (!authenticated) {
        setCloudSongs([])
        return setStatus("signed-out")
      }

      // Index whatever has been uploaded since the last pass, showing the
      // library as it grows. A pass that makes no progress ends the loop: the
      // remaining files are unreadable, and retrying them in a tight loop
      // would only spin.
      for (;;) {
        const response = await fetch("/api/cloud/library", { cache: "no-store" })
        if (!response.ok) throw new Error(await readError(response))
        const library = (await response.json()) as CloudLibraryResponse
        if (!isCurrent()) return

        setCloudSongs(library.songs)
        setPending(library.pending)
        setStatus("ready")
        loadedAtRef.current = Date.now()

        if (library.pending === 0) return

        const indexing = await fetch("/api/cloud/library/index", { method: "POST" })
        if (!indexing.ok) throw new Error(await readError(indexing))
        const result = (await indexing.json()) as CloudIndexResponse
        if (!isCurrent()) return
        if (result.indexed === 0) {
          setPending(result.pending)
          return
        }
      }
    } catch (cause) {
      if (!isCurrent()) return
      console.error("Cloud library load failed:", cause)
      setError(cause instanceof Error ? cause.message : "Could not reach the cloud library")
      setStatus((previous) => (previous === "ready" ? previous : "error"))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      if (Date.now() - loadedAtRef.current < REFRESH_AFTER_MS) return
      void load()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [load])

  // Fold the cloud list into the player's. `mergeCloudLibrary` returns the
  // previous array when nothing changes, so re-running on every local change
  // is free and cannot loop.
  useEffect(() => {
    if (!isReady) return
    setSongs((previous) => mergeCloudLibrary(previous, cloudSongs))
  }, [isReady, songCount, cloudSongs, setSongs])

  const signIn = useCallback(
    async (password: string) => {
      const response = await fetch("/api/cloud/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      if (!response.ok) {
        setError(response.status === 401 ? "Wrong password" : await readError(response))
        return false
      }
      await load()
      return true
    },
    [load],
  )

  const signOut = useCallback(async ({ everywhere = false }: { everywhere?: boolean } = {}) => {
    generationRef.current++
    const response = await fetch(everywhere ? "/api/cloud/session?scope=all" : "/api/cloud/session", {
      method: "DELETE",
    })
    if (!response.ok) {
      setError(await readError(response))
      return
    }
    setCloudSongs([])
    setPending(0)
    setError(null)
    setStatus("signed-out")
  }, [])

  const refresh = useCallback(() => {
    void load()
  }, [load])

  return { status, songCount: cloudSongs.length, pending, error, signIn, signOut, refresh }
}
