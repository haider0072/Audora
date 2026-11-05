import { rovingMove } from "@/lib/roving"

describe("rovingMove", () => {
  it("moves tabs with ← and →, round the ends", () => {
    expect(rovingMove("ArrowRight", 0, 3, "tabs")).toBe(1)
    expect(rovingMove("ArrowRight", 2, 3, "tabs")).toBe(0)
    expect(rovingMove("ArrowLeft", 0, 3, "tabs")).toBe(2)
  })

  it("leaves ↑ and ↓ to the page in a row of tabs, and moves radio buttons with them", () => {
    expect(rovingMove("ArrowDown", 0, 3, "tabs")).toBeNull()
    expect(rovingMove("ArrowDown", 0, 3, "radios")).toBe(1)
    expect(rovingMove("ArrowUp", 0, 3, "radios")).toBe(2)
  })

  it("goes to either end with Home and End, and ignores other keys", () => {
    expect(rovingMove("Home", 2, 3, "radios")).toBe(0)
    expect(rovingMove("End", 0, 3, "tabs")).toBe(2)
    expect(rovingMove("a", 1, 3, "tabs")).toBeNull()
  })
})
