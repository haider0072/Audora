import { useState } from "react"
import { act, renderHook } from "@testing-library/react"

import { useDesktopSearch } from "@/hooks/use-desktop-search"

/** The search over a stand-in for the online search, which keeps the query it was last sent as state, as it does. */
function renderSearch() {
  const search = jest.fn(async () => {})
  const hook = renderHook(() => {
    const [searchQuery, setSearchQuery] = useState("")
    return useDesktopSearch({ search, searchQuery, setSearchQuery })
  })
  return { ...hook, search }
}

describe("useDesktopSearch", () => {
  it("opens with the first letter typed, and stays open while the field is emptied", () => {
    const { result } = renderSearch()
    expect(result.current.open).toBe(false)

    act(() => result.current.setQuery("   "))
    expect(result.current.open).toBe(false)
    act(() => result.current.setQuery("air"))
    expect(result.current.open).toBe(true)
    expect(result.current.tab).toBe("library")
    act(() => result.current.setQuery(""))
    expect(result.current.open).toBe(true)
  })

  it("searches online only when asked, and not again for the same words", () => {
    const { result, search } = renderSearch()
    act(() => result.current.setQuery("air "))
    act(() => result.current.submit())
    expect(search).not.toHaveBeenCalled()

    act(() => result.current.setTab("online"))
    expect(search).toHaveBeenCalledWith("air")
    act(() => result.current.setTab("library"))
    act(() => result.current.setTab("online"))
    expect(search).toHaveBeenCalledTimes(1)

    act(() => result.current.setQuery("air moon"))
    act(() => result.current.setTab("library"))
    act(() => result.current.setTab("online"))
    expect(search).toHaveBeenLastCalledWith("air moon")
  })

  it("searches online again on Return, for a retry", () => {
    const { result, search } = renderSearch()
    act(() => result.current.setQuery("air"))
    act(() => result.current.setTab("online"))
    act(() => result.current.submit())
    expect(search).toHaveBeenCalledTimes(2)
  })

  it("closes back to the library, emptied", () => {
    const { result } = renderSearch()
    act(() => result.current.setQuery("air"))
    act(() => result.current.setTab("online"))
    act(() => result.current.close())
    expect(result.current).toMatchObject({ query: "", open: false, tab: "library" })
  })

  it("brings back the last online search", () => {
    const { result, search } = renderSearch()
    act(() => result.current.setQuery("air"))
    act(() => result.current.setTab("online"))
    act(() => result.current.close())
    act(() => result.current.showOnline())
    expect(result.current).toMatchObject({ query: "air", open: true, tab: "online" })
    expect(search).toHaveBeenCalledTimes(1)
  })
})
