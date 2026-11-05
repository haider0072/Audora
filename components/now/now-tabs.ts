/** A tab of the Now panel. Kept apart from the panel, which loads only when one first opens. */
export type NowTab = "lyrics" | "queue" | "about" | "video" | "library"

export const NOW_TAB_LABELS: Record<NowTab, string> = {
  lyrics: "Lyrics",
  queue: "Queue",
  about: "About",
  video: "Video",
  library: "Library",
}

/** The tabs every Now panel has, in order. */
export const NOW_TABS: readonly NowTab[] = ["lyrics", "queue", "about", "video"]

/** In the player's column, at the side of full screen, or in the phone's sheet. */
export type NowLayout = "column" | "side" | "sheet"
