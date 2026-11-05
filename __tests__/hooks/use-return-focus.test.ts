import { renderHook } from "@testing-library/react"

import { useReturnFocus } from "@/hooks/use-return-focus"

/** A button on the page, holding focus. */
function focusedButton(): HTMLButtonElement {
  const button = document.createElement("button")
  document.body.append(button)
  button.focus()
  return button
}

/** Focus moving into the dialog once it opens. */
function focusInside() {
  const field = document.createElement("input")
  document.body.append(field)
  field.focus()
}

afterEach(() => {
  document.body.replaceChildren()
})

describe("useReturnFocus", () => {
  it("opens the dialog, then hands focus back to what opened it", () => {
    const opener = focusedButton()
    const { result } = renderHook(() => useReturnFocus())
    const setOpen = jest.fn()

    result.current.open(setOpen)
    expect(setOpen).toHaveBeenCalledWith(true)
    focusInside()

    const close = new Event("focusScope.autoFocusOnUnmount", { cancelable: true })
    result.current.onCloseAutoFocus(close)
    expect(close.defaultPrevented).toBe(true)
    expect(opener).toHaveFocus()
  })

  it("leaves focus to the dialog when what opened it has gone", () => {
    const opener = focusedButton()
    const { result } = renderHook(() => useReturnFocus())

    result.current.open(jest.fn())
    opener.remove()

    const close = new Event("focusScope.autoFocusOnUnmount", { cancelable: true })
    result.current.onCloseAutoFocus(close)
    expect(close.defaultPrevented).toBe(false)
  })

  it("hands focus back once per opening", () => {
    focusedButton()
    const { result } = renderHook(() => useReturnFocus())

    result.current.open(jest.fn())
    result.current.onCloseAutoFocus(new Event("focusScope.autoFocusOnUnmount", { cancelable: true }))

    const again = new Event("focusScope.autoFocusOnUnmount", { cancelable: true })
    result.current.onCloseAutoFocus(again)
    expect(again.defaultPrevented).toBe(false)
  })
})
