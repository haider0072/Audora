import { fireEvent, render, screen } from "@testing-library/react"

import { PlayButton } from "@/components/player/play-button"
import { RollingText } from "@/components/player/rolling-text"
import { TransportButton } from "@/components/player/transport-button"

describe("PlayButton", () => {
  it("is named for what it will do", () => {
    const { rerender } = render(<PlayButton isPlaying={false} onClick={jest.fn()} />)
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument()
    rerender(<PlayButton isPlaying onClick={jest.fn()} />)
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument()
  })

  it("marks itself busy while a song loads", () => {
    const { rerender } = render(<PlayButton isPlaying={false} isLoading onClick={jest.fn()} />)
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true")
    rerender(<PlayButton isPlaying={false} onClick={jest.fn()} />)
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy")
  })

  it("calls back when pressed", () => {
    const onClick = jest.fn()
    render(<PlayButton isPlaying={false} onClick={onClick} />)
    fireEvent.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe("TransportButton", () => {
  it("reports a toggle's state", () => {
    render(
      <TransportButton label="Shuffle" pressed onClick={jest.fn()}>
        <span />
      </TransportButton>,
    )
    expect(screen.getByRole("button", { name: "Shuffle" })).toHaveAttribute("aria-pressed", "true")
  })
})

describe("RollingText", () => {
  it("rolls the old line out alongside the new one, then lets it go", () => {
    const { container, rerender } = render(<RollingText text="First song" />)
    rerender(<RollingText text="Second song" direction={-1} />)

    const leaving = screen.getByText("First song")
    expect(leaving).toHaveAttribute("aria-hidden", "true")
    expect(leaving).toHaveClass("roll-out")
    expect(screen.getByText("Second song")).toHaveClass("roll-in")
    expect(container.firstChild).toHaveStyle({ "--roll-dir": "-1" })

    fireEvent.animationEnd(leaving)
    expect(screen.queryByText("First song")).not.toBeInTheDocument()
  })

  it("renders links for the current line but only text for the leaving one", () => {
    const { rerender } = render(
      <RollingText text="Artist A">
        <button type="button">Artist A</button>
      </RollingText>,
    )
    rerender(
      <RollingText text="Artist B">
        <button type="button">Artist B</button>
      </RollingText>,
    )
    expect(screen.getByRole("button", { name: "Artist B" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Artist A" })).not.toBeInTheDocument()
    expect(screen.getByText("Artist A")).toHaveAttribute("aria-hidden", "true")
  })

  it("does not animate the first line it shows", () => {
    render(<RollingText text="Only song" />)
    expect(screen.getByText("Only song")).not.toHaveClass("roll-in")
  })
})
