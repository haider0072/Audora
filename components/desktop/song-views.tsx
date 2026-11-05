"use client"

import { NOW_TAB_LABELS, type NowViewTab } from "@/components/now/now-tabs"

/** The song's views on the desktop, in order. What plays next lives over the library instead, while songs are queued. */
export const DESKTOP_VIEWS = ["lyrics", "about", "video"] as const satisfies readonly NowViewTab[]

export type DesktopView = (typeof DESKTOP_VIEWS)[number]

/** Where a view's words come from, where one service gives them all, said in its head. */
export const VIEW_SOURCES: Partial<Record<DesktopView, string>> = {
  lyrics: "From LRCLIB",
  video: "From YouTube",
}

interface SongViewsProps {
  /** The view open in the library's place, if any. */
  value: DesktopView | null
  /** Open a view, or with `null` close it. */
  onChange: (view: DesktopView | null) => void
  /** Each word's id, so focus can come back to it. */
  viewId: (view: DesktopView) => string
}

/**
 * The song's views as small words under its controls, each lit by an LED
 * while it is open in the library's place: secondary to the library, a word
 * away. Pressing the open one again closes it. Styled by `.song-views`.
 */
export function SongViews({ value, onChange, viewId }: SongViewsProps) {
  return (
    <div className="song-views" role="group" aria-label="Song views">
      {DESKTOP_VIEWS.map((view) => (
        <button
          key={view}
          id={viewId(view)}
          type="button"
          className="led-choice song-view"
          aria-pressed={value === view}
          onClick={() => onChange(value === view ? null : view)}
        >
          {NOW_TAB_LABELS[view]}
        </button>
      ))}
    </div>
  )
}
