import { fireEvent, render, screen } from "@testing-library/react"

import { DesktopSidebar, type DesktopSidebarProps } from "@/components/desktop/desktop-sidebar"

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
})
