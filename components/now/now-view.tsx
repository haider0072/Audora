"use client"

import type { NowPlayerProps } from "./now-panel"
import { NowAbout } from "./now-about"
import { NowLyrics } from "./now-lyrics"
import { NowQueue } from "./now-queue"
import type { NowViewTab } from "./now-tabs"
import { NowVideo } from "./now-video"

export interface NowViewProps extends NowPlayerProps {
  tab: NowViewTab
}

/**
 * One view of the song playing, drawn on its own: its lyrics, what plays
 * after it, what is known about it, or its video. The Now panel shows these as
 * tabs; the desktop shows them in place of the cover.
 */
export default function NowView({ tab, song, following, onSeek, queue, musicPlaying, onVideoPlay }: NowViewProps) {
  switch (tab) {
    case "lyrics":
      return <NowLyrics song={song} following={following} onSeek={onSeek} />
    case "queue":
      return <NowQueue {...queue} />
    case "about":
      return <NowAbout song={song} />
    case "video":
      return <NowVideo song={song} musicPlaying={musicPlaying} onVideoPlay={onVideoPlay} />
  }
}
