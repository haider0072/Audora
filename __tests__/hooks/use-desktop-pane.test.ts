import { useState } from "react"
import { act, renderHook } from "@testing-library/react"

import { useDesktopPane } from "@/hooks/use-desktop-pane"

/** The panes over a stand-in for the search, which keeps whether it is out as state, as it does. */
function renderPanes() {
  return renderHook(() => {
    const [active, setActive] = useState(false)
    const panes = useDesktopPane({ active, start: () => setActive(true), close: () => setActive(false) })
    return { ...panes, searching: active }
  })
}

describe("useDesktopPane", () => {
  it("shows the library until something opens in its place", () => {
    const { result } = renderPanes()
    expect(result.current).toMatchObject({ pane: "library", view: null })
  })

  it("opens a song's view in the library's place, and closes it again", () => {
    const { result } = renderPanes()
    act(() => result.current.setView("lyrics"))
    expect(result.current).toMatchObject({ pane: "view", view: "lyrics" })
    act(() => result.current.setView(null))
    expect(result.current.pane).toBe("library")
  })

  it("closes the search and Settings as a view opens", () => {
    const { result } = renderPanes()
    act(() => result.current.toggleSettings())
    expect(result.current.pane).toBe("settings")
    act(() => result.current.setView("about"))
    expect(result.current).toMatchObject({ pane: "view", view: "about" })
    act(() => result.current.toggleSettings())
    act(() => result.current.setView("video"))
    expect(result.current.pane).toBe("view")

    act(() => result.current.startSearch())
    expect(result.current).toMatchObject({ pane: "search", view: null, searching: true })
    act(() => result.current.setView("lyrics"))
    expect(result.current).toMatchObject({ pane: "view", searching: false })
  })

  it("opens Settings in place of a view, and toggles it back to the library", () => {
    const { result } = renderPanes()
    act(() => result.current.setView("lyrics"))
    act(() => result.current.toggleSettings())
    expect(result.current).toMatchObject({ pane: "settings", view: null })
    act(() => result.current.toggleSettings())
    expect(result.current.pane).toBe("library")
  })

  it("closes the search and Settings for full screen, leaving the song's view as it is", () => {
    const { result } = renderPanes()
    act(() => result.current.startSearch())
    act(() => result.current.closeSearchAndSettings())
    expect(result.current).toMatchObject({ pane: "library", searching: false })

    act(() => result.current.toggleSettings())
    act(() => result.current.closeSearchAndSettings())
    expect(result.current.pane).toBe("library")

    act(() => result.current.setView("lyrics"))
    act(() => result.current.closeSearchAndSettings())
    expect(result.current).toMatchObject({ pane: "view", view: "lyrics" })
  })

  it("goes back to the library from anything open in its place", () => {
    const { result } = renderPanes()
    act(() => result.current.startSearch())
    act(() => result.current.showLibrary())
    expect(result.current).toMatchObject({ pane: "library", searching: false })
    act(() => result.current.toggleSettings())
    act(() => result.current.showLibrary())
    expect(result.current.pane).toBe("library")
  })
})
