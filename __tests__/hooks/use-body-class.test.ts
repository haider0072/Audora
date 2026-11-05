import { renderHook } from "@testing-library/react"

import { useBodyClass } from "@/hooks/use-body-class"

describe("useBodyClass", () => {
  it("puts the class on the body while mounted, and takes it off after", () => {
    const { unmount } = renderHook(() => useBodyClass("dark"))
    expect(document.body).toHaveClass("dark")

    unmount()
    expect(document.body).not.toHaveClass("dark")
  })
})
