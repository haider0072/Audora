export class ColorExtractor {
  private static canvas: HTMLCanvasElement | null = null
  private static ctx: CanvasRenderingContext2D | null = null
  private static colorCache = new Map<string, string>()

  private static initCanvas() {
    if (!this.canvas && typeof window !== "undefined") {
      this.canvas = document.createElement("canvas")
      this.ctx = this.canvas.getContext("2d")
    }
  }

  static getCachedColor(imageUrl: string): string | null {
    return this.colorCache.get(imageUrl) ?? null
  }

  static async extractDominantColor(imageUrl: string): Promise<string> {
    if (typeof window === "undefined") return "#1a1a1a" // Default dark color for SSR

    const cached = this.colorCache.get(imageUrl)
    if (cached) return cached

    this.initCanvas()
    if (!this.canvas || !this.ctx) return "#1a1a1a"

    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = "anonymous"

      img.onload = () => {
        try {
          // Set canvas size for better color sampling
          this.canvas!.width = 150
          this.canvas!.height = 150

          // Draw image
          this.ctx!.drawImage(img, 0, 0, 150, 150)

          // Get image data
          const imageData = this.ctx!.getImageData(0, 0, 150, 150)
          const data = imageData.data

          // Use color quantization for better dominant color detection
          const colorMap = new Map<string, number>()

          // Sample every 4th pixel for performance
          for (let i = 0; i < data.length; i += 16) {
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]
            const alpha = data[i + 3]

            // Skip transparent pixels
            if (alpha < 128) continue

            // Quantize colors to reduce noise
            const qR = Math.floor(r / 32) * 32
            const qG = Math.floor(g / 32) * 32
            const qB = Math.floor(b / 32) * 32

            const colorKey = `${qR},${qG},${qB}`
            colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1)
          }

          // Find the most frequent color
          let dominantColor = "26,26,26" // Default dark gray
          let maxCount = 0

          for (const [color, count] of colorMap.entries()) {
            if (count > maxCount) {
              maxCount = count
              dominantColor = color
            }
          }

          const [r, g, b] = dominantColor.split(",").map(Number)

          // Ensure the color isn't too bright (keep it dark for better contrast)
          const brightness = (r * 299 + g * 587 + b * 114) / 1000
          let finalR = r,
            finalG = g,
            finalB = b

          if (brightness > 100) {
            // Darken bright colors
            const factor = 0.6
            finalR = Math.floor(r * factor)
            finalG = Math.floor(g * factor)
            finalB = Math.floor(b * factor)
          }

          // Convert to hex
          const hex = `#${finalR.toString(16).padStart(2, "0")}${finalG.toString(16).padStart(2, "0")}${finalB.toString(16).padStart(2, "0")}`
          this.colorCache.set(imageUrl, hex)
          resolve(hex)
        } catch (error) {
          console.error("Error extracting color:", error)
          resolve("#1a1a1a")
        }
      }

      img.onerror = () => resolve("#1a1a1a")
      img.src = imageUrl
    })
  }

  static lightenColor(hex: string, percent: number): string {
    const num = Number.parseInt(hex.replace("#", ""), 16)
    const amt = Math.round(2.55 * percent)
    const R = (num >> 16) + amt
    const G = ((num >> 8) & 0x00ff) + amt
    const B = (num & 0x0000ff) + amt

    return (
      "#" +
      (
        0x1000000 +
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
      )
        .toString(16)
        .slice(1)
    )
  }

  static darkenColor(hex: string, percent: number): string {
    const num = Number.parseInt(hex.replace("#", ""), 16)
    const amt = Math.round(2.55 * percent)
    const R = (num >> 16) - amt
    const G = ((num >> 8) & 0x00ff) - amt
    const B = (num & 0x0000ff) - amt

    return (
      "#" +
      (
        0x1000000 +
        (R > 255 ? 255 : R < 0 ? 0 : R) * 0x10000 +
        (G > 255 ? 255 : G < 0 ? 0 : G) * 0x100 +
        (B > 255 ? 255 : B < 0 ? 0 : B)
      )
        .toString(16)
        .slice(1)
    )
  }

  // Create a complementary color for accents
  static getComplementaryColor(hex: string): string {
    const num = Number.parseInt(hex.replace("#", ""), 16)
    const R = 255 - (num >> 16)
    const G = 255 - ((num >> 8) & 0x00ff)
    const B = 255 - (num & 0x0000ff)

    return "#" + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)
  }

  // Get a muted version of the color for subtle effects
  static getMutedColor(hex: string, saturationFactor = 0.5): string {
    const num = Number.parseInt(hex.replace("#", ""), 16)
    const R = num >> 16
    const G = (num >> 8) & 0x00ff
    const B = num & 0x0000ff

    // Convert to HSL-like adjustment
    const avg = (R + G + B) / 3
    const newR = Math.floor(R + (avg - R) * (1 - saturationFactor))
    const newG = Math.floor(G + (avg - G) * (1 - saturationFactor))
    const newB = Math.floor(B + (avg - B) * (1 - saturationFactor))

    return "#" + (0x1000000 + newR * 0x10000 + newG * 0x100 + newB).toString(16).slice(1)
  }
}
