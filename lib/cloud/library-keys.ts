import { isAudioFileName } from "./audio-files"

/**
 * Where songs live in the bucket. Kept apart from the indexer so the upload
 * route can name keys without bundling the indexer's image library.
 */

export const LIBRARY_PREFIX = "library/"

export function isAudioKey(key: string): boolean {
  return key.startsWith(LIBRARY_PREFIX) && !key.endsWith("/") && isAudioFileName(key)
}
