import { act, fireEvent, render, screen } from "@testing-library/react"

import { SeekBar } from "@/components/player/seek-bar"
import { setPlaybackTime } from "@/lib/playback-time-store"

// jsdom has no PointerEvent, and a plain Event drops `button` and `clientX`.
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

/** jsdom has no layout or pointer capture; give the bar a width and the capture calls. */
function giveLayout(slider: HTMLElement, width = 200) {
  slider.getBoundingClientRect = () => ({ left: 0, top: 0, width, height: 26, right: width, bottom: 26, x: 0, y: 0, toJSON: () => ({}) })
  let captured = false
  slider.setPointerCapture = () => {
    captured = true
  }
  slider.hasPointerCapture = () => captured
  slider.releasePointerCapture = () => {
    captured = false
  }
}

beforeEach(() => act(() => setPlaybackTime(60)))

describe("SeekBar", () => {
  it("describes the position to assistive technology", () => {
    render(<SeekBar duration={240} onSeek={jest.fn()} />)
    const slider = screen.getByRole("slider", { name: "Seek" })
    expect(slider).toHaveAttribute("aria-valuenow", "60")
    expect(slider).toHaveAttribute("aria-valuemax", "240")
    expect(slider).toHaveAttribute("aria-valuetext", "1:00 of 4:00")
  })

  it("shows elapsed and remaining time", () => {
    render(<SeekBar duration={240} onSeek={jest.fn()} />)
    expect(screen.getByText("1:00")).toBeInTheDocument()
    expect(screen.getByText("-3:00")).toBeInTheDocument()
  })

  it.each([
    ["ArrowRight", 65],
    ["ArrowLeft", 55],
    ["PageUp", 90],
    ["PageDown", 30],
    ["Home", 0],
    ["End", 240],
  ])("%s seeks to %d s", (key, expected) => {
    const onSeek = jest.fn()
    render(<SeekBar duration={240} onSeek={onSeek} />)
    fireEvent.keyDown(screen.getByRole("slider"), { key })
    expect(onSeek).toHaveBeenCalledWith(expected)
  })

  it("keeps a keyboard seek inside the song", () => {
    act(() => setPlaybackTime(238))
    const onSeek = jest.fn()
    render(<SeekBar duration={240} onSeek={onSeek} />)
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" })
    expect(onSeek).toHaveBeenCalledWith(240)
  })

  it("follows a drag without seeking, then seeks once where it is let go", () => {
    const onSeek = jest.fn()
    render(<SeekBar duration={200} onSeek={onSeek} />)
    const slider = screen.getByRole("slider")
    giveLayout(slider)

    fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 20 })
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 100 })
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 150 })
    expect(onSeek).not.toHaveBeenCalled()
    expect(slider).toHaveAttribute("aria-valuenow", "150")

    fireEvent.pointerUp(slider, { pointerId: 1, clientX: 150 })
    expect(onSeek).toHaveBeenCalledTimes(1)
    expect(onSeek).toHaveBeenCalledWith(150)
  })

  it("drops a drag the browser cancels", () => {
    const onSeek = jest.fn()
    render(<SeekBar duration={200} onSeek={onSeek} />)
    const slider = screen.getByRole("slider")
    giveLayout(slider)

    fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 20 })
    fireEvent.pointerCancel(slider, { pointerId: 1, clientX: 20 })
    expect(onSeek).not.toHaveBeenCalled()
    expect(slider).toHaveAttribute("aria-valuenow", "60")
  })

  it("does nothing while disabled, and reads as empty", () => {
    const onSeek = jest.fn()
    render(<SeekBar duration={200} onSeek={onSeek} disabled />)
    const slider = screen.getByRole("slider")
    giveLayout(slider)

    fireEvent.keyDown(slider, { key: "ArrowRight" })
    fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 100 })
    fireEvent.pointerUp(slider, { pointerId: 1, clientX: 100 })
    expect(onSeek).not.toHaveBeenCalled()
    expect(slider).toHaveAttribute("aria-disabled", "true")
    expect(slider).toHaveAttribute("aria-valuenow", "0")
  })
})
