/**
 * A view of the song playing: its lyrics, what plays next, what is known about
 * it, its video. Kept apart from the Now panel, which loads only when one
 * first opens.
 */
export type NowTab = "lyrics" | "queue" | "about" | "video"

export const NOW_TAB_LABELS: Record<NowTab, string> = {
  lyrics: "Lyrics",
  queue: "Queue",
  about: "About",
  video: "Video",
}

/** The song's views, in order: the Now panel's tabs. */
export const NOW_TABS: readonly NowTab[] = ["lyrics", "queue", "about", "video"]
