"use client"

import { useRef, type KeyboardEvent, type ReactNode } from "react"

import { NOW_TAB_LABELS, NOW_TABS, type NowTab } from "@/components/now/now-tabs"
import { rovingMove } from "@/lib/roving"

/** The right half's tabs: the library first, then the song's views. */
export const SIDE_TABS: readonly NowTab[] = ["library", ...NOW_TABS]

interface SideTabsProps {
  value: NowTab
  onChange: (tab: NowTab) => void
  /** Each tab's id, from which its panel is labelled. */
  tabId: (tab: NowTab) => string
  /** The open tab's panel. */
  panelId: string
  /** What the open tab holds and its tools, at the row's far end. */
  children?: ReactNode
}

/**
 * The head of the desktop's right half: the library and the song's views as
 * tabs, so the lyrics, the queue, about and the video get the whole column
 * while the cover stays in sight. Tabs in the usual way: the arrow keys move
 * between them, and a tab opens as it takes focus. Styled by `.side-tabs`;
 * the open one takes the song's colour in a line beneath it.
 */
export function SideTabs({ value, onChange, tabId, panelId, children }: SideTabsProps) {
  const refs = useRef<Partial<Record<NowTab, HTMLButtonElement | null>>>({})

  const onKeyDown = (event: KeyboardEvent) => {
    const move = rovingMove(event.key, SIDE_TABS.indexOf(value), SIDE_TABS.length, "tabs")
    if (move === null) return
    event.preventDefault()
    const next = SIDE_TABS[move]
    refs.current[next]?.focus()
    onChange(next)
  }

  return (
    <header className="view-head">
      <div className="side-tabs" role="tablist" aria-label="Show" onKeyDown={onKeyDown}>
        {SIDE_TABS.map((tab) => {
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
              className="side-tab"
              aria-selected={selected}
              aria-controls={selected ? panelId : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab)}
            >
              {NOW_TAB_LABELS[tab]}
            </button>
          )
        })}
      </div>
      {children && <div className="view-tools">{children}</div>}
    </header>
  )
}
