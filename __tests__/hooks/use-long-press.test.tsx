import { act, fireEvent, render, screen } from "@testing-library/react"

import { useLongPress } from "@/hooks/use-long-press"

// jsdom has no PointerEvent, and a plain Event drops `pointerType` and the coordinates.
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

function Pressable({ onLongPress, onClick }: { onLongPress: () => void; onClick: () => void }) {
  return (
    <div {...useLongPress(onLongPress)}>
      <button type="button" onClick={onClick}>
        Song
      </button>
    </div>
  )
}

function setup() {
  const onLongPress = jest.fn()
  const onClick = jest.fn()
  render(<Pressable onLongPress={onLongPress} onClick={onClick} />)
  return { onLongPress, onClick, target: screen.getByRole("button") }
}

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

describe("useLongPress", () => {
  it("fires once a finger has rested for half a second", () => {
    const { onLongPress, target } = setup()
    fireEvent.pointerDown(target, { pointerType: "touch", clientX: 10, clientY: 10 })
    act(() => jest.advanceTimersByTime(499))
    expect(onLongPress).not.toHaveBeenCalled()
    act(() => jest.advanceTimersByTime(1))
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it("swallows the click that ends a long press, but not the next tap", () => {
    const { onClick, target } = setup()
    fireEvent.pointerDown(target, { pointerType: "touch" })
    act(() => jest.advanceTimersByTime(500))
    fireEvent.pointerUp(target, { pointerType: "touch" })
    fireEvent.click(target)
    expect(onClick).not.toHaveBeenCalled()

    fireEvent.pointerDown(target, { pointerType: "touch" })
    fireEvent.pointerUp(target, { pointerType: "touch" })
    fireEvent.click(target)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("lets a finger lifted early tap as usual", () => {
    const { onLongPress, onClick, target } = setup()
    fireEvent.pointerDown(target, { pointerType: "touch" })
    act(() => jest.advanceTimersByTime(200))
    fireEvent.pointerUp(target, { pointerType: "touch" })
    fireEvent.click(target)
    act(() => jest.advanceTimersByTime(1_000))
    expect(onLongPress).not.toHaveBeenCalled()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("gives way to a scroll: drifting further than a few pixels cancels it", () => {
    const { onLongPress, target } = setup()
    fireEvent.pointerDown(target, { pointerType: "touch", clientX: 10, clientY: 10 })
    fireEvent.pointerMove(target, { pointerType: "touch", clientX: 14, clientY: 16 })
    act(() => jest.advanceTimersByTime(100))
    fireEvent.pointerMove(target, { pointerType: "touch", clientX: 10, clientY: 30 })
    act(() => jest.advanceTimersByTime(1_000))
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it("is cancelled when the browser takes the touch over", () => {
    const { onLongPress, target } = setup()
    fireEvent.pointerDown(target, { pointerType: "touch" })
    fireEvent.pointerCancel(target, { pointerType: "touch" })
    act(() => jest.advanceTimersByTime(1_000))
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it("leaves a mouse alone: holding its button does nothing, and its right-click goes on", () => {
    const { onLongPress, target } = setup()
    fireEvent.pointerDown(target, { pointerType: "mouse" })
    act(() => jest.advanceTimersByTime(1_000))
    const rightClick = fireEvent.contextMenu(target)
    expect(onLongPress).not.toHaveBeenCalled()
    expect(rightClick).toBe(true)
  })

  it("opens once when the system's own long press arrives before the timer", () => {
    const { onLongPress, target } = setup()
    fireEvent.pointerDown(target, { pointerType: "touch" })
    act(() => jest.advanceTimersByTime(400))
    const menu = fireEvent.contextMenu(target)
    act(() => jest.advanceTimersByTime(1_000))
    expect(menu).toBe(false)
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it("opens once when the system's own long press arrives after the timer", () => {
    const { onLongPress, target } = setup()
    fireEvent.pointerDown(target, { pointerType: "touch" })
    act(() => jest.advanceTimersByTime(500))
    const menu = fireEvent.contextMenu(target)
    expect(menu).toBe(false)
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it("claims a finger's press, so nothing else around it starts its own", () => {
    const { target } = setup()
    expect(fireEvent.pointerDown(target, { pointerType: "touch" })).toBe(false)
    expect(fireEvent.pointerDown(target, { pointerType: "mouse" })).toBe(true)
  })
})
