import { act, renderHook } from "@testing-library/react"

import { useScrollActivity } from "@/hooks/use-scroll-activity"

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

function scroll(element: HTMLElement) {
  act(() => {
    element.dispatchEvent(new Event("scroll"))
  })
}

describe("useScrollActivity", () => {
  it("is false for a list nobody has scrolled", () => {
    const { result } = renderHook(() => useScrollActivity(document.createElement("div")))
    expect(result.current).toBe(false)
  })

  it("turns on with a scroll and settles a moment after the last one", () => {
    const viewport = document.createElement("div")
    const { result } = renderHook(() => useScrollActivity(viewport))

    scroll(viewport)
    expect(result.current).toBe(true)

    act(() => jest.advanceTimersByTime(1_000))
    scroll(viewport)
    act(() => jest.advanceTimersByTime(1_000))
    expect(result.current).toBe(true)

    act(() => jest.advanceTimersByTime(200))
    expect(result.current).toBe(false)
  })

  it("changes twice per gesture, not with every scroll event", () => {
    const viewport = document.createElement("div")
    let renders = 0
    renderHook(() => {
      renders++
      return useScrollActivity(viewport)
    })
    const before = renders
    for (let i = 0; i < 20; i++) scroll(viewport)
    act(() => jest.advanceTimersByTime(1_200))
    expect(renders - before).toBe(2)
  })

  it("has nothing to watch without a viewport", () => {
    const { result } = renderHook(() => useScrollActivity(null))
    expect(result.current).toBe(false)
  })
})
