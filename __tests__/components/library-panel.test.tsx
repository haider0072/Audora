import { fireEvent, render, screen, within } from "@testing-library/react"

import { LibraryPanel } from "@/components/library/library-panel"
import type { LibraryActions } from "@/components/library/use-row-actions"
import { useLibraryNavigation } from "@/hooks/use-library-navigation"
import type { Song } from "@/lib/song"
import { stubLibraryDom } from "@/testing/library-dom"

stubLibraryDom(600)

function song(id: string, fields: Partial<Song> = {}): Song {
  return { id, url: `blob:${id}`, title: id, duration: 200, ...fields } as Song
}

/** In playback order. */
const LIBRARY: Song[] = [
  song("air-1", { title: "La femme d'argent", artist: "Air", album: "Moon Safari", year: "1998", trackNumber: "1" }),
  song("air-2", { title: "Sexy Boy", artist: "Air", album: "Moon Safari", year: "1998", trackNumber: "2" }),
  song("air-3", { title: "Cherry Blossom Girl", artist: "Air", album: "Talkie Walkie", year: "2004", trackNumber: "4" }),
  song("bh-1", { title: "Myth", artist: "Beach House", album: "Bloom", trackNumber: "1" }),
]

interface HarnessProps {
  songs?: Song[]
  query?: string
  currentSongId?: string
  onSelect: (song: Song) => void
  actions: LibraryActions
}

function Harness({ songs = LIBRARY, query = "", currentSongId, onSelect, actions }: HarnessProps) {
  const navigation = useLibraryNavigation(songs, query)
  return (
    <LibraryPanel
      songs={songs}
      viewMode="grouped"
      query={query}
      layout="desktop"
      currentSongId={currentSongId}
      playback={currentSongId ? "playing" : undefined}
      onSelect={onSelect}
      actions={actions}
      navigation={navigation}
    />
  )
}

function renderPanel(props: Partial<HarnessProps> = {}) {
  const all: HarnessProps = {
    onSelect: jest.fn(),
    actions: { playNext: jest.fn(), addToQueue: jest.fn(), removeSong: jest.fn() },
    ...props,
  }
  const view = render(<Harness {...all} />)
  return { ...view, props: all, rerenderWith: (next: Partial<HarnessProps>) => view.rerender(<Harness {...all} {...next} />) }
}

function listLayer(): HTMLElement {
  return document.querySelector('.library-layer[data-kind="list"]') as HTMLElement
}

/** The page on top, which is the only one not covered. */
function topPage(): HTMLElement {
  return document.querySelector('.library-layer[data-kind="page"]:not([data-covered])') as HTMLElement
}

function openMenu(within: HTMLElement, title: string) {
  const more = Array.from(within.querySelectorAll("button")).find((button) => button.getAttribute("aria-label") === `More for ${title}`)
  fireEvent.pointerDown(more as HTMLElement, { button: 0, pointerType: "mouse" })
  return screen.getByRole("menu")
}

describe("LibraryPanel, an artist's page", () => {
  it("opens from the artist's header, over the list, which stays mounted but out of reach", () => {
    renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "Air" }))

    const page = topPage()
    expect(within(page).getByRole("heading", { level: 2, name: "Air" })).toBeInTheDocument()
    expect(within(page).getByText("2 albums · 3 songs · 10 min")).toBeInTheDocument()
    expect(listLayer()).toHaveAttribute("data-covered")
    expect(listLayer()).toHaveAttribute("inert")
  })

  it("shows every album with its year and songs, numbered by track", () => {
    renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "Air" }))

    const page = topPage()
    expect(within(page).getByRole("heading", { level: 3, name: "Moon Safari" })).toBeInTheDocument()
    expect(within(page).getByText("2004 · 1 song")).toBeInTheDocument()
    const girl = within(page).getByText("Cherry Blossom Girl").closest(".library-row") as HTMLElement
    expect(within(girl).getByText("4")).toBeInTheDocument()
    // Every row on a page shares its album's cover, so none draws one.
    expect(girl).toHaveAttribute("data-art", "off")
  })

  it("takes focus as it opens", () => {
    renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "Air" }))
    expect(document.activeElement).toBe(within(topPage()).getByRole("heading", { level: 2 }))
  })

  it("plays the artist's first song", () => {
    const { props } = renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "Air" }))
    fireEvent.click(within(topPage()).getByRole("button", { name: "Play" }))
    expect(props.onSelect).toHaveBeenCalledWith(LIBRARY[0])
  })

  it("does not offer to go to the artist from their own page", () => {
    renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "Air" }))
    const menu = openMenu(topPage(), "Sexy Boy")
    expect(within(menu).queryByRole("menuitem", { name: "Go to artist" })).not.toBeInTheDocument()
    expect(within(menu).getByRole("menuitem", { name: "Go to album" })).toBeInTheDocument()
  })
})

describe("LibraryPanel, an album's page", () => {
  it("opens from the artist's page, with Back naming the page beneath", () => {
    renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "Air" }))
    fireEvent.click(within(topPage()).getByRole("button", { name: "Moon Safari" }))

    const page = topPage()
    expect(within(page).getByRole("heading", { level: 2, name: "Moon Safari" })).toBeInTheDocument()
    expect(within(page).getByText("1998 · 2 songs · 6 min")).toBeInTheDocument()
    expect(within(page).getByText("Air", { selector: ".library-page-link" })).toBeInTheDocument()
    expect(within(page).getByText("Air", { selector: ".library-page-back-label" })).toBeInTheDocument()
  })

  it("goes back to its artist's page rather than opening it again", () => {
    renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "Air" }))
    fireEvent.click(within(topPage()).getByRole("button", { name: "Moon Safari" }))
    fireEvent.click(within(topPage()).getByText("Air", { selector: ".library-page-link" }))

    expect(document.querySelectorAll('.library-layer[data-kind="page"]')).toHaveLength(1)
    expect(within(topPage()).getByRole("heading", { level: 2, name: "Air" })).toBeInTheDocument()
  })

  it("opens from an album header in the list, and its menu leaves out the album", () => {
    renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "Bloom" }))
    const menu = openMenu(topPage(), "Myth")
    expect(within(menu).queryByRole("menuitem", { name: "Go to album" })).not.toBeInTheDocument()
    expect(within(menu).getByRole("menuitem", { name: "Go to artist" })).toBeInTheDocument()
  })

  it("keeps the current song's playback mark", () => {
    renderPanel({ currentSongId: "bh-1" })
    fireEvent.click(screen.getByRole("button", { name: "Bloom" }))
    expect(within(topPage()).getByText("Myth").closest(".library-row")).toHaveAttribute("data-playback", "playing")
  })
})

describe("LibraryPanel, going back", () => {
  it("returns to the list, and focus to the header that opened the page", () => {
    renderPanel()
    const header = screen.getByRole("button", { name: "Beach House" })
    header.focus()
    fireEvent.click(header)
    fireEvent.click(within(topPage()).getByRole("button", { name: "Library" }))

    expect(topPage()).toBeNull()
    expect(listLayer()).not.toHaveAttribute("inert")
    expect(listLayer()).not.toHaveAttribute("data-covered")
    expect(document.activeElement).toBe(header)
  })

  it("goes back on Escape", () => {
    renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "Air" }))
    fireEvent.keyDown(within(topPage()).getByRole("heading", { level: 2 }), { key: "Escape" })
    expect(topPage()).toBeNull()
  })

  it("returns to the list when a new search starts", () => {
    const { rerenderWith } = renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "Air" }))
    rerenderWith({ query: "myth" })
    expect(topPage()).toBeNull()
    expect(screen.getByText("Myth")).toBeInTheDocument()
  })

  it("closes a page whose songs are all gone", () => {
    const { rerenderWith } = renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "Bloom" }))
    rerenderWith({ songs: LIBRARY.slice(0, 3) })
    expect(topPage()).toBeNull()
    expect(listLayer()).not.toHaveAttribute("inert")
  })
})
