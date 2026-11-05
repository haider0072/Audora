"use client"

import type { ReactNode } from "react"
import { Disc3, List, Search } from "lucide-react"

import { TransportButton } from "@/components/player/transport-button"
import type { LibraryViewMode } from "@/lib/library-rows"

interface ViewHeaderProps {
  title: string
  /** What the view holds, such as its song count, set as data. */
  meta?: string
  /** The view's tools, at the far end. */
  children?: ReactNode
}

/** The head of a desktop view: its title, what it holds, then its tools. Styled by `.view-head`. */
export function ViewHeader({ title, meta, children }: ViewHeaderProps) {
  return (
    <header className="view-head">
      <h1 className="view-title">{title}</h1>
      {meta && <p className="view-meta type-data">{meta}</p>}
      {children && <div className="view-tools">{children}</div>}
    </header>
  )
}

interface SearchFieldProps {
  /** Where it searches, said as its label and placeholder. */
  label: string
  value: string
  onChange: (value: string) => void
  /** Return pressed, for a search that runs on asking rather than as you type. */
  onSubmit?: () => void
  autoFocus?: boolean
}

/** A search field that says where it looks. Styled by `.search-field`. */
export function SearchField({ label, value, onChange, onSubmit, autoFocus }: SearchFieldProps) {
  return (
    <label className="search-field">
      <Search aria-hidden="true" />
      <input
        type="search"
        value={value}
        placeholder={label}
        aria-label={label}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onSubmit) {
            event.preventDefault()
            onSubmit()
          }
        }}
      />
    </label>
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
