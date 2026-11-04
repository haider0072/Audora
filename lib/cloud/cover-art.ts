import sharp from "sharp"

/**
 * Covers for the cloud library, rendered once at index time. Server only.
 *
 * Embedded art is whatever the tagger put there — in this library up to
 * 4000×4000 and 10.9 MB — and a list row shows it at 48 px. Serving that
 * original to every row is what made the library heavy, so each cover is
 * rendered at the two sizes the UI actually draws, as WebP:
 *
 * - `small` (256 px square) for list rows, the mini player and the queue:
 *   sharp at 3× the largest row slot. Measured at 3–20 KB.
 * - `large` (fitted inside 1024 px, never enlarged) for the now-playing
 *   view. Measured at 8–312 KB.
 *
 * Re-encoding also means the bytes served are always a real image of a known
 * type, whatever the file claimed to contain.
 */

export const SMALL_COVER_PX = 256
export const LARGE_COVER_PX = 1024

/**
 * Decoding refuses anything larger than this. The largest cover in the
 * library is 16 megapixels (measured 2026-11-04); three times that leaves
 * room for real art and none for a decompression bomb.
 */
const MAX_INPUT_PIXELS = 48_000_000

export interface RenderedCovers {
  small: Uint8Array<ArrayBuffer>
  large: Uint8Array<ArrayBuffer>
}

function toBytes(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(buffer.length))
  bytes.set(buffer)
  return bytes
}

/** Both cover sizes for embedded art, or null when the bytes are not an image sharp can read. */
export async function renderCovers(art: Uint8Array): Promise<RenderedCovers | null> {
  try {
    // `rotate()` with no angle applies the EXIF orientation, then drops it.
    const source = sharp(art, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).rotate()
    const [small, large] = await Promise.all([
      source.clone().resize(SMALL_COVER_PX, SMALL_COVER_PX, { fit: "cover" }).webp({ quality: 80 }).toBuffer(),
      source
        .clone()
        .resize(LARGE_COVER_PX, LARGE_COVER_PX, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer(),
    ])
    return { small: toBytes(small), large: toBytes(large) }
  } catch (error) {
    console.warn("Embedded art could not be rendered; indexing the song without a cover:", error)
    return null
  }
}
