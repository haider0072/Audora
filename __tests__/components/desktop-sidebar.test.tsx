import { fireEvent, render, screen } from "@testing-library/react"

import { DesktopSidebar, type DesktopSidebarProps } from "@/components/desktop/desktop-sidebar"
import type { UploadSnapshot } from "@/lib/cloud/upload-queue"

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

function renderSidebar(props: Partial<DesktopSidebarProps> = {}) {
  const all: DesktopSidebarProps = {
    view: "library",
    onViewChange: jest.fn(),
    downloads: 0,
    cloudStatus: "ready",
    onOpenCloud: jest.fn(),
    ...props,
  }
  return { ...render(<DesktopSidebar {...all} />), props: all }
}

describe("DesktopSidebar", () => {
  it("marks the open view and switches to the one pressed", () => {
    const { props } = renderSidebar({ view: "library" })
    expect(screen.getByRole("navigation", { name: "Audora" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Library" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("button", { name: "Search online" })).not.toHaveAttribute("aria-current")

    fireEvent.click(screen.getByRole("button", { name: "Search online" }))
    expect(props.onViewChange).toHaveBeenCalledWith("online")
  })

  // jsdom spaces the hidden text off from the label ("Search online , …"), so
  // these names are matched by what they say rather than letter for letter.
  it("counts what the online search is still downloading", () => {
    const { rerender, props } = renderSidebar({ downloads: 3 })
    expect(screen.getByRole("button", { name: /^Search online\s*, downloading 3$/ })).toBeInTheDocument()

    rerender(<DesktopSidebar {...props} downloads={0} />)
    expect(screen.getByRole("button", { name: "Search online" })).toBeInTheDocument()
  })

  it("says how the cloud library stands, and opens it", () => {
    const { props } = renderSidebar({ cloudStatus: "error" })
    const cloud = screen.getByRole("button", { name: /^Cloud\s*, Couldn't connect$/ })
    expect(cloud).toHaveAttribute("aria-haspopup", "dialog")
    expect(cloud).toHaveAttribute("title", "Cloud library: Couldn't connect")

    fireEvent.click(cloud)
    expect(props.onOpenCloud).toHaveBeenCalledTimes(1)
  })

  it("shows files going up as a ring that fills, in place of the dot", () => {
    mockUploads = { ...IDLE, active: true, total: 4, bytesTotal: 200, bytesSent: 50 }
    const { container } = renderSidebar()

    expect(screen.getByRole("button", { name: /^Cloud\s*, uploading, 25%$/ })).toBeInTheDocument()
    expect(container.querySelector(".desktop-nav-dot")).not.toBeInTheDocument()
    const fill = container.querySelector(".desktop-nav-ring-fill")
    const length = Number(fill?.getAttribute("stroke-dasharray"))
    expect(Number(fill?.getAttribute("stroke-dashoffset"))).toBeCloseTo(length * 0.75)
  })

  it("keeps Settings at its foot, and marks it while open", () => {
    const { props } = renderSidebar({ view: "settings" })
    const settings = screen.getByRole("button", { name: "Settings" })
    expect(settings).toHaveAttribute("aria-current", "page")
    expect(settings.closest("ul")).toHaveClass("desktop-nav-foot")
    expect(screen.getByRole("button", { name: "Library" })).not.toHaveAttribute("aria-current")

    fireEvent.click(screen.getByRole("button", { name: "Library" }))
    expect(props.onViewChange).toHaveBeenCalledWith("library")
  })
})
