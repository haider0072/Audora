interface AudioMetadata {
  title?: string
  artist?: string
  artists?: string[] // <-- Add this line
  album?: string
  year?: string
  genre?: string
  bitrate?: number
  sampleRate?: number
  duration?: number
  isHiRes?: boolean
  albumArt?: string
  fileSize?: number
  format?: string
}

export class MetadataExtractor {
  static async extractMetadata(file: File): Promise<AudioMetadata> {
    const metadata: AudioMetadata = {
      title: file.name.replace(/\.[^/.]+$/, ""),
      fileSize: file.size,
      format: file.name.split(".").pop()?.toUpperCase() || "UNKNOWN",
    }

    try {
      // Create audio element to get basic metadata
      const audio = new Audio()
      const url = URL.createObjectURL(file)
      audio.src = url

      await new Promise<void>((resolve, reject) => {
        audio.addEventListener("loadedmetadata", () => resolve())
        audio.addEventListener("error", () => reject(new Error("Failed to load audio")))
      })

      metadata.duration = audio.duration
      metadata.sampleRate = 44100 // Default, will be updated with Web Audio API

      // Estimate bitrate from file size and duration
      if (metadata.duration && metadata.fileSize) {
        const estimatedBitrate = (metadata.fileSize * 8) / (metadata.duration * 1000) // kbps
        metadata.bitrate = Math.round(estimatedBitrate)

        // Determine if Hi-Res based on bitrate and file format
        metadata.isHiRes =
          estimatedBitrate > 1000 ||
          file.name.toLowerCase().includes("24bit") ||
          file.name.toLowerCase().includes("96khz") ||
          file.name.toLowerCase().includes("192khz") ||
          (file.name.toLowerCase().includes("flac") && estimatedBitrate > 800)
      }

      URL.revokeObjectURL(url)

      // Extract metadata from file buffer for more detailed info
      const buffer = await file.arrayBuffer()
      const additionalMetadata = await this.parseFileMetadata(buffer, file.type)

      return { ...metadata, ...additionalMetadata }
    } catch (error) {
      console.error("Error extracting metadata:", error)
      return metadata
    }
  }

  private static async parseFileMetadata(buffer: ArrayBuffer, mimeType: string): Promise<Partial<AudioMetadata>> {
    const view = new DataView(buffer)
    const metadata: Partial<AudioMetadata> = {}

    try {
      if (mimeType.includes("mp3") || this.isMp3Buffer(view)) {
        return this.parseMp3Metadata(view)
      } else if (mimeType.includes("flac") || this.isFlacBuffer(view)) {
        return this.parseFlacMetadata(view)
      }
    } catch (error) {
      console.error("Error parsing file metadata:", error)
    }

    return metadata
  }

  private static isMp3Buffer(view: DataView): boolean {
    // Check for ID3 tag or MP3 frame sync
    const id3 = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2))
    return id3 === "ID3" || (view.getUint8(0) === 0xff && (view.getUint8(1) & 0xe0) === 0xe0)
  }

  private static isFlacBuffer(view: DataView): boolean {
    const flacSignature = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
    return flacSignature === "fLaC"
  }

  private static parseMp3Metadata(view: DataView): Partial<AudioMetadata> {
    const metadata: Partial<AudioMetadata> = {}

    try {
      // Look for ID3v2 tag
      if (view.getUint8(0) === 0x49 && view.getUint8(1) === 0x44 && view.getUint8(2) === 0x33) {
        const id3Size = this.getId3Size(view, 6)
        const id3Data = this.parseId3v2(view, 10, id3Size)
        Object.assign(metadata, id3Data)
      }

      // Extract album art from ID3v2 APIC frame
      metadata.albumArt = this.extractMp3AlbumArt(view)
    } catch (error) {
      console.error("Error parsing MP3 metadata:", error)
    }

    return metadata
  }

  private static parseFlacMetadata(view: DataView): Partial<AudioMetadata> {
    const metadata: Partial<AudioMetadata> = {}

    try {
      let offset = 4 // Skip 'fLaC' signature

      while (offset < view.byteLength) {
        const blockHeader = view.getUint8(offset)
        const isLast = (blockHeader & 0x80) !== 0
        const blockType = blockHeader & 0x7f
        const blockSize =
          (view.getUint8(offset + 1) << 16) | (view.getUint8(offset + 2) << 8) | view.getUint8(offset + 3)

        offset += 4

        if (blockType === 4) {
          // VORBIS_COMMENT
          const vorbisData = this.parseVorbisComment(view, offset, blockSize)
          Object.assign(metadata, vorbisData)
        } else if (blockType === 6) {
          // PICTURE
          metadata.albumArt = this.extractFlacAlbumArt(view, offset, blockSize)
        }

        offset += blockSize
        if (isLast) break
      }
    } catch (error) {
      console.error("Error parsing FLAC metadata:", error)
    }

    return metadata
  }

  private static getId3Size(view: DataView, offset: number): number {
    return (
      ((view.getUint8(offset) & 0x7f) << 21) |
      ((view.getUint8(offset + 1) & 0x7f) << 14) |
      ((view.getUint8(offset + 2) & 0x7f) << 7) |
      (view.getUint8(offset + 3) & 0x7f)
    )
  }

  private static parseId3v2(view: DataView, offset: number, size: number): Partial<AudioMetadata> {
    const metadata: Partial<AudioMetadata> = {}
    const endOffset = offset + size

    while (offset < endOffset - 10) {
      const frameId = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3),
      )

      if (frameId === "\0\0\0\0") break

      const frameSize = view.getUint32(offset + 4, false)
      const frameData = new Uint8Array(view.buffer, view.byteOffset + offset + 10, frameSize)
      const textContent = new TextDecoder("utf-8").decode(frameData.slice(1)) // Skip encoding byte

      switch (frameId) {
        case "TIT2":
          metadata.title = textContent
          break
        case "TPE1":
          metadata.artist = textContent
          metadata.artists = textContent.split(/;|,|\//).map(a => a.trim()).filter(Boolean)
          console.log('Parsed artists (ID3v2):', metadata.artists)
          break
        case "TALB":
          metadata.album = textContent
          break
        case "TYER":
        case "TDRC":
          metadata.year = textContent
          break
        case "TCON":
          metadata.genre = textContent
          break
      }

      offset += 10 + frameSize
    }
    return metadata
    
  }
  

  private static parseVorbisComment(view: DataView, offset: number, blockSize: number): Partial<AudioMetadata> {
    const metadata: Partial<AudioMetadata> = {}

    try {
      // Skip vendor string
      const vendorLength = view.getUint32(offset, true)
      offset += 4 + vendorLength

      const commentCount = view.getUint32(offset, true)
      offset += 4

      for (let i = 0; i < commentCount; i++) {
        const commentLength = view.getUint32(offset, true)
        offset += 4

        const commentBytes = new Uint8Array(view.buffer, view.byteOffset + offset, commentLength)
        const comment = new TextDecoder("utf-8").decode(commentBytes)
        const [key, value] = comment.split("=", 2)

        switch (key.toUpperCase()) {
          case "TITLE":
            metadata.title = value
            break
          case "ARTIST":
            if (!metadata.artists) metadata.artists = [];
            metadata.artists.push(...value.split(/;|,|\//).map(a => a.trim()).filter(Boolean))
            console.log('Parsed artists (Vorbis):', metadata.artists)
            break
          case "ALBUM":
            metadata.album = value
            break
          case "DATE":
            metadata.year = value
            break
          case "GENRE":
            metadata.genre = value
            break
        }

        offset += commentLength
      }
    } catch (error) {
      console.error("Error parsing Vorbis comment:", error)
    }

    return metadata
  }

  private static extractMp3AlbumArt(view: DataView): string | undefined {
    try {
      // Look for APIC frame in ID3v2
      let offset = 10 // Skip ID3v2 header
      const id3Size = this.getId3Size(view, 6)
      const endOffset = offset + id3Size

      while (offset < endOffset - 10) {
        const frameId = String.fromCharCode(
          view.getUint8(offset),
          view.getUint8(offset + 1),
          view.getUint8(offset + 2),
          view.getUint8(offset + 3),
        )

        if (frameId === "APIC") {
          const frameSize = view.getUint32(offset + 4, false)
          const frameStart = offset + 10

          // Skip text encoding and MIME type
          let dataOffset = frameStart + 1
          while (dataOffset < frameStart + frameSize && view.getUint8(dataOffset) !== 0) {
            dataOffset++
          }
          dataOffset++ // Skip null terminator
          dataOffset++ // Skip picture type

          // Skip description
          while (dataOffset < frameStart + frameSize && view.getUint8(dataOffset) !== 0) {
            dataOffset++
          }
          dataOffset++ // Skip null terminator

          // Extract image data
          const imageSize = frameSize - (dataOffset - frameStart)
          const imageData = new Uint8Array(view.buffer, view.byteOffset + dataOffset, imageSize)
          const blob = new Blob([imageData], { type: "image/jpeg" })
          return URL.createObjectURL(blob)
        }

        const frameSize = view.getUint32(offset + 4, false)
        offset += 10 + frameSize
      }
    } catch (error) {
      console.error("Error extracting MP3 album art:", error)
    }
    return undefined
  }

  private static extractFlacAlbumArt(view: DataView, offset: number, blockSize: number): string | undefined {
    try {
      // Skip picture type (4 bytes)
      offset += 4

      // Get MIME type length and skip it
      const mimeLength = view.getUint32(offset, false)
      offset += 4 + mimeLength

      // Get description length and skip it
      const descLength = view.getUint32(offset, false)
      offset += 4 + descLength

      // Skip width, height, depth, colors (16 bytes total)
      offset += 16

      // Get image data length
      const imageLength = view.getUint32(offset, false)
      offset += 4

      // Extract image data
      const imageData = new Uint8Array(view.buffer, view.byteOffset + offset, imageLength)
      const blob = new Blob([imageData], { type: "image/jpeg" })
      return URL.createObjectURL(blob)
    } catch (error) {
      console.error("Error extracting FLAC album art:", error)
    }
    
    return undefined
  }
}

export type { AudioMetadata }
