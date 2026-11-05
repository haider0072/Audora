"use client"

import type { ReactNode } from "react"
import { ChevronLeft, Disc3, List } from "lucide-react"

import { TransportButton } from "@/components/player/transport-button"
import type { LibraryViewMode } from "@/lib/library-rows"

interface ViewHeaderProps {
  title: string
  /** What the view holds, such as its song count, set as data. */
  meta?: string
  /** The view's tools, at the far end. */
  children?: ReactNode
}

/**
 * The head of the desktop's right half: its title, what it holds, then its
 * tools, level with the brand over the song. Styled by `.view-head`.
 */
export function ViewHeader({ title, meta, children }: ViewHeaderProps) {
  return (
    <header className="view-head">
      <h1 className="view-title">{title}</h1>
      {meta && <p className="view-meta type-data">{meta}</p>}
      {children && <div className="view-tools">{children}</div>}
    </header>
  )
}

interface BackHeaderProps {
  /** Where Back goes, as the button says it. */
  to: string
  onBack: () => void
  /** What the view shows, set as data. */
  meta?: string
  children?: ReactNode
}

/** The head of something opened in the library's place: the way back to it first, then what it shows and its tools. */
export function BackHeader({ to, onBack, meta, children }: BackHeaderProps) {
  return (
    <header className="view-head">
      <button type="button" className="view-back" onClick={onBack}>
        <ChevronLeft aria-hidden="true" />
        <span className="sr-only">Back to </span>
        {to}
      </button>
      {meta && <p className="view-meta type-data">{meta}</p>}
      {children && <div className="view-tools">{children}</div>}
    </header>
  )
}

interface ViewModeToggleProps {
  value: LibraryViewMode
  onChange: (mode: LibraryViewMode) => void
}

/** The library as artists and albums, or as one list. */
export function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  return (
    <div className="view-toggle" role="group" aria-label="Show the library">
      <TransportButton label="By artist and album" size="sm" pressed={value === "grouped"} onClick={() => onChange("grouped")}>
        <Disc3 className="h-4 w-4" />
      </TransportButton>
      <TransportButton label="As one list" size="sm" pressed={value === "list"} onClick={() => onChange("list")}>
        <List className="h-4 w-4" />
      </TransportButton>
    </div>
  )
}
