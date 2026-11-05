"use client"

import { useRef, type KeyboardEvent } from "react"

import type { SearchTab } from "@/hooks/use-desktop-search"
import { rovingMove } from "@/lib/roving"

const TABS: readonly SearchTab[] = ["library", "online"]

interface SearchTabsProps {
  value: SearchTab
  onChange: (tab: SearchTab) => void
  /** Songs in the library that match, once something is typed. */
  matches?: number
  /** Songs the online search is still downloading. */
  downloads: number
  /** Each tab's id, from which its panel is labelled. */
  tabId: (tab: SearchTab) => string
  /** The open tab's panel. */
  panelId: string
}

/**
 * Where the search looks: the library, or online. Tabs in the usual way: the
 * arrow keys move between them, and a tab opens as it takes focus. Styled by
 * `.search-tabs`; the open one takes the song's colour in a line beneath it.
 */
export function SearchTabs({ value, onChange, matches, downloads, tabId, panelId }: SearchTabsProps) {
  const refs = useRef<Partial<Record<SearchTab, HTMLButtonElement | null>>>({})

  const onKeyDown = (event: KeyboardEvent) => {
    const move = rovingMove(event.key, TABS.indexOf(value), TABS.length, "tabs")
    if (move === null) return
    event.preventDefault()
    const next = TABS[move]
    refs.current[next]?.focus()
    onChange(next)
  }

  return (
    <div className="search-tabs" role="tablist" aria-label="Where to search" onKeyDown={onKeyDown}>
      {TABS.map((tab) => {
        const selected = tab === value
        return (
          <button
            key={tab}
            ref={(element) => {
              refs.current[tab] = element
            }}
            id={tabId(tab)}
            type="button"
            role="tab"
            className="search-tab"
            aria-selected={selected}
            aria-controls={selected ? panelId : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab)}
          >
            {tab === "library" ? "Library" : "Online"}
            {tab === "library" && matches !== undefined && <span className="search-tab-count type-data">{matches}</span>}
            {tab === "online" && downloads > 0 && (
              <span className="search-tab-count type-data">
                {downloads}
                <span className="sr-only"> downloading</span>
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
