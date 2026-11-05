import { fireEvent, render, screen } from "@testing-library/react"

import NowPanel, { type NowPanelProps } from "@/components/now/now-panel"
import type { Song } from "@/lib/song"
import { stubLibraryDom } from "@/testing/library-dom"

stubLibraryDom(600)

// Each tab looks its song up; here they all wait, which is all the panel needs.
const mockPending = () => ({ resource: { status: "loading" }, retry: jest.fn() })
jest.mock("@/hooks/use-lyrics", () => ({
  useLyrics: () => ({ lyrics: { status: "loading" }, retry: jest.fn() }),
}))
jest.mock("@/hooks/use-song-info", () => ({
  useSongInsights: () => mockPending(),
  useArtistInfo: () => mockPending(),
  useMusicVideos: () => mockPending(),
}))

const SONG = { id: "a", url: "blob:a", title: "Myth", artist: "Beach House", duration: 258 } as Song

function renderPanel(props: Partial<NowPanelProps> = {}) {
  const all: NowPanelProps = {
    song: SONG,
    following: true,
    tab: "lyrics",
    onTabChange: jest.fn(),
    onSeek: jest.fn(),
    queue: {
      queued: [],
      upNext: [],
      shuffle: false,
      layout: "desktop",
      onSelect: jest.fn(),
      onPlayQueued: jest.fn(),
      playNext: jest.fn(),
      addToQueue: jest.fn(),
      onDequeue: jest.fn(),
      onClear: jest.fn(),
    },
    musicPlaying: false,
    onVideoPlay: jest.fn(),
    ...props,
  }
  return { ...render(<NowPanel {...all} />), props: all }
}

/** Radix tabs switch on a primary-button press. */
function press(tab: HTMLElement) {
  fireEvent.mouseDown(tab, { button: 0 })
}

describe("NowPanel", () => {
  it("offers lyrics, the queue, about and video as tabs, with the open one selected", () => {
    renderPanel({ tab: "about" })
    const tabs = screen.getAllByRole("tab")
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Lyrics", "Queue", "About", "Video"])
    expect(screen.getByRole("tab", { name: "About" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tablist", { name: "Now playing" })).toBeInTheDocument()
  })

  it("draws only the open tab", () => {
    renderPanel({ tab: "lyrics" })
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1)
    expect(screen.getByText("Looking for lyrics…")).toBeInTheDocument()
    expect(screen.queryByText("Nothing to play next")).not.toBeInTheDocument()
  })

  it("asks for the tab pressed", () => {
    const { props } = renderPanel({ tab: "lyrics" })
    press(screen.getByRole("tab", { name: "Queue" }))
    expect(props.onTabChange).toHaveBeenCalledWith("queue")
  })

  it("shows the queue when that tab is open", () => {
    renderPanel({ tab: "queue" })
    expect(screen.getByText("Nothing to play next")).toBeInTheDocument()
  })
})
