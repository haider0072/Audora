import { createRef } from "react"
import { fireEvent, render, screen } from "@testing-library/react"

import { AddMusicMenu } from "@/components/desktop/add-music-menu"
import { HeaderSearch } from "@/components/desktop/header-search"
import { CloudButton, DownloadsButton } from "@/components/desktop/header-status"
import { SearchTabs } from "@/components/desktop/search-tabs"
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
  function renderSearch(open: boolean) {
    const props = {
      value: "rose",
      onChange: jest.fn(),
      onSubmit: jest.fn(),
      open,
      onClose: jest.fn(),
      inputRef: createRef<HTMLInputElement>(),
    }
    render(<HeaderSearch {...props} />)
    return { props, input: screen.getByRole("searchbox", { name: "Search your library and online" }) }
  }

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

describe("SearchTabs", () => {
  function renderTabs(value: "library" | "online" = "library") {
    const onChange = jest.fn()
    render(
      <SearchTabs value={value} onChange={onChange} matches={4} downloads={2} tabId={(tab) => `tab-${tab}`} panelId="panel" />,
    )
    return onChange
  }

  it("counts the library's matches and the songs downloading", () => {
    renderTabs()
    expect(screen.getByRole("tab", { name: /Library\s*4/ })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: /Online\s*2\s*downloading/ })).toHaveAttribute("aria-selected", "false")
  })

  it("names its panel from the open tab only, which alone takes Tab", () => {
    renderTabs("online")
    const online = screen.getByRole("tab", { name: /Online/ })
    expect(online).toHaveAttribute("aria-controls", "panel")
    expect(online).toHaveAttribute("tabindex", "0")
    const library = screen.getByRole("tab", { name: /Library/ })
    expect(library).not.toHaveAttribute("aria-controls")
    expect(library).toHaveAttribute("tabindex", "-1")
  })

  it("moves with the arrow keys, round the ends, and opens the tab it reaches", () => {
    const onChange = renderTabs("library")
    const library = screen.getByRole("tab", { name: /Library/ })
    fireEvent.keyDown(library, { key: "ArrowRight" })
    expect(onChange).toHaveBeenLastCalledWith("online")
    expect(screen.getByRole("tab", { name: /Online/ })).toHaveFocus()

    fireEvent.keyDown(library, { key: "ArrowLeft" })
    expect(onChange).toHaveBeenLastCalledWith("online")
    fireEvent.keyDown(library, { key: "Home" })
    expect(onChange).toHaveBeenLastCalledWith("library")
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
