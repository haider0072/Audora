import { createRef } from "react"
import { fireEvent, render, screen } from "@testing-library/react"

import { AddMusicMenu } from "@/components/desktop/add-music-menu"
import { HeaderSearch } from "@/components/desktop/header-search"
import { CloudButton, DownloadsButton } from "@/components/desktop/header-status"
import { HeaderVolume } from "@/components/desktop/header-volume"
import { SideTabs } from "@/components/desktop/side-tabs"
import type { SearchTab } from "@/hooks/use-desktop-search"
import type { UploadSnapshot } from "@/lib/cloud/upload-queue"
import { stubLibraryDom } from "@/testing/library-dom"

stubLibraryDom()

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

// jsdom spaces hidden text off from the label ("Cloud , …"), so these names
// are matched by what they say rather than letter for letter.
describe("CloudButton", () => {
  it("says how the cloud library stands, and opens it", () => {
    const onOpen = jest.fn()
    const { container } = render(<CloudButton status="error" onOpen={onOpen} />)
    const cloud = screen.getByRole("button", { name: /^Cloud\s*, Couldn't connect$/ })
    expect(cloud).toHaveAttribute("aria-haspopup", "dialog")
    expect(cloud).toHaveAttribute("title", "Cloud library: Couldn't connect")
    expect(container.querySelector(".status-led")).toHaveAttribute("data-state", "error")

    fireEvent.click(cloud)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it("shows files going up as a ring that fills, in place of the LED", () => {
    mockUploads = { ...IDLE, active: true, total: 4, bytesTotal: 200, bytesSent: 50 }
    const { container } = render(<CloudButton status="ready" onOpen={jest.fn()} />)

    expect(screen.getByRole("button", { name: /^Cloud\s*, uploading, 25%$/ })).toBeInTheDocument()
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

describe("HeaderSearch", () => {
  function renderSearch(open: boolean, where: SearchTab = "library") {
    const props = {
      value: "rose",
      onChange: jest.fn(),
      onSubmit: jest.fn(),
      open,
      onClose: jest.fn(),
      where,
      onWhereChange: jest.fn(),
      whereId: (place: SearchTab) => `where-${place}`,
      inputRef: createRef<HTMLInputElement>(),
    }
    render(<HeaderSearch {...props} />)
    return { props, input: screen.getByRole("searchbox") }
  }

  it("says where it looks, in the field and beside it", () => {
    const { input } = renderSearch(false, "online")
    expect(input).toHaveAccessibleName("Search Qobuz and Amazon")
    expect(input).toHaveAttribute("placeholder", "Search Qobuz and Amazon")
    const where = screen.getByRole("radiogroup", { name: "Search in" })
    expect(screen.getByRole("radio", { name: "Online" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("radio", { name: "Library" })).toHaveAttribute("id", "where-library")
    expect(where).toContainElement(screen.getByRole("radio", { name: "Library" }))
  })

  it("hands focus to the field when a place is clicked, and keeps it on the arrow keys", () => {
    const { props, input } = renderSearch(false)
    fireEvent.click(screen.getByRole("radio", { name: "Online" }))
    expect(props.onWhereChange).toHaveBeenLastCalledWith("online")
    expect(input).toHaveFocus()

    const library = screen.getByRole("radio", { name: "Library" })
    library.focus()
    fireEvent.keyDown(library, { key: "ArrowRight" })
    expect(props.onWhereChange).toHaveBeenLastCalledWith("online")
    expect(screen.getByRole("radio", { name: "Online" })).toHaveFocus()
  })

  it("names its shortcut until results show", () => {
    const { input } = renderSearch(false)
    expect(input).toHaveAttribute("aria-keyshortcuts", "Control+K")
    expect(screen.getByText("Ctrl K")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Close search" })).not.toBeInTheDocument()
  })

  it("searches online on Return, and passes on what is typed", () => {
    const { props, input } = renderSearch(true)
    fireEvent.change(input, { target: { value: "rose gold" } })
    expect(props.onChange).toHaveBeenCalledWith("rose gold")
    fireEvent.keyDown(input, { key: "Enter" })
    expect(props.onSubmit).toHaveBeenCalledTimes(1)
  })

  it("closes the results with Escape or ×, keeping focus in the field", () => {
    const { props, input } = renderSearch(true)
    fireEvent.keyDown(input, { key: "Escape" })
    expect(props.onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "Close search" }))
    expect(props.onClose).toHaveBeenCalledTimes(2)
    expect(input).toHaveFocus()
  })

  it("leaves Escape alone while there is nothing to close", () => {
    const { props, input } = renderSearch(false)
    fireEvent.keyDown(input, { key: "Escape" })
    expect(props.onClose).not.toHaveBeenCalled()
  })
})

describe("HeaderVolume", () => {
  it("reads a saved volume of nothing as muted", () => {
    const onToggleMute = jest.fn()
    const { rerender } = render(
      <HeaderVolume volume={[0]} isMuted={false} onVolumeChange={jest.fn()} onToggleMute={onToggleMute} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }))
    expect(onToggleMute).toHaveBeenCalledTimes(1)

    rerender(<HeaderVolume volume={[80]} isMuted={false} onVolumeChange={jest.fn()} onToggleMute={onToggleMute} />)
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument()
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveAttribute("aria-valuetext", "80%")
  })

  it("says a muted volume is muted, keeping its level to come back to", () => {
    render(<HeaderVolume volume={[80]} isMuted onVolumeChange={jest.fn()} onToggleMute={jest.fn()} />)
    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument()
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveAttribute("aria-valuetext", "Muted")
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveAttribute("aria-valuenow", "80")
  })
})

describe("SideTabs", () => {
  function renderTabs(value: "library" | "lyrics" = "library") {
    const onChange = jest.fn()
    render(
      <SideTabs value={value} onChange={onChange} tabId={(tab) => `tab-${tab}`} panelId="panel">
        <p>883 songs</p>
      </SideTabs>,
    )
    return onChange
  }

  it("offers the library and the song's views, with the open tab's tools at the end", () => {
    renderTabs()
    const tabs = screen.getAllByRole("tab")
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Library", "Lyrics", "Queue", "About", "Video"])
    expect(screen.getByRole("tab", { name: "Library" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("883 songs")).toBeInTheDocument()
  })

  it("names its panel from the open tab only, which alone takes Tab", () => {
    renderTabs("lyrics")
    const lyrics = screen.getByRole("tab", { name: "Lyrics" })
    expect(lyrics).toHaveAttribute("aria-controls", "panel")
    expect(lyrics).toHaveAttribute("tabindex", "0")
    const library = screen.getByRole("tab", { name: "Library" })
    expect(library).not.toHaveAttribute("aria-controls")
    expect(library).toHaveAttribute("tabindex", "-1")
  })

  it("moves with the arrow keys, round the ends, and opens the tab it reaches", () => {
    const onChange = renderTabs("library")
    const library = screen.getByRole("tab", { name: "Library" })
    fireEvent.keyDown(library, { key: "ArrowRight" })
    expect(onChange).toHaveBeenLastCalledWith("lyrics")
    expect(screen.getByRole("tab", { name: "Lyrics" })).toHaveFocus()

    fireEvent.keyDown(library, { key: "ArrowLeft" })
    expect(onChange).toHaveBeenLastCalledWith("video")
    fireEvent.keyDown(library, { key: "End" })
    expect(onChange).toHaveBeenLastCalledWith("video")
    fireEvent.keyDown(library, { key: "ArrowDown" })
    expect(onChange).toHaveBeenCalledTimes(3)
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
