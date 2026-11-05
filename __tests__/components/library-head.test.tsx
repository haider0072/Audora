import { createRef } from "react"
import { fireEvent, render, screen } from "@testing-library/react"

import { AddMusicMenu } from "@/components/desktop/add-music-menu"
import { CloudButton, DownloadsButton, SearchButton } from "@/components/desktop/library-tools"
import { SearchField } from "@/components/desktop/search-field"
import { SongViews } from "@/components/desktop/song-views"
import { UpNext } from "@/components/desktop/up-next"
import { BackHeader } from "@/components/desktop/view-header"
import type { UploadSnapshot } from "@/lib/cloud/upload-queue"
import type { Song } from "@/lib/song"
import { stubLibraryDom } from "@/testing/library-dom"

stubLibraryDom()

// The covers draw from the art cache; the rows around them are what is under test.
jest.mock("@/components/album-art-display", () => ({ AlbumArtDisplay: () => null }))

const IDLE: UploadSnapshot = {
  active: false,
  total: 0,
  uploaded: 0,
  skipped: 0,
  failed: [],
  inProgress: [],
  bytesTotal: 0,
  bytesSent: 0,
  bytesPerSecond: 0,
}

let mockUploads: UploadSnapshot = IDLE

jest.mock("@/lib/cloud/upload-queue", () => ({
  cloudUploads: { subscribe: () => () => {}, getSnapshot: () => mockUploads },
}))

beforeEach(() => {
  mockUploads = IDLE
})

describe("CloudButton", () => {
  it("says how the cloud library stands, and opens it", () => {
    const onOpen = jest.fn()
    const { container } = render(<CloudButton status="error" onOpen={onOpen} />)
    const cloud = screen.getByRole("button", { name: "Cloud, Couldn't connect" })
    expect(cloud).toHaveAttribute("aria-haspopup", "dialog")
    expect(cloud).toHaveAttribute("title", "Cloud library: Couldn't connect")
    expect(container.querySelector(".status-led")).toHaveAttribute("data-state", "error")

    fireEvent.click(cloud)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it("shows files going up as a ring that fills, in place of the LED", () => {
    mockUploads = { ...IDLE, active: true, total: 4, bytesTotal: 200, bytesSent: 50 }
    const { container } = render(<CloudButton status="ready" onOpen={jest.fn()} />)

    expect(screen.getByRole("button", { name: "Cloud, uploading, 25%" })).toBeInTheDocument()
    expect(container.querySelector(".status-led")).not.toBeInTheDocument()
    const fill = container.querySelector(".progress-ring-fill")
    const length = Number(fill?.getAttribute("stroke-dasharray"))
    expect(Number(fill?.getAttribute("stroke-dashoffset"))).toBeCloseTo(length * 0.75)
  })
})

describe("DownloadsButton", () => {
  it("shows only while songs are downloading, and opens their search", () => {
    const onOpen = jest.fn()
    const { container, rerender } = render(<DownloadsButton count={0} onOpen={onOpen} />)
    expect(container).toBeEmptyDOMElement()

    rerender(<DownloadsButton count={3} onOpen={onOpen} />)
    const button = screen.getByRole("button", { name: /Downloading\s*3/ })
    expect(button).toHaveAttribute("title", "3 songs downloading")
    fireEvent.click(button)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})

describe("SearchButton", () => {
  it("names its shortcut, and opens the search", () => {
    const onOpen = jest.fn()
    render(<SearchButton onOpen={onOpen} />)
    const button = screen.getByRole("button", { name: "Search" })
    expect(button).toHaveAttribute("aria-keyshortcuts", "Control+K")
    expect(screen.getByText("Ctrl K")).toHaveAttribute("aria-hidden", "true")
    fireEvent.click(button)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})

describe("SearchField", () => {
  function renderField() {
    const props = {
      value: "rose",
      onChange: jest.fn(),
      onSubmit: jest.fn(),
      onClose: jest.fn(),
      inputRef: createRef<HTMLInputElement>(),
    }
    render(<SearchField {...props} />)
    return { props, input: screen.getByRole("searchbox", { name: "Search your library, or online" }) }
  }

  it("takes focus as it opens, with no choice of where to look", () => {
    const { props, input } = renderField()
    expect(input).toHaveFocus()
    expect(props.inputRef.current).toBe(input)
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument()
  })

  it("passes on what is typed, and looks online on Return", () => {
    const { props, input } = renderField()
    fireEvent.change(input, { target: { value: "rose gold" } })
    expect(props.onChange).toHaveBeenCalledWith("rose gold")
    fireEvent.keyDown(input, { key: "Enter" })
    expect(props.onSubmit).toHaveBeenCalledTimes(1)
  })

  it("closes with Escape or ×", () => {
    const { props, input } = renderField()
    fireEvent.keyDown(input, { key: "Escape" })
    fireEvent.click(screen.getByRole("button", { name: "Close search" }))
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })
})

describe("SongViews", () => {
  function renderViews(value: "lyrics" | null) {
    const onChange = jest.fn()
    render(<SongViews value={value} onChange={onChange} viewId={(view) => `view-${view}`} />)
    return onChange
  }

  it("offers the song's views, and no queue, lighting the open one", () => {
    renderViews("lyrics")
    const group = screen.getByRole("group", { name: "Song views" })
    expect(Array.from(group.querySelectorAll("button")).map((button) => button.textContent)).toEqual(["Lyrics", "About", "Video"])
    expect(screen.getByRole("button", { name: "Lyrics" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "About" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: "Video" })).toHaveAttribute("id", "view-video")
  })

  it("opens a view, and closes the open one when pressed again", () => {
    const onChange = renderViews("lyrics")
    fireEvent.click(screen.getByRole("button", { name: "About" }))
    expect(onChange).toHaveBeenLastCalledWith("about")
    fireEvent.click(screen.getByRole("button", { name: "Lyrics" }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})

describe("BackHeader", () => {
  it("leads with the way back, named for where it goes", () => {
    const onBack = jest.fn()
    render(
      <BackHeader to="Library" onBack={onBack} meta="From LRCLIB">
        <button type="button">Full screen</button>
      </BackHeader>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Back to Library" }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(screen.getByText("From LRCLIB")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Full screen" })).toBeInTheDocument()
  })
})

describe("UpNext", () => {
  const queued = [
    { id: "a", url: "blob:a", title: "Myth", artist: "Beach House" },
    { id: "b", url: "blob:b", title: "Lazuli", artist: "Beach House" },
  ] as Song[]

  function renderUpNext(songs: Song[]) {
    const props = {
      queued: songs,
      onPlayQueued: jest.fn(),
      playNext: jest.fn(),
      addToQueue: jest.fn(),
      onDequeue: jest.fn(),
      onClear: jest.fn(),
    }
    return { ...render(<UpNext {...props} />), props }
  }

  it("is gone while nothing is queued", () => {
    const { container } = renderUpNext([])
    expect(container).toBeEmptyDOMElement()
  })

  it("lists what you queued, in order, plays one when picked, and clears them all", () => {
    const { props } = renderUpNext(queued)
    const band = screen.getByRole("region", { name: "Up next 2 songs" })
    expect(Array.from(band.querySelectorAll(".library-row-title")).map((title) => title.textContent)).toEqual(["Myth", "Lazuli"])

    fireEvent.click(screen.getByText("Lazuli"))
    expect(props.onPlayQueued).toHaveBeenCalledWith(queued[1])
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(props.onClear).toHaveBeenCalledTimes(1)
  })
})

describe("AddMusicMenu", () => {
  function renderMenu(busy: boolean, syncing = false) {
    const refs = {
      fileInputRef: createRef<HTMLInputElement>(),
      folderInputRef: createRef<HTMLInputElement>(),
      syncInputRef: createRef<HTMLInputElement>(),
    }
    render(<AddMusicMenu busy={busy} syncing={syncing} {...refs} onFiles={jest.fn()} onFolder={jest.fn()} onSync={jest.fn()} />)
    const trigger = screen.getByRole("button", { name: "Add music" })
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" })
    return { refs, trigger }
  }

  it("adds songs, a folder, or a folder kept in sync, through the browser's pickers", () => {
    const { refs } = renderMenu(false)
    const click = jest.spyOn(refs.folderInputRef.current!, "click")
    fireEvent.click(screen.getByRole("menuitem", { name: "Add a folder…" }))
    expect(click).toHaveBeenCalledTimes(1)
    expect(refs.syncInputRef.current).toHaveAttribute("webkitdirectory")
  })

  it("waits while songs come in, keeping its focus rather than dropping it", () => {
    const { trigger } = renderMenu(true, true)
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute("aria-disabled", "true")
    expect(trigger).not.toBeDisabled()
    expect(trigger).toHaveAttribute("title", "Syncing a folder")
  })
})
