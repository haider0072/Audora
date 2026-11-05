import { useCallback, useRef, useState } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"

import { FULLSCREEN_IDLE_MS, useDesktopFullscreen } from "@/hooks/use-desktop-fullscreen"

const nothing = () => {}

/** An artist's page, which keeps whether full screen was still on as it opened. */
function ArtistPage({ full }: { full: boolean }) {
  const [openedInFull] = useState(full)
  return <section aria-label="Artist page" data-opened-in-full={openedInFull || undefined} />
}

interface FrameProps {
  /** A song's view is open, so its head, with a way in, shows while full screen is off. */
  view?: boolean
  onEnter?: () => void
}

/**
 * The frame in miniature: More, Play and the artist's link stay in full
 * screen; a view's head, with its way in, goes with the library, and the way
 * out comes in its place; the artist's link opens a page where the library is.
 */
function Frame({ view = true, onEnter = nothing }: FrameProps) {
  const more = useRef<HTMLButtonElement>(null)
  const wayIn = useRef<HTMLButtonElement>(null)
  const wayOut = useRef<HTMLButtonElement>(null)
  const returnTo = useCallback(() => wayIn.current ?? more.current, [])
  const [page, setPage] = useState(false)
  const { full, idle, enter, exit, exitWith, toggle } = useDesktopFullscreen({ exitRef: wayOut, returnTo, onEnter })
  return (
    <div data-testid="frame" data-full={full || undefined} data-idle={idle || undefined}>
      <button ref={more} type="button" onClick={toggle}>
        More
      </button>
      <button type="button" tabIndex={-1} onClick={enter}>
        Cover
      </button>
      <button type="button">Play</button>
      <button type="button" onClick={() => exitWith(() => setPage(true))}>
        Artist
      </button>
      {full ? (
        <button ref={wayOut} type="button" onClick={exit}>
          Exit full screen
        </button>
      ) : (
        view && (
          <button ref={wayIn} type="button" onClick={enter}>
            Full screen
          </button>
        )
      )}
      {page && <ArtistPage full={full} />}
    </div>
  )
}

/** The browser's view transitions, the change held until the test lets it run, as a busy page holds it a frame or more. */
function holdViewTransitions() {
  const held: ViewTransitionUpdateCallback[] = []
  Object.defineProperty(document, "startViewTransition", {
    value: (update: ViewTransitionUpdateCallback) => {
      held.push(update)
      return {} as ViewTransition
    },
    configurable: true,
  })
  return {
    release: () =>
      act(() => {
        held.splice(0).forEach((update) => void update())
      }),
  }
}

afterEach(() => {
  Reflect.deleteProperty(document, "startViewTransition")
})

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

  it("hands focus to More on the way out from the cover, with no view's head to go back to", () => {
    render(<Frame view={false} />)
    press("Cover")
    press("Exit full screen")
    expect(frame()).not.toHaveAttribute("data-full")
    expect(screen.getByRole("button", { name: "More" })).toHaveFocus()
  })

  it("closes what full screen has no room for in the same step it opens", () => {
    const transitions = holdViewTransitions()
    const onEnter = jest.fn()
    render(<Frame onEnter={onEnter} />)
    press("More")
    expect(onEnter).not.toHaveBeenCalled()
    expect(frame()).not.toHaveAttribute("data-full")

    transitions.release()
    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(frame()).toHaveAttribute("data-full")
  })

  it("leaves with a page to show in the same step, so the page opens out of full screen", () => {
    const transitions = holdViewTransitions()
    render(<Frame />)
    press("More")
    transitions.release()

    press("Artist")
    expect(screen.queryByRole("region", { name: "Artist page" })).not.toBeInTheDocument()
    transitions.release()
    expect(frame()).not.toHaveAttribute("data-full")
    expect(screen.getByRole("region", { name: "Artist page" })).not.toHaveAttribute("data-opened-in-full")
  })

  it("shows a page at once outside full screen", () => {
    render(<Frame />)
    press("Artist")
    expect(screen.getByRole("region", { name: "Artist page" })).toBeInTheDocument()
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
