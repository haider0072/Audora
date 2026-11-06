import { act, renderHook } from "@testing-library/react"

import { useDownloadTarget } from "@/hooks/use-download-target"

beforeEach(() => localStorage.clear())

describe("useDownloadTarget", () => {
  it("saves downloads on this device until told otherwise", () => {
    const { result } = renderHook(() => useDownloadTarget())
    expect(result.current[0]).toBe("device")
  })

  it("remembers the cloud alone once chosen, for the next time the player opens", () => {
    const first = renderHook(() => useDownloadTarget())
    act(() => first.result.current[1]("cloud"))
    expect(first.result.current[0]).toBe("cloud")
    first.unmount()

    expect(renderHook(() => useDownloadTarget()).result.current[0]).toBe("cloud")
  })

  it("takes anything else it finds stored as this device", () => {
    localStorage.setItem("audora_download_target", "somewhere")
    expect(renderHook(() => useDownloadTarget()).result.current[0]).toBe("device")
  })

  it("still changes for now when the browser will not store the choice", () => {
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError")
    })
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})

    const { result } = renderHook(() => useDownloadTarget())
    act(() => result.current[1]("cloud"))
    expect(result.current[0]).toBe("cloud")
    expect(warn).toHaveBeenCalled()

    setItem.mockRestore()
    warn.mockRestore()
  })
})
