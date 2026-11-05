import { fireEvent, renderHook } from "@testing-library/react"

import { searchShortcut, useSearchShortcut } from "@/hooks/use-search-shortcut"

function onPlatform(platform: string) {
  jest.spyOn(navigator, "platform", "get").mockReturnValue(platform)
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe("useSearchShortcut", () => {
  it("answers ⌘K on a Mac, and leaves Ctrl+K to the text field there", () => {
    onPlatform("MacIntel")
    const onPress = jest.fn()
    renderHook(() => useSearchShortcut(onPress))

    fireEvent.keyDown(window, { key: "k", ctrlKey: true })
    expect(onPress).not.toHaveBeenCalled()
    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, cancelable: true })
    window.dispatchEvent(event)
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it("answers Ctrl+K elsewhere", () => {
    onPlatform("Win32")
    const onPress = jest.fn()
    renderHook(() => useSearchShortcut(onPress))

    fireEvent.keyDown(window, { key: "k", metaKey: true })
    expect(onPress).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: "K", ctrlKey: true })
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it("presses once for a held key, and not with other modifiers", () => {
    onPlatform("MacIntel")
    const onPress = jest.fn()
    renderHook(() => useSearchShortcut(onPress))

    fireEvent.keyDown(window, { key: "k", metaKey: true, repeat: true })
    fireEvent.keyDown(window, { key: "k", metaKey: true, shiftKey: true })
    fireEvent.keyDown(window, { key: "k", metaKey: true, altKey: true })
    expect(onPress).not.toHaveBeenCalled()
  })

  it("calls the latest handler it was given", () => {
    onPlatform("MacIntel")
    const first = jest.fn()
    const second = jest.fn()
    const { rerender } = renderHook(({ onPress }) => useSearchShortcut(onPress), { initialProps: { onPress: first } })
    rerender({ onPress: second })

    fireEvent.keyDown(window, { key: "k", metaKey: true })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it("names the shortcut the way the system writes it", () => {
    onPlatform("MacIntel")
    expect(searchShortcut()).toEqual({ label: "⌘K", aria: "Meta+K" })
    onPlatform("Linux x86_64")
    expect(searchShortcut()).toEqual({ label: "Ctrl K", aria: "Control+K" })
  })
})
