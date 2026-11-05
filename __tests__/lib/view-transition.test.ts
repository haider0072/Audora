import { withViewTransition } from "@/lib/view-transition"

/** The browser's view transitions, as far as this needs them: the change runs once the old page is pictured. */
function stubViewTransitions(): jest.Mock {
  const start = jest.fn((update: ViewTransitionUpdateCallback) => {
    update()
    return {} as ViewTransition
  })
  Object.defineProperty(document, "startViewTransition", { value: start, configurable: true })
  return start
}

afterEach(() => {
  Reflect.deleteProperty(document, "startViewTransition")
})

describe("withViewTransition", () => {
  it("simply makes the change where the browser has no view transitions", () => {
    const update = jest.fn()
    withViewTransition(update)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it("makes the change as a view transition where the browser has them", () => {
    const start = stubViewTransitions()
    const update = jest.fn()
    withViewTransition(update)
    expect(start).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it("makes the change at once for a reader who asked for less motion", () => {
    const start = stubViewTransitions()
    const lessMotion = jest.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList)
    const update = jest.fn()
    withViewTransition(update)
    expect(start).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledTimes(1)
    lessMotion.mockRestore()
  })
})
