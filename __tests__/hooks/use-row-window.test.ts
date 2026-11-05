import { rowAt, rowOffsets, windowFor } from "@/hooks/use-row-window"

describe("rowOffsets", () => {
  it("is where each row begins, ending with the height of them all", () => {
    expect(rowOffsets([52, 32, 56, 56])).toEqual([0, 52, 84, 140, 196])
    expect(rowOffsets([])).toEqual([0])
  })
})

describe("rowAt", () => {
  const offsets = rowOffsets([52, 32, 56, 56])

  it("finds the row that holds a point", () => {
    expect(rowAt(offsets, 0)).toBe(0)
    expect(rowAt(offsets, 51)).toBe(0)
    expect(rowAt(offsets, 52)).toBe(1)
    expect(rowAt(offsets, 139)).toBe(2)
    expect(rowAt(offsets, 140)).toBe(3)
  })

  it("stays within the rows", () => {
    expect(rowAt(offsets, -10)).toBe(0)
    expect(rowAt(offsets, 10_000)).toBe(3)
    expect(rowAt([0], 0)).toBe(0)
  })
})

describe("windowFor", () => {
  // 100 rows of 50 px: 5,000 px in all.
  const offsets = rowOffsets(new Array(100).fill(50))

  it("covers the rows in view, and a few either side", () => {
    expect(windowFor(offsets, 1_000, 300, 2)).toEqual({ first: 20, start: 18, end: 28 })
  })

  it("counts a row partly in view", () => {
    expect(windowFor(offsets, 1_010, 300, 0)).toEqual({ first: 20, start: 20, end: 27 })
  })

  it("stops at either end of the list", () => {
    expect(windowFor(offsets, 0, 300, 8)).toEqual({ first: 0, start: 0, end: 14 })
    expect(windowFor(offsets, 4_800, 300, 8)).toEqual({ first: 96, start: 88, end: 100 })
  })

  it("is empty for an empty list", () => {
    expect(windowFor([0], 0, 300, 8)).toEqual({ first: 0, start: 0, end: 0 })
  })
})
