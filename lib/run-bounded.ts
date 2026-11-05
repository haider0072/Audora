/**
 * Run `task` over `items` with at most `limit` in flight. Once `shouldStop`
 * returns true no further item is started; those already running finish.
 * Pure, for the server and the browser alike.
 */
export async function runBounded<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
  shouldStop: () => boolean = () => false,
): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length && !shouldStop()) {
      await task(items[next++])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}
