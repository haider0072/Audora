"use client"

import type { ReactNode } from "react"
import * as Tabs from "@radix-ui/react-tabs"

import type { Song } from "@/lib/song"
import type { NowQueueProps } from "./now-queue"
import { NOW_TAB_LABELS, NOW_TABS, type NowLayout, type NowTab } from "./now-tabs"
import NowView from "./now-view"

/**
 * The player's side of the panel: the song on screen and its clock, the
 * queue, and how a video shares the speakers with the music. Built by
 * `useNowPlayer`.
 */
export interface NowPlayerProps {
  /** The song on screen. */
  song: Song | null
  /** `song` is the one heard, rather than a pick still loading. */
  following: boolean
  onSeek: (seconds: number) => void
  queue: NowQueueProps
  /** The music is playing: a video pauses for it. */
  musicPlaying: boolean
  /** A video started: the music pauses for it. */
  onVideoPlay: () => void
}

export interface NowPanelProps extends NowPlayerProps {
  tabs?: readonly NowTab[]
  tab: NowTab
  onTabChange: (tab: NowTab) => void
  /** The Library tab's content, where the panel offers that tab. */
  library?: ReactNode
  /** Shown at the end of the tabs' row, such as a button that closes the panel. */
  trailing?: ReactNode
  layout: NowLayout
}

/**
 * Everything about the song playing, one tap apart: its lyrics, what plays
 * after it, what is known about it, and its video. Only the open tab is
 * rendered, so a closed one costs nothing and looks nothing up. Styled by
 * `.now` in app/globals.css.
 */
export default function NowPanel({
  tabs = NOW_TABS,
  tab,
  onTabChange,
  library,
  trailing,
  layout,
  ...player
}: NowPanelProps) {
  return (
    <Tabs.Root className="now" data-layout={layout} value={tab} onValueChange={(value) => onTabChange(value as NowTab)}>
      <div className="now-head">
        <Tabs.List className="now-tabs" aria-label="Now playing">
          {tabs.map((id) => (
            <Tabs.Trigger key={id} value={id} className="now-tab">
              {NOW_TAB_LABELS[id]}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {trailing}
      </div>
      {tabs.map((id) =>
        id === "library" ? (
          library && (
            <Tabs.Content key={id} value={id} className="now-content">
              {library}
            </Tabs.Content>
          )
        ) : (
          <Tabs.Content key={id} value={id} className="now-content">
            <NowView tab={id} {...player} />
          </Tabs.Content>
        ),
      )}
    </Tabs.Root>
  )
}
