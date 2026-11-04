/**
 * @jest-environment node
 */
import sharp from "sharp"

import { LARGE_COVER_PX, SMALL_COVER_PX, renderCovers } from "@/lib/cloud/cover-art"

async function jpeg(width: number, height: number): Promise<Uint8Array> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 90 } } })
    .jpeg()
    .toBuffer()
}

describe("renderCovers", () => {
  it("renders a square list thumbnail and a fitted player cover, both WebP", async () => {
    const covers = await renderCovers(await jpeg(3000, 2000))
    expect(covers).not.toBeNull()

    const small = await sharp(covers!.small).metadata()
    expect([small.format, small.width, small.height]).toEqual(["webp", SMALL_COVER_PX, SMALL_COVER_PX])

    const large = await sharp(covers!.large).metadata()
    expect([large.format, large.width, large.height]).toEqual(["webp", LARGE_COVER_PX, 683])
  })

  it("never enlarges a small original for the player size", async () => {
    const covers = await renderCovers(await jpeg(500, 500))
    const large = await sharp(covers!.large).metadata()
    expect([large.width, large.height]).toEqual([500, 500])
  })

  it("returns null for bytes that are not an image", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {})
    expect(await renderCovers(new TextEncoder().encode("<html>not a cover</html>"))).toBeNull()
  })
})
