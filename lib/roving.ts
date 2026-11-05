/**
 * Which keys move through a row of choices: tabs move with ← and →; radio
 * buttons with ↑ and ↓ as well. Home and End go to either end.
 */
export type RovingKeys = "tabs" | "radios"

/**
 * Where a key moves to in a row of `length` choices, from the one at
 * `index`, round the ends: the index to move to, or null for a key that
 * does not move.
 */
export function rovingMove(key: string, index: number, length: number, keys: RovingKeys): number | null {
  const radios = keys === "radios"
  if (key === "ArrowRight" || (radios && key === "ArrowDown")) return (index + 1) % length
  if (key === "ArrowLeft" || (radios && key === "ArrowUp")) return (index - 1 + length) % length
  if (key === "Home") return 0
  if (key === "End") return length - 1
  return null
}
