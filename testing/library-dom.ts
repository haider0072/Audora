/**
 * What the library's components need from a browser that jsdom lacks: a
 * PointerEvent that keeps `button` and `pointerType`, a ResizeObserver, a
 * viewport with a height, and scrolling that moves it. Call once at the top
 * of a test file; it returns the `scrollTo` stand-in, cleared before each test.
 */
export function stubLibraryDom(viewportHeight = 600): jest.Mock {
  if (typeof window.PointerEvent === "undefined") {
    class PointerEventStandIn extends MouseEvent {
      readonly pointerId: number
      readonly pointerType: string
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 0
        this.pointerType = init.pointerType ?? "mouse"
      }
    }
    window.PointerEvent = PointerEventStandIn as unknown as typeof PointerEvent
  }

  const scrollTo = jest.fn(function (this: HTMLElement, options: ScrollToOptions) {
    this.scrollTop = options.top ?? 0
    this.dispatchEvent(new Event("scroll"))
  })
  beforeAll(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => viewportHeight })
    HTMLElement.prototype.scrollTo = scrollTo as unknown as HTMLElement["scrollTo"]
  })
  afterAll(() => {
    delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight
  })
  beforeEach(() => scrollTo.mockClear())
  return scrollTo
}
