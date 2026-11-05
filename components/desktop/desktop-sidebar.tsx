"use client"

import { useSyncExternalStore } from "react"
import Image from "next/image"
import { Cloud, Globe, Library, Settings, type LucideIcon } from "lucide-react"

import { Wordmark } from "@/components/brand/wordmark"
import { StatusLed, type LedState } from "@/components/desktop/status-led"
import type { CloudLibraryStatus } from "@/hooks/use-cloud-library"
import { cloudUploads } from "@/lib/cloud/upload-queue"

/** What the desktop's main area shows. */
export type DesktopView = "library" | "online" | "settings"

interface ViewLink {
  view: DesktopView
  label: string
  Icon: LucideIcon
}

const VIEWS: ViewLink[] = [
  { view: "library", label: "Library", Icon: Library },
  { view: "online", label: "Search online", Icon: Globe },
]

const SETTINGS: ViewLink = { view: "settings", label: "Settings", Icon: Settings }

/** How the cloud library stands, read out beside its dot. */
export const CLOUD_STATUS_LABELS: Record<CloudLibraryStatus, string> = {
  unavailable: "Not set up",
  "signed-out": "Signed out",
  loading: "Connecting",
  ready: "Connected",
  error: "Couldn't connect",
}

/** The cloud library's LED: lit while connected, a fault when it could not connect. */
export function cloudLed(status: CloudLibraryStatus): LedState {
  if (status === "ready") return "on"
  if (status === "error") return "error"
  return "off"
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
 * The desktop's way around: the library, the online search, the cloud library
 * with its state at a glance, and settings at the foot. The open view is
 * marked. Styled by `.desktop-sidebar` in app/globals.css.
 */
export function DesktopSidebar({ view, onViewChange, downloads, cloudStatus, onOpenCloud }: DesktopSidebarProps) {
  const link = ({ view: id, label, Icon }: ViewLink) => (
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
  )

  return (
    <nav className="desktop-sidebar" aria-label="Audora">
      <div className="desktop-lockup">
        <Image src="/icon-192x192.png" alt="" width={28} height={28} className="rounded-md" />
        <Wordmark />
      </div>
      <ul className="desktop-nav">
        {VIEWS.map(link)}
        <li>
          <CloudLink status={cloudStatus} onOpen={onOpenCloud} />
        </li>
      </ul>
      <ul className="desktop-nav desktop-nav-foot">{link(SETTINGS)}</ul>
    </nav>
  )
}

/** Radius of the upload ring, inside its 16-unit box. */
const RING_RADIUS = 6
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

/**
 * The cloud library's link: its state as a dot, or, while files go up, a ring
 * that fills as they do. Only this re-renders as an upload moves.
 */
function CloudLink({ status, onOpen }: { status: CloudLibraryStatus; onOpen: () => void }) {
  const uploads = useSyncExternalStore(cloudUploads.subscribe, cloudUploads.getSnapshot, cloudUploads.getSnapshot)
  const progress = uploads.active && uploads.bytesTotal > 0 ? Math.min(uploads.bytesSent / uploads.bytesTotal, 1) : null
  const label = CLOUD_STATUS_LABELS[status]

  return (
    <button
      type="button"
      className="desktop-nav-item"
      aria-haspopup="dialog"
      title={`Cloud library: ${label}`}
      onClick={onOpen}
    >
      <Cloud aria-hidden="true" />
      Cloud
      {progress === null ? (
        <>
          <StatusLed state={cloudLed(status)} className="desktop-nav-dot" />
          <span className="sr-only">, {label}</span>
        </>
      ) : (
        <>
          <svg className="desktop-nav-ring" viewBox="0 0 16 16" aria-hidden="true">
            <circle className="desktop-nav-ring-track" cx="8" cy="8" r={RING_RADIUS} />
            <circle
              className="desktop-nav-ring-fill"
              cx="8"
              cy="8"
              r={RING_RADIUS}
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH * (1 - progress)}
            />
          </svg>
          <span className="sr-only">, uploading, {Math.round(progress * 100)}%</span>
        </>
      )}
    </button>
  )
}
