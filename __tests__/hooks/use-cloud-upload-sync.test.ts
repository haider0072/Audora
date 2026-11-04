import { renderHook } from "@testing-library/react"

import { useCloudUploadSync } from "@/hooks/use-cloud-upload-sync"

const mockListeners = new Set<() => void>()
let mockState = { uploaded: 0, active: false }

jest.mock("@/lib/cloud/upload-queue", () => ({
  cloudUploads: {
    subscribe: (listener: () => void) => {
      mockListeners.add(listener)
      return () => mockListeners.delete(listener)
    },
    getSnapshot: () => mockState,
  },
}))

function publish(next: { uploaded: number; active: boolean }) {
  mockState = next
  for (const listener of mockListeners) listener()
}

describe("useCloudUploadSync", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockState = { uploaded: 0, active: false }
    mockListeners.clear()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it("refreshes the library at most every 15 s while uploads land, and once when they end", () => {
    const refresh = jest.fn()
    renderHook(() => useCloudUploadSync(refresh))

    publish({ uploaded: 1, active: true })
    expect(refresh).toHaveBeenCalledTimes(0)
    jest.advanceTimersByTime(0)
    expect(refresh).toHaveBeenCalledTimes(1)

    publish({ uploaded: 2, active: true })
    publish({ uploaded: 3, active: true })
    jest.advanceTimersByTime(14_000)
    expect(refresh).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(1_000)
    expect(refresh).toHaveBeenCalledTimes(2)

    publish({ uploaded: 4, active: false })
    expect(refresh).toHaveBeenCalledTimes(3)
    jest.advanceTimersByTime(60_000)
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it("does not refresh for batches that sent nothing", () => {
    const refresh = jest.fn()
    renderHook(() => useCloudUploadSync(refresh))

    publish({ uploaded: 0, active: true })
    publish({ uploaded: 0, active: false })
    jest.advanceTimersByTime(60_000)
    expect(refresh).not.toHaveBeenCalled()
  })

  it("asks before closing the page only while uploads run", () => {
    renderHook(() => useCloudUploadSync(jest.fn()))

    const idle = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(idle)
    expect(idle.defaultPrevented).toBe(false)

    mockState = { uploaded: 0, active: true }
    const busy = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(busy)
    expect(busy.defaultPrevented).toBe(true)
  })
})
