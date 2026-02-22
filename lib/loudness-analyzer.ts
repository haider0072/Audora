/**
 * LUFS-based loudness analyzer using ITU-R BS.1770 simplified algorithm.
 * Analyzes audio files via OfflineAudioContext and returns integrated loudness
 * plus a gain correction value targeting -14 LUFS (Spotify standard).
 */

const TARGET_LUFS = -14
const MAX_GAIN_DB = 12
const MIN_GAIN_DB = -12

export interface LoudnessResult {
  lufs: number
  gainCorrection: number // dB to apply for normalization
}

export class LoudnessAnalyzer {
  /**
   * Analyze a File's loudness using OfflineAudioContext.
   * Returns LUFS measurement and gain correction clamped to [-12, +12] dB.
   */
  static async analyze(file: File): Promise<LoudnessResult> {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const audioContext = new OfflineAudioContext(1, 1, 44100)
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

      const { sampleRate, numberOfChannels, length } = audioBuffer
      const durationSeconds = length / sampleRate

      // Skip very short files (< 0.5s) — unreliable measurement
      if (durationSeconds < 0.5) {
        return { lufs: TARGET_LUFS, gainCorrection: 0 }
      }

      // ITU-R BS.1770 simplified: compute mean square over all channels
      let sumSquares = 0
      let totalSamples = 0

      for (let ch = 0; ch < numberOfChannels; ch++) {
        const channelData = audioBuffer.getChannelData(ch)
        for (let i = 0; i < channelData.length; i++) {
          sumSquares += channelData[i] * channelData[i]
        }
        totalSamples += channelData.length
      }

      const meanSquare = sumSquares / totalSamples

      // Avoid log(0)
      if (meanSquare < 1e-10) {
        return { lufs: -70, gainCorrection: MAX_GAIN_DB }
      }

      // LUFS ≈ -0.691 + 10 * log10(mean_square)
      const lufs = -0.691 + 10 * Math.log10(meanSquare)

      // Gain correction: how many dB to reach target
      const rawCorrection = TARGET_LUFS - lufs
      const gainCorrection = Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, rawCorrection))

      return { lufs: Math.round(lufs * 10) / 10, gainCorrection: Math.round(gainCorrection * 10) / 10 }
    } catch (error) {
      console.error("Loudness analysis failed:", error)
      return { lufs: TARGET_LUFS, gainCorrection: 0 }
    }
  }
}
