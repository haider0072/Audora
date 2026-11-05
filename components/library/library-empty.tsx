"use client"

import { StatusMessage, type StatusAction } from "@/components/status-message"
import { useOnlineStatus } from "@/hooks/use-online-status"
import type { LibraryLayout } from "./song-row"

/** A search that matched nothing. */
export function NoMatches({ query }: { query: string }) {
  return (
    <StatusMessage
      title={`Nothing matches “${query.trim()}”`}
      detail="Search looks through titles, artists, albums and genres."
    />
  )
}

/**
 * A library with no songs yet. Offline, that is most likely because the
 * cloud library could not be reached, so it says so. Only the desktop
 * mentions dropping files: a phone has nothing to drag them from.
 * `action` is the player's own Add music.
 */
export function EmptyLibrary({ layout, action }: { layout: LibraryLayout; action?: StatusAction }) {
  const online = useOnlineStatus()
  if (!online) {
    return <StatusMessage title="You're offline" detail="Your cloud library comes back when you reconnect." action={action} />
  }
  return (
    <StatusMessage
      title="Your library is quiet"
      detail={layout === "desktop" ? "Drop music anywhere, or add a folder." : "Add songs to start listening."}
      action={action}
    />
  )
}
