import { isSupportedAudioFile } from "@/lib/audio-formats"
import { readDroppedFiles } from "@/lib/dropped-files"

/** A file entry as a drop hands it over; `broken` ones refuse to give up their file. */
function fileEntry(name: string, path = `/${name}`, broken = false): FileSystemFileEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    fullPath: path,
    file: (resolve: (file: File) => void, reject: (error: Error) => void) =>
      broken ? reject(new Error("NotReadableError")) : resolve(new File(["x"], name)),
  } as unknown as FileSystemFileEntry
}

/** A folder whose reader hands its children over `batchSize` at a time, as Chrome does a hundred at a time. */
function folderEntry(name: string, children: FileSystemEntry[], batchSize = 2): FileSystemDirectoryEntry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    fullPath: `/${name}`,
    createReader: () => {
      let next = 0
      return {
        readEntries: (resolve: (entries: FileSystemEntry[]) => void) => {
          resolve(children.slice(next, next + batchSize))
          next += batchSize
        },
      }
    },
  } as unknown as FileSystemDirectoryEntry
}

function dataTransfer(entries: Array<FileSystemEntry | File>): DataTransfer {
  const items = entries.map((entry) => ({
    kind: "file",
    webkitGetAsEntry: () => (entry instanceof File ? null : entry),
    getAsFile: () => (entry instanceof File ? entry : null),
  }))
  return { items, files: [] } as unknown as DataTransfer
}

const names = (files: File[]) => files.map((file) => file.name).sort()

describe("readDroppedFiles", () => {
  it("reads folders all the way down, past the reader's batches", async () => {
    const album = folderEntry("Moon Safari", [
      fileEntry("01 La femme d'argent.flac"),
      fileEntry("02 Sexy Boy.flac"),
      fileEntry("03 All I Need.flac"),
      folderEntry("Bonus", [fileEntry("04 Kelly Watch the Stars.mp3")]),
    ])
    const { files, unreadable } = await readDroppedFiles(dataTransfer([album, fileEntry("loose.wav")]))
    expect(names(files)).toEqual([
      "01 La femme d'argent.flac",
      "02 Sexy Boy.flac",
      "03 All I Need.flac",
      "04 Kelly Watch the Stars.mp3",
      "loose.wav",
    ])
    expect(unreadable).toBe(0)
  })

  it("keeps only what the library can add", async () => {
    const album = folderEntry("Album", [fileEntry("cover.jpg"), fileEntry("01.flac"), fileEntry("._01.flac"), fileEntry("notes.txt")])
    const { files } = await readDroppedFiles(dataTransfer([album]))
    expect(names(files)).toEqual(["01.flac"])
  })

  it("skips and counts what cannot be read, and keeps the rest", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    const album = folderEntry("Album", [fileEntry("01.flac"), fileEntry("02.flac", "/Album/02.flac", true)])
    const { files, unreadable } = await readDroppedFiles(dataTransfer([album]))
    expect(names(files)).toEqual(["01.flac"])
    expect(unreadable).toBe(1)
    expect(warn).toHaveBeenCalledWith("Could not read /Album/02.flac from the drop", expect.any(Error))
    warn.mockRestore()
  })

  it("takes a file the browser hands over without an entry as it is", async () => {
    const { files } = await readDroppedFiles(dataTransfer([new File(["x"], "Teardrop.flac")]))
    expect(names(files)).toEqual(["Teardrop.flac"])
  })

  it("falls back to the file list when there are no drop items", async () => {
    const data = { items: [], files: [new File(["x"], "a.m4a"), new File(["x"], "b.png")] } as unknown as DataTransfer
    const { files } = await readDroppedFiles(data)
    expect(names(files)).toEqual(["a.m4a"])
  })
})

describe("isSupportedAudioFile", () => {
  it("knows the library's formats by extension, in any case", () => {
    expect(isSupportedAudioFile("Song.FLAC")).toBe(true)
    expect(isSupportedAudioFile("song.aac")).toBe(true)
    expect(isSupportedAudioFile("song.ogg")).toBe(false)
    expect(isSupportedAudioFile("flac")).toBe(false)
  })

  it("leaves out the metadata files macOS writes beside each file", () => {
    expect(isSupportedAudioFile("._Song.flac")).toBe(false)
  })
})
