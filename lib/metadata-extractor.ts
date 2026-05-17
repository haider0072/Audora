interface AudioMetadata {
  title?: string
  artist?: string
  artists?: string[]
  albumArtist?: string
  album?: string
  year?: string
  genre?: string
  composer?: string
  lyricist?: string
  trackNumber?: string
  discNumber?: string
  copyright?: string
  label?: string
  isrc?: string
  encoder?: string
  comment?: string
  bitrate?: number
  sampleRate?: number
  duration?: number
  isHiRes?: boolean
  albumArt?: string
  fileSize?: number
  format?: string
  loudnessLUFS?: number
  gainCorrection?: number
}

export class MetadataExtractor {
  static async extractMetadata(file: File): Promise<AudioMetadata> {
    const metadata: AudioMetadata = {
      title: file.name.replace(/\.[^/.]+$/, ""),
      fileSize: file.size,
      format: file.name.split(".").pop()?.toUpperCase() || "UNKNOWN",
    }

    try {
      // Read only the metadata portion of the file instead of the entire file.
      // Duration is extracted from binary headers (FLAC streaminfo, MP3 frame, WAV RIFF)
      // instead of using new Audio() which gets throttled in background tabs.
      // MP3: ID3v2 tag size is in the header (bytes 6-9).
      // FLAC: scan block headers (4 bytes each) to compute exact metadata section end.
      let metadataSize: number
      const headerBuffer = await file.slice(0, 10).arrayBuffer()
      const headerView = new DataView(headerBuffer)

      if (headerView.getUint8(0) === 0x49 && headerView.getUint8(1) === 0x44 && headerView.getUint8(2) === 0x33) {
        // MP3 with ID3v2 — read exactly the tag
        metadataSize = 10 + this.getId3Size(headerView, 6)
      } else if (
        headerView.getUint8(0) === 0x66 && headerView.getUint8(1) === 0x4C &&
        headerView.getUint8(2) === 0x61 && headerView.getUint8(3) === 0x43  // "fLaC"
      ) {
        // FLAC — scan block headers to find exact metadata end (handles large embedded art)
        let scanOffset = 4
        let isLastBlock = false
        while (!isLastBlock && scanOffset < file.size) {
          const blockHeaderBuf = await file.slice(scanOffset, scanOffset + 4).arrayBuffer()
          const bh = new DataView(blockHeaderBuf)
          if (bh.byteLength < 4) break
          isLastBlock = (bh.getUint8(0) & 0x80) !== 0
          const blockSize = (bh.getUint8(1) << 16) | (bh.getUint8(2) << 8) | bh.getUint8(3)
          scanOffset += 4 + blockSize
        }
        metadataSize = Math.min(file.size, scanOffset)
      } else {
        // Other formats — read up to 4MB
        metadataSize = Math.min(file.size, 4 * 1024 * 1024)
      }

      const buffer = await file.slice(0, metadataSize).arrayBuffer()
      const additionalMetadata = await this.parseFileMetadata(buffer, file.type)

      // Merge metadata, keeping filename fallbacks for missing values
      const finalMetadata = { ...metadata, ...additionalMetadata }

      // Extract duration from binary headers (no Audio element needed)
      if (!finalMetadata.duration) {
        finalMetadata.duration = await this.extractDurationFromBinary(file, headerView)
      }

      // Compute bitrate and Hi-Res from duration
      if (finalMetadata.duration && finalMetadata.fileSize) {
        const estimatedBitrate = (finalMetadata.fileSize * 8) / (finalMetadata.duration * 1000)
        finalMetadata.bitrate = Math.round(estimatedBitrate)
        finalMetadata.isHiRes =
          estimatedBitrate > 1000 ||
          file.name.toLowerCase().includes("24bit") ||
          file.name.toLowerCase().includes("96khz") ||
          file.name.toLowerCase().includes("192khz") ||
          (file.name.toLowerCase().includes("flac") && estimatedBitrate > 800)
      }

      // Ensure we have title and artist, use filename as fallback
      if (!finalMetadata.title || finalMetadata.title.trim() === "") {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "")
        finalMetadata.title = nameWithoutExt
      }

      // Only apply artist fallback if BOTH artist and artists are missing
      if ((!finalMetadata.artist || finalMetadata.artist.trim() === "") &&
          (!finalMetadata.artists || finalMetadata.artists.length === 0)) {
        // Try to extract artist from filename patterns like "Artist - Title"
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "")
        const parts = nameWithoutExt.split(" - ")
        if (parts.length >= 2) {
          finalMetadata.artist = parts[0].trim()
          finalMetadata.artists = [parts[0].trim()]
          finalMetadata.title = parts.slice(1).join(" - ").trim()
        } else {
          finalMetadata.artist = "Unknown Artist"
          finalMetadata.artists = ["Unknown Artist"]
        }
      } else if (finalMetadata.artists && finalMetadata.artists.length > 0 && !finalMetadata.artist) {
        // If we have artists array but no artist field, use first artist
        finalMetadata.artist = finalMetadata.artists[0]
      }

      return finalMetadata
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
      let blockCount = 0

      while (offset < view.byteLength && blockCount < 10) { // Safety limit
        if (offset + 4 > view.byteLength) {
          break
        }

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
        blockCount++
        if (isLast) {
          break
        }
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
      const textContent = this.decodeId3Text(frameData)

      switch (frameId) {
        case "TIT2":
          metadata.title = textContent
          break
        case "TPE1":
          metadata.artist = textContent
          metadata.artists = textContent.split(/;|,|\//).map(a => a.trim()).filter(Boolean)
          break
        case "TPE2":
          metadata.albumArtist = textContent
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
        case "TCOM":
          metadata.composer = textContent
          break
        case "TEXT":
          metadata.lyricist = textContent
          break
        case "TRCK":
          metadata.trackNumber = textContent
          break
        case "TPOS":
          metadata.discNumber = textContent
          break
        case "TCOP":
          metadata.copyright = textContent
          break
        case "TPUB":
          metadata.label = textContent
          break
        case "TSRC":
          metadata.isrc = textContent
          break
        case "TENC":
          metadata.encoder = textContent
          break
      }

      offset += 10 + frameSize
    }
    return metadata
    
  }
  

  private static decodeId3Text(frameData: Uint8Array): string {
    const encoding = frameData[0]
    const data = frameData.slice(1)

    switch (encoding) {
      case 0x01: { // UTF-16 with BOM
        // Detect byte order from BOM (0xFFFE = LE, 0xFEFF = BE)
        const isLE = data[0] === 0xFF && data[1] === 0xFE
        const textData = data.slice(2) // Skip BOM
        const decoded = new TextDecoder(isLE ? "utf-16le" : "utf-16be").decode(textData)
        // Remove null terminators
        return decoded.replace(/\0+$/, "")
      }
      case 0x02: { // UTF-16BE without BOM
        const decoded = new TextDecoder("utf-16be").decode(data)
        return decoded.replace(/\0+$/, "")
      }
      case 0x03: { // UTF-8
        const decoded = new TextDecoder("utf-8").decode(data)
        return decoded.replace(/\0+$/, "")
      }
      default: { // 0x00 = ISO-8859-1
        const decoded = new TextDecoder("iso-8859-1").decode(data)
        return decoded.replace(/\0+$/, "")
      }
    }
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
          case "TRACKTITLE":
          case "SONG":
          case "NAME":
            if (!metadata.title || metadata.title.trim() === "") {
              metadata.title = value
            }
            break
          case "ARTIST":
            if (!metadata.artists) metadata.artists = [];
            metadata.artists.push(...value.split(/;|,|\//).map(a => a.trim()).filter(Boolean))
            break
          case "ALBUMARTIST":
          case "ALBUM ARTIST":
            metadata.albumArtist = value
            break
          case "ALBUM":
            metadata.album = value
            break
          case "DATE":
          case "YEAR":
          case "ORIGINALDATE":
            metadata.year = value
            break
          case "GENRE":
            metadata.genre = value
            break
          case "COMPOSER":
            metadata.composer = value
            break
          case "LYRICIST":
          case "WRITER":
            metadata.lyricist = value
            break
          case "TRACKNUMBER":
          case "TRACK":
          case "TRACKNUM":
            metadata.trackNumber = value
            break
          case "DISCNUMBER":
          case "DISC":
          case "DISCNUM":
            metadata.discNumber = value
            break
          case "COPYRIGHT":
            metadata.copyright = value
            break
          case "LABEL":
          case "ORGANIZATION":
            metadata.label = value
            break
          case "ISRC":
            metadata.isrc = value
            break
          case "ENCODER":
            metadata.encoder = value
            break
          case "COMMENT":
          case "DESCRIPTION":
            metadata.comment = value
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
          const blob = new Blob([imageData.slice()], { type: "image/jpeg" })
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
      const blob = new Blob([imageData.slice()], { type: "image/jpeg" })
      return URL.createObjectURL(blob)
    } catch (error) {
      console.error("Error extracting FLAC album art:", error)
    }
    
    return undefined
  }

  /**
   * Extract duration from binary file headers without using Audio element.
   * Works in background tabs without throttling.
   */
  private static async extractDurationFromBinary(file: File, headerView: DataView): Promise<number | undefined> {
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || ""

      if (ext === "flac" || this.isFlacHeader(headerView)) {
        return this.getFlacDuration(file)
      } else if (ext === "wav") {
        return this.getWavDuration(file)
      } else if (ext === "mp3" || this.isMp3Header(headerView)) {
        return this.getMp3Duration(file)
      }
    } catch (error) {
      console.error("Binary duration extraction failed:", error)
    }
    return undefined
  }

  private static isFlacHeader(view: DataView): boolean {
    return view.byteLength >= 4 &&
      view.getUint8(0) === 0x66 && view.getUint8(1) === 0x4C &&
      view.getUint8(2) === 0x61 && view.getUint8(3) === 0x43
  }

  private static isMp3Header(view: DataView): boolean {
    return (view.getUint8(0) === 0x49 && view.getUint8(1) === 0x44 && view.getUint8(2) === 0x33) ||
      (view.getUint8(0) === 0xff && (view.getUint8(1) & 0xe0) === 0xe0)
  }

  /**
   * FLAC: Duration from STREAMINFO block (always first metadata block).
   * Layout: 4 bytes "fLaC" + 4 byte block header + 34 byte STREAMINFO
   *   Offset 18 (from file start): 20-bit sample rate, 3-bit channels, 5-bit bps, 36-bit total samples
   */
  private static async getFlacDuration(file: File): Promise<number | undefined> {
    const buf = await file.slice(0, 42).arrayBuffer()
    const view = new DataView(buf)

    // Verify STREAMINFO block type (first block must be type 0)
    const blockType = view.getUint8(4) & 0x7f
    if (blockType !== 0) return undefined

    // Sample rate: 20 bits starting at byte 18
    const sampleRate =
      (view.getUint8(18) << 12) |
      (view.getUint8(19) << 4) |
      (view.getUint8(20) >> 4)
    if (sampleRate === 0) return undefined

    // Total samples: 36 bits starting at bit 164 (byte 21 lower 4 bits + bytes 22-25)
    const totalSamplesHigh = view.getUint8(21) & 0x0f
    const totalSamplesLow = view.getUint32(22, false)
    const totalSamples = totalSamplesHigh * 0x100000000 + totalSamplesLow
    if (totalSamples === 0) return undefined

    return totalSamples / sampleRate
  }

  /**
   * WAV: Duration from RIFF header.
   * data_size / (sample_rate * channels * bits_per_sample / 8)
   */
  private static async getWavDuration(file: File): Promise<number | undefined> {
    const buf = await file.slice(0, 44).arrayBuffer()
    const view = new DataView(buf)

    // Verify RIFF header
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
    if (riff !== "RIFF") return undefined

    const channels = view.getUint16(22, true)
    const sampleRate = view.getUint32(24, true)
    const bitsPerSample = view.getUint16(34, true)
    if (sampleRate === 0 || channels === 0 || bitsPerSample === 0) return undefined

    const byteRate = sampleRate * channels * (bitsPerSample / 8)
    // Data chunk size: search for "data" chunk
    let offset = 36
    const maxScan = Math.min(file.size, 1024)
    const scanBuf = await file.slice(0, maxScan).arrayBuffer()
    const scanView = new DataView(scanBuf)

    while (offset < maxScan - 8) {
      const chunkId = String.fromCharCode(
        scanView.getUint8(offset), scanView.getUint8(offset + 1),
        scanView.getUint8(offset + 2), scanView.getUint8(offset + 3)
      )
      const chunkSize = scanView.getUint32(offset + 4, true)
      if (chunkId === "data") {
        return chunkSize / byteRate
      }
      offset += 8 + chunkSize
    }

    // Fallback: estimate from file size minus header
    return (file.size - 44) / byteRate
  }

  /**
   * MP3: Estimate duration from file size and first frame bitrate.
   * Parses first valid MPEG frame header after ID3v2 tag.
   */
  private static async getMp3Duration(file: File): Promise<number | undefined> {
    // Find first frame after ID3v2 tag
    let frameOffset = 0
    const header = await file.slice(0, 10).arrayBuffer()
    const hv = new DataView(header)

    if (hv.getUint8(0) === 0x49 && hv.getUint8(1) === 0x44 && hv.getUint8(2) === 0x33) {
      frameOffset = 10 + this.getId3Size(hv, 6)
    }

    // Read first frame header (4 bytes)
    const frameBuf = await file.slice(frameOffset, frameOffset + 4).arrayBuffer()
    const fv = new DataView(frameBuf)

    // Verify frame sync (11 bits set)
    if (fv.getUint8(0) !== 0xff || (fv.getUint8(1) & 0xe0) !== 0xe0) return undefined

    const mpegVersion = (fv.getUint8(1) >> 3) & 0x03 // 0=2.5, 2=2, 3=1
    const layer = (fv.getUint8(1) >> 1) & 0x03 // 1=III, 2=II, 3=I
    const bitrateIndex = (fv.getUint8(2) >> 4) & 0x0f
    const sampleRateIndex = (fv.getUint8(2) >> 2) & 0x03

    // Bitrate lookup table (MPEG1 Layer III)
    const bitrates: Record<string, number[]> = {
      "3_1": [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0], // V1 L3
      "3_2": [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0],
      "3_3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
      "2_1": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
    }
    const sampleRates: Record<number, number[]> = {
      3: [44100, 48000, 32000],
      2: [22050, 24000, 16000],
      0: [11025, 12000, 8000],
    }

    const key = `${mpegVersion}_${layer}`
    const bitrateTable = bitrates[key] || bitrates["3_1"]
    const bitrate = bitrateTable[bitrateIndex]
    const sampleRate = sampleRates[mpegVersion]?.[sampleRateIndex]

    if (!bitrate || !sampleRate) return undefined

    // Duration = file_size_bits / bitrate_bps
    return (file.size * 8) / (bitrate * 1000)
  }
}

export type { AudioMetadata }
