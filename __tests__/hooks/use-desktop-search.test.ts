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
  it("comes out with the first letter typed, and stays out while the field is emptied", () => {
    const { result } = renderSearch()
    expect(result.current.active).toBe(false)

    act(() => result.current.setQuery("   "))
    expect(result.current.active).toBe(false)
    act(() => result.current.setQuery("air"))
    expect(result.current.active).toBe(true)
    act(() => result.current.setQuery(""))
    expect(result.current.active).toBe(true)
  })

  it("comes out when asked, before anything is typed, without a search", () => {
    const { result, search } = renderSearch()
    act(() => result.current.start())
    expect(result.current).toMatchObject({ active: true, query: "" })
    expect(search).not.toHaveBeenCalled()
  })

  it("searches online only on Return, for what is typed", () => {
    const { result, search } = renderSearch()
    act(() => result.current.setQuery("air "))
    expect(search).not.toHaveBeenCalled()

    act(() => result.current.submit())
    expect(search).toHaveBeenCalledWith("air")
  })

  it("asks nothing online for nothing typed", () => {
    const { result, search } = renderSearch()
    act(() => result.current.setQuery("  "))
    act(() => result.current.submit())
    expect(search).not.toHaveBeenCalled()
  })

  it("searches online again on Return, for a retry", () => {
    const { result, search } = renderSearch()
    act(() => result.current.setQuery("air"))
    act(() => result.current.submit())
    act(() => result.current.submit())
    expect(search).toHaveBeenCalledTimes(2)
  })

  it("closes back to the library, emptied", () => {
    const { result } = renderSearch()
    act(() => result.current.setQuery("air"))
    act(() => result.current.close())
    expect(result.current).toMatchObject({ query: "", active: false })
  })

  it("brings back the last online search without asking again", () => {
    const { result, search } = renderSearch()
    act(() => result.current.setQuery("air"))
    act(() => result.current.submit())
    act(() => result.current.close())
    act(() => result.current.showOnline())
    expect(result.current).toMatchObject({ query: "air", active: true })
    expect(search).toHaveBeenCalledTimes(1)
  })
})
