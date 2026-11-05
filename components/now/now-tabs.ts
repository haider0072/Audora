/** A view of the song playing: its lyrics, what plays next, what is known about it, its video. */
export type NowViewTab = "lyrics" | "queue" | "about" | "video"

/** A tab of the Now panel: the song's views, and the library where a panel offers it. Kept apart from the panel, which loads only when one first opens. */
export type NowTab = NowViewTab | "library"

export const NOW_TAB_LABELS: Record<NowTab, string> = {
  lyrics: "Lyrics",
  queue: "Queue",
  about: "About",
  video: "Video",
  library: "Library",
}

/** The song's views, in order: the tabs every Now panel has. */
export const NOW_TABS: readonly NowViewTab[] = ["lyrics", "queue", "about", "video"]

/** A column at the side of the desktop or of full screen, or the phone's sheet. */
export type NowLayout = "side" | "sheet"
