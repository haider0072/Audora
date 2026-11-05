"use client"

import { useOnlineStatus } from "@/hooks/use-online-status"
import type { LibraryLayout } from "./song-row"

/** The way forward an empty library offers: the player's own Add music. */
export interface EmptyAction {
  label: string
  onClick: () => void
}

interface EmptyStateProps {
  title: string
  hint: string
  action?: EmptyAction
}

function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className="library-empty">
      <p className="library-empty-title">{title}</p>
      <p className="library-empty-hint">{hint}</p>
      {action && (
        <button type="button" className="library-empty-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}

/** A search that matched nothing. */
export function NoMatches({ query }: { query: string }) {
  return (
    <EmptyState
      title={`Nothing matches “${query.trim()}”`}
      hint="Search looks through titles, artists, albums and genres."
    />
  )
}

/**
 * A library with no songs yet. Offline, that is most likely because the
 * cloud library could not be reached, so it says so. Only the desktop
 * mentions dropping files: a phone has nothing to drag them from.
 */
export function EmptyLibrary({ layout, action }: { layout: LibraryLayout; action?: EmptyAction }) {
  const online = useOnlineStatus()
  if (!online) {
    return <EmptyState title="You're offline" hint="Your cloud library comes back when you reconnect." action={action} />
  }
  return (
    <EmptyState
      title="Your library is quiet"
      hint={layout === "desktop" ? "Drop music anywhere, or add a folder." : "Add songs to start listening."}
      action={action}
    />
  )
}
