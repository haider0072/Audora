"use client"

import Image from "next/image"
import { Cloud, Globe, Library, type LucideIcon } from "lucide-react"

import { Wordmark } from "@/components/brand/wordmark"
import type { CloudLibraryStatus } from "@/hooks/use-cloud-library"

/** What the desktop's main area shows. */
export type DesktopView = "library" | "online"

const VIEWS: { view: DesktopView; label: string; Icon: LucideIcon }[] = [
  { view: "library", label: "Library", Icon: Library },
  { view: "online", label: "Search online", Icon: Globe },
]

/** How the cloud library stands, read out beside its dot. */
export const CLOUD_STATUS_LABELS: Record<CloudLibraryStatus, string> = {
  unavailable: "Not set up",
  "signed-out": "Signed out",
  loading: "Connecting",
  ready: "Connected",
  error: "Couldn't connect",
}

export interface DesktopSidebarProps {
  view: DesktopView
  onViewChange: (view: DesktopView) => void
  /** Songs the online search is still downloading. */
  downloads: number
  cloudStatus: CloudLibraryStatus
  onOpenCloud: () => void
}

/**
 * The desktop's way around: the library, the online search, and the cloud
 * library with its state at a glance. The open view is marked. Styled by
 * `.desktop-sidebar` in app/globals.css.
 */
export function DesktopSidebar({ view, onViewChange, downloads, cloudStatus, onOpenCloud }: DesktopSidebarProps) {
  return (
    <nav className="desktop-sidebar" aria-label="Audora">
      <div className="desktop-lockup">
        <Image src="/icon-192x192.png" alt="" width={28} height={28} className="rounded-md" />
        <Wordmark />
      </div>
      <ul className="desktop-nav">
        {VIEWS.map(({ view: id, label, Icon }) => (
          <li key={id}>
            <button
              type="button"
              className="desktop-nav-item"
              aria-current={view === id ? "page" : undefined}
              onClick={() => onViewChange(id)}
            >
              <Icon aria-hidden="true" />
              {label}
              {id === "online" && downloads > 0 && (
                <span className="desktop-nav-aside type-data">
                  <span className="sr-only">, downloading </span>
                  {downloads}
                </span>
              )}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            className="desktop-nav-item"
            aria-haspopup="dialog"
            title={`Cloud library: ${CLOUD_STATUS_LABELS[cloudStatus]}`}
            onClick={onOpenCloud}
          >
            <Cloud aria-hidden="true" />
            Cloud
            <span className="desktop-nav-dot" data-status={cloudStatus} aria-hidden="true" />
            <span className="sr-only">, {CLOUD_STATUS_LABELS[cloudStatus]}</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
