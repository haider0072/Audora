import { act, renderHook } from "@testing-library/react"

import { useOnlineStatus } from "@/hooks/use-online-status"

describe("useOnlineStatus", () => {
  it("follows the browser going offline and coming back", () => {
    const onLine = jest.spyOn(navigator, "onLine", "get").mockReturnValue(true)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)

    onLine.mockReturnValue(false)
    act(() => {
      window.dispatchEvent(new Event("offline"))
    })
    expect(result.current).toBe(false)

    onLine.mockReturnValue(true)
    act(() => {
      window.dispatchEvent(new Event("online"))
    })
    expect(result.current).toBe(true)
    onLine.mockRestore()
  })
})
