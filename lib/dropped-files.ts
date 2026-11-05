/**
 * What was dropped on the window, as files the library can add. Folders are
 * read all the way down.
 */

import { isSupportedAudioFile } from "@/lib/audio-formats"

export interface DroppedFiles {
  files: File[]
  /** Entries the browser would not hand over, such as a folder it was refused access to. */
  unreadable: number
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

/** A directory reader hands its entries over in batches (a hundred at a time in Chrome) until it has none left. */
async function childrenOf(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = directory.createReader()
  const children: FileSystemEntry[] = []
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (batch.length === 0) return children
    children.push(...batch)
  }
}

/**
 * Call while the drop event is being handled: the browser empties
 * `data.items` once the handler returns, so the entries are taken at once and
 * read afterwards.
 */
export function readDroppedFiles(data: DataTransfer): Promise<DroppedFiles> {
  const entries: FileSystemEntry[] = []
  const files: File[] = []
  const items = Array.from(data.items ?? [])
  for (const item of items) {
    if (item.kind !== "file") continue
    const entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null
    const file = entry ? null : item.getAsFile()
    if (entry) entries.push(entry)
    else if (file) files.push(file)
  }
  // A browser without drop items still lists the files themselves.
  if (items.length === 0) files.push(...Array.from(data.files))

  let unreadable = 0
  const read = async (entry: FileSystemEntry): Promise<File[]> => {
    try {
      if (entry.isDirectory) {
        const children = await childrenOf(entry as FileSystemDirectoryEntry)
        return (await Promise.all(children.map(read))).flat()
      }
      if (entry.isFile && isSupportedAudioFile(entry.name)) return [await fileOf(entry as FileSystemFileEntry)]
      return []
    } catch (error) {
      console.warn(`Could not read ${entry.fullPath} from the drop`, error)
      unreadable++
      return []
    }
  }

  return Promise.all(entries.map(read)).then((nested) => ({
    files: [...files.filter((file) => isSupportedAudioFile(file.name)), ...nested.flat()],
    unreadable,
  }))
}
