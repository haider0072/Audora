import { useRef } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"

import { FULLSCREEN_IDLE_MS, useDesktopFullscreen } from "@/hooks/use-desktop-fullscreen"

/**
 * The frame in miniature: More and Play stay in full screen, the way in in a
 * view's head goes with the head, and the way out comes in its place.
 */
function Frame() {
  const wayIn = useRef<HTMLButtonElement>(null)
  const wayOut = useRef<HTMLButtonElement>(null)
  const { full, idle, enter, exit, toggle } = useDesktopFullscreen({ exitRef: wayOut, returnRef: wayIn })
  return (
    <div data-testid="frame" data-full={full || undefined} data-idle={idle || undefined}>
      <button type="button" onClick={toggle}>
        More
      </button>
      <button type="button" tabIndex={-1} onClick={enter}>
        Cover
      </button>
      <button type="button">Play</button>
      {full ? (
        <button ref={wayOut} type="button" onClick={exit}>
          Exit full screen
        </button>
      ) : (
        <button ref={wayIn} type="button" onClick={enter}>
          Full screen
        </button>
      )}
    </div>
  )
}

/** Presses a button the way the keyboard does, with focus on it. */
function press(name: string): HTMLElement {
  const button = screen.getByRole("button", { name })
  button.focus()
  fireEvent.click(button)
  return button
}

const frame = () => screen.getByTestId("frame")

describe("useDesktopFullscreen", () => {
  it("goes full screen from a way in that stays, and comes back to it on Escape", () => {
    render(<Frame />)
    const more = press("More")
    expect(frame()).toHaveAttribute("data-full")
    expect(more).toHaveFocus()

    fireEvent.keyDown(window, { key: "Escape" })
    expect(frame()).not.toHaveAttribute("data-full")
    expect(more).toHaveFocus()
  })

  it("hands focus to the way out when the way in went with the head, and back to the way in after", () => {
    render(<Frame />)
    press("Full screen")
    expect(screen.getByRole("button", { name: "Exit full screen" })).toHaveFocus()

    press("Exit full screen")
    expect(frame()).not.toHaveAttribute("data-full")
    expect(screen.getByRole("button", { name: "Full screen" })).toHaveFocus()
  })

  it("hands focus to the way out after the cover, which the keyboard never reaches", () => {
    render(<Frame />)
    press("Cover")
    expect(screen.getByRole("button", { name: "Exit full screen" })).toHaveFocus()
  })

  it("leaves focus that moved on inside full screen where it is", () => {
    render(<Frame />)
    press("Full screen")
    const play = screen.getByRole("button", { name: "Play" })
    play.focus()

    fireEvent.keyDown(window, { key: "Escape" })
    expect(frame()).not.toHaveAttribute("data-full")
    expect(play).toHaveFocus()
  })

  it("leaves Escape to a menu or a dialog that took it first", () => {
    render(<Frame />)
    press("More")
    const taken = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    taken.preventDefault()
    act(() => {
      window.dispatchEvent(taken)
    })
    expect(frame()).toHaveAttribute("data-full")
  })

  describe("while the pointer rests", () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it("fades the way out, until the pointer moves again", () => {
      render(<Frame />)
      press("More")
      expect(frame()).not.toHaveAttribute("data-idle")

      act(() => jest.advanceTimersByTime(FULLSCREEN_IDLE_MS))
      expect(frame()).toHaveAttribute("data-idle")

      fireEvent.pointerMove(window)
      expect(frame()).not.toHaveAttribute("data-idle")
      act(() => jest.advanceTimersByTime(FULLSCREEN_IDLE_MS - 1))
      expect(frame()).not.toHaveAttribute("data-idle")
    })

    it("never fades outside full screen", () => {
      render(<Frame />)
      act(() => jest.advanceTimersByTime(FULLSCREEN_IDLE_MS * 2))
      expect(frame()).not.toHaveAttribute("data-idle")

      press("More")
      act(() => jest.advanceTimersByTime(FULLSCREEN_IDLE_MS))
      press("More")
      expect(frame()).not.toHaveAttribute("data-full")
      expect(frame()).not.toHaveAttribute("data-idle")
    })
  })
})
