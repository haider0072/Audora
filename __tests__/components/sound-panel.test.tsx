import { fireEvent, render, screen } from "@testing-library/react"

import { SoundPanel, type SoundPanelProps } from "@/components/sound/sound-panel"
import { BUILT_IN_PRESETS, type EqPreset, type EqualizerBand } from "@/lib/eq-presets"

// The faders measure their knob; jsdom has no layout to measure.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

const FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
const MY_EQ = BUILT_IN_PRESETS.find((preset) => preset.id === "my-eq")!
const MINE: EqPreset = { id: "custom-1", name: "Mine", gains: Array(10).fill(1), preamp: 0 }

function bandsAt(gains: readonly number[]): EqualizerBand[] {
  return FREQUENCIES.map((frequency, index) => ({ frequency, gain: gains[index], label: `${frequency}Hz` }))
}

function renderPanel(props: Partial<SoundPanelProps> = {}) {
  const all: SoundPanelProps = {
    bands: bandsAt(MY_EQ.gains),
    onBandChange: jest.fn(),
    onReset: jest.fn(),
    preampDb: 0,
    onPreampChange: jest.fn(),
    normalizationEnabled: false,
    onNormalizationChange: jest.fn(),
    presets: [...BUILT_IN_PRESETS, MINE],
    activePresetId: "my-eq",
    onPresetSelect: jest.fn(),
    onPresetSave: jest.fn(),
    onPresetDelete: jest.fn(),
    ...props,
  }
  render(<SoundPanel {...all} />)
  return all
}

describe("SoundPanel", () => {
  it("lights the preset the bands are at, and names it", () => {
    renderPanel()
    expect(screen.getByRole("radio", { name: "My EQ" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("radio", { name: "Rock" })).toHaveAttribute("aria-checked", "false")
    expect(screen.getByText("My EQ", { selector: ".surface-meta" })).toBeInTheDocument()
  })

  it("says Custom once the bands are moved off every preset, and keeps one way in for Tab", () => {
    renderPanel({ activePresetId: undefined })
    const radios = screen.getAllByRole("radio")
    expect(radios.every((radio) => radio.getAttribute("aria-checked") === "false")).toBe(true)
    expect(radios.filter((radio) => radio.tabIndex === 0)).toEqual([radios[0]])
    expect(screen.getByText("Custom")).toBeInTheDocument()
  })

  it("applies a preset picked", () => {
    const props = renderPanel()
    fireEvent.click(screen.getByRole("radio", { name: "Rock" }))
    expect(props.onPresetSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "rock" }))
  })

  it("draws a fader for each band and the preamp, each read out in dB", () => {
    renderPanel({ preampDb: -1.5 })
    const faders = screen.getAllByRole("slider")
    expect(faders).toHaveLength(11)
    expect(screen.getByRole("slider", { name: "8k Hz" })).toHaveAttribute("aria-valuetext", "+5.8 dB")
    expect(screen.getByRole("slider", { name: "Preamp" })).toHaveAttribute("aria-valuetext", "−1.5 dB")
  })

  it("sets a typed gain on Return, held within ±12 dB", () => {
    const props = renderPanel()
    const gain = screen.getByRole("textbox", { name: "32 Hz gain in dB" })
    fireEvent.focus(gain)
    fireEvent.change(gain, { target: { value: "−15" } })
    fireEvent.keyDown(gain, { key: "Enter" })
    // Return leaves the field; leaving it is what sets the gain.
    fireEvent.blur(gain)
    expect(props.onBandChange).toHaveBeenCalledWith(0, -12)
  })

  it("leaves a band as it was when what is typed isn't a number", () => {
    const props = renderPanel()
    const gain = screen.getByRole("textbox", { name: "1k Hz gain in dB" })
    fireEvent.focus(gain)
    fireEvent.change(gain, { target: { value: "loud" } })
    fireEvent.blur(gain)
    expect(props.onBandChange).not.toHaveBeenCalled()
    expect(gain).toHaveValue("−1.5")
  })

  it("saves the bands as a named preset, and gives focus back to the way to save", () => {
    const props = renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "Save as preset" }))
    const name = screen.getByRole("textbox", { name: "Preset name" })
    expect(name).toHaveFocus()

    // With no name, Save says it can't run and does nothing.
    const save = screen.getByRole("button", { name: "Save" })
    expect(save).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(save)
    expect(props.onPresetSave).not.toHaveBeenCalled()

    fireEvent.change(name, { target: { value: "  Night  " } })
    fireEvent.submit(name)
    expect(props.onPresetSave).toHaveBeenCalledWith("Night")
    expect(screen.queryByRole("textbox", { name: "Preset name" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save as preset" })).toHaveFocus()
  })

  it("offers to delete a preset of one's own, and only that", () => {
    const props = renderPanel({ activePresetId: MINE.id })
    fireEvent.click(screen.getByRole("button", { name: "Delete “Mine”" }))
    expect(props.onPresetDelete).toHaveBeenCalledWith(MINE.id)
  })

  it("has no way to delete a built-in preset", () => {
    renderPanel()
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument()
  })

  it("switches normalization with a switch named by its heading", () => {
    const props = renderPanel()
    const toggle = screen.getByRole("switch", { name: "Loudness normalization" })
    expect(toggle).toHaveAttribute("aria-checked", "false")
    expect(toggle).toHaveTextContent("Off")
    fireEvent.click(toggle)
    expect(props.onNormalizationChange).toHaveBeenCalledWith(true)
  })

  it("says how much headroom the largest boost takes", () => {
    renderPanel()
    expect(screen.getByText(/Headroom −5\.8 dB for the largest boost/)).toBeInTheDocument()
  })
})
