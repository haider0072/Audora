"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Upload, Settings, Music } from "lucide-react"

interface AudioMetadata {
  title?: string
  artist?: string
  album?: string
  year?: string
  genre?: string
  bitrate?: number
  sampleRate?: number
  duration?: number
  isHiRes?: boolean
  albumArt?: string
}

interface EqualizerBand {
  frequency: number
  gain: number
  label: string
}

export default function Component() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState([80])
  const [isMuted, setIsMuted] = useState(false)
  const [metadata, setMetadata] = useState<AudioMetadata>({})
  const [showEqualizer, setShowEqualizer] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  const [equalizerBands, setEqualizerBands] = useState<EqualizerBand[]>([
    { frequency: 60, gain: 0, label: "60Hz" },
    { frequency: 170, gain: 0, label: "170Hz" },
    { frequency: 310, gain: 0, label: "310Hz" },
    { frequency: 600, gain: 0, label: "600Hz" },
    { frequency: 1000, gain: 0, label: "1kHz" },
    { frequency: 3000, gain: 0, label: "3kHz" },
    { frequency: 6000, gain: 0, label: "6kHz" },
    { frequency: 12000, gain: 0, label: "12kHz" },
    { frequency: 14000, gain: 0, label: "14kHz" },
    { frequency: 16000, gain: 0, label: "16kHz" },
  ])

  const [filterNodes, setFilterNodes] = useState<BiquadFilterNode[]>([])

  const initializeAudioContext = useCallback(() => {
    if (!audioContextRef.current && audioRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioRef.current)
      gainNodeRef.current = audioContextRef.current.createGain()
      analyserRef.current = audioContextRef.current.createAnalyser()

      // Create filter nodes for equalizer
      const filters = equalizerBands.map((band, index) => {
        const filter = audioContextRef.current!.createBiquadFilter()
        if (index === 0) {
          filter.type = "lowshelf"
        } else if (index === equalizerBands.length - 1) {
          filter.type = "highshelf"
        } else {
          filter.type = "peaking"
          filter.Q.value = 1
        }
        filter.frequency.value = band.frequency
        filter.gain.value = band.gain
        return filter
      })

      setFilterNodes(filters)

      // Connect audio nodes
      let currentNode = sourceNodeRef.current
      filters.forEach((filter) => {
        currentNode.connect(filter)
        currentNode = filter
      })

      currentNode.connect(gainNodeRef.current!)
      gainNodeRef.current!.connect(analyserRef.current!)
      analyserRef.current!.connect(audioContextRef.current.destination)
    }
  }, [equalizerBands])

  const extractMetadata = async (file: File): Promise<AudioMetadata> => {
    return new Promise((resolve) => {
      const audio = new Audio()
      const url = URL.createObjectURL(file)
      audio.src = url

      audio.addEventListener("loadedmetadata", () => {
        const metadata: AudioMetadata = {
          title: file.name.replace(/\.[^/.]+$/, ""),
          duration: audio.duration,
          bitrate: 0, // FLAC bitrate calculation would need specialized library
          sampleRate: 0, // Would need Web Audio API context
        }

        // Check if it's likely hi-res based on file size and duration
        const fileSizeMB = file.size / (1024 * 1024)
        const estimatedBitrate = (fileSizeMB * 8 * 1024) / (audio.duration / 60) // kbps estimate

        metadata.bitrate = Math.round(estimatedBitrate)
        metadata.isHiRes =
          estimatedBitrate > 1000 ||
          file.name.toLowerCase().includes("24bit") ||
          file.name.toLowerCase().includes("96khz") ||
          file.name.toLowerCase().includes("192khz")

        // Try to extract more metadata (this would need a proper metadata library for full FLAC support)
        if (file.name.includes(" - ")) {
          const parts = file.name.split(" - ")
          if (parts.length >= 2) {
            metadata.artist = parts[0].trim()
            metadata.title = parts[1].replace(/\.[^/.]+$/, "").trim()
          }
        }

        URL.revokeObjectURL(url)
        resolve(metadata)
      })

      audio.addEventListener("error", () => {
        URL.revokeObjectURL(url)
        resolve({ title: file.name })
      })
    })
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && audioRef.current) {
      const url = URL.createObjectURL(file)
      audioRef.current.src = url

      const extractedMetadata = await extractMetadata(file)
      setMetadata(extractedMetadata)

      // Reset player state
      setCurrentTime(0)
      setIsPlaying(false)
    }
  }

  const togglePlayPause = async () => {
    if (!audioRef.current) return

    if (audioContextRef.current?.state === "suspended") {
      await audioContextRef.current.resume()
    }

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      initializeAudioContext()
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)

      // Update sample rate if audio context is available
      if (audioContextRef.current) {
        setMetadata((prev) => ({
          ...prev,
          sampleRate: audioContextRef.current!.sampleRate,
        }))
      }
    }
  }

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0]
      setCurrentTime(value[0])
    }
  }

  const handleVolumeChange = (value: number[]) => {
    setVolume(value)
    if (audioRef.current) {
      audioRef.current.volume = value[0] / 100
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = value[0] / 100
    }
  }

  const toggleMute = () => {
    setIsMuted(!isMuted)
    if (audioRef.current) {
      audioRef.current.muted = !isMuted
    }
  }

  const updateEqualizerBand = (index: number, gain: number) => {
    const newBands = [...equalizerBands]
    newBands[index].gain = gain
    setEqualizerBands(newBands)

    if (filterNodes[index]) {
      filterNodes[index].gain.value = gain
    }
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  const formatBitrate = (bitrate?: number) => {
    if (!bitrate) return "Unknown"
    if (bitrate >= 1000) {
      return `${(bitrate / 1000).toFixed(1)}M`
    }
    return `${Math.round(bitrate)}k`
  }

  useEffect(() => {
    const audio = audioRef.current
    if (audio) {
      audio.addEventListener("timeupdate", handleTimeUpdate)
      audio.addEventListener("loadedmetadata", handleLoadedMetadata)
      audio.addEventListener("ended", () => setIsPlaying(false))

      return () => {
        audio.removeEventListener("timeupdate", handleTimeUpdate)
        audio.removeEventListener("loadedmetadata", handleLoadedMetadata)
        audio.removeEventListener("ended", () => setIsPlaying(false))
      }
    }
  }, [])

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="w-6 h-6" />
            FLAC Music Player
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* File Upload */}
          <div className="flex items-center justify-center">
            <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="gap-2">
              <Upload className="w-4 h-4" />
              Load FLAC File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".flac,audio/flac"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {/* Metadata Display */}
          {metadata.title && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
                  {metadata.albumArt ? (
                    <img
                      src={metadata.albumArt || "/placeholder.svg"}
                      alt="Album Art"
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <Music className="w-16 h-16 text-muted-foreground" />
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold">{metadata.title}</h2>
                  {metadata.artist && <p className="text-lg text-muted-foreground">{metadata.artist}</p>}
                  {metadata.album && <p className="text-muted-foreground">{metadata.album}</p>}
                </div>

                <div className="flex flex-wrap gap-2">
                  {metadata.isHiRes && (
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      Hi-Res Audio
                    </Badge>
                  )}
                  {metadata.bitrate && <Badge variant="outline">{formatBitrate(metadata.bitrate)}bps</Badge>}
                  {metadata.sampleRate && <Badge variant="outline">{(metadata.sampleRate / 1000).toFixed(1)}kHz</Badge>}
                </div>

                <div className="text-sm text-muted-foreground space-y-1">
                  {metadata.year && <p>Year: {metadata.year}</p>}
                  {metadata.genre && <p>Genre: {metadata.genre}</p>}
                  {metadata.duration && <p>Duration: {formatTime(metadata.duration)}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Audio Element */}
          <audio ref={audioRef} preload="metadata" />

          {/* Progress Bar */}
          {duration > 0 && (
            <div className="space-y-2">
              <Slider value={[currentTime]} max={duration} step={1} onValueChange={handleSeek} className="w-full" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="icon">
              <SkipBack className="w-4 h-4" />
            </Button>

            <Button onClick={togglePlayPause} size="icon" className="w-12 h-12">
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
            </Button>

            <Button variant="outline" size="icon">
              <SkipForward className="w-4 h-4" />
            </Button>

            <Separator orientation="vertical" className="h-8" />

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={toggleMute}>
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </Button>
              <Slider value={volume} max={100} step={1} onValueChange={handleVolumeChange} className="w-24" />
            </div>

            <Separator orientation="vertical" className="h-8" />

            <Button
              variant={showEqualizer ? "default" : "outline"}
              size="icon"
              onClick={() => setShowEqualizer(!showEqualizer)}
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>

          {/* Equalizer */}
          {showEqualizer && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">10-Band Equalizer</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 md:grid-cols-10 gap-4">
                  {equalizerBands.map((band, index) => (
                    <div key={band.frequency} className="flex flex-col items-center space-y-2">
                      <div className="text-xs font-medium">{band.label}</div>
                      <div className="h-32 flex items-end">
                        <Slider
                          orientation="vertical"
                          value={[band.gain]}
                          min={-12}
                          max={12}
                          step={0.5}
                          onValueChange={(value) => updateEqualizerBand(index, value[0])}
                          className="h-full"
                        />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {band.gain > 0 ? "+" : ""}
                        {band.gain.toFixed(1)}dB
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const resetBands = equalizerBands.map((band) => ({ ...band, gain: 0 }))
                      setEqualizerBands(resetBands)
                      filterNodes.forEach((filter) => {
                        filter.gain.value = 0
                      })
                    }}
                  >
                    Reset EQ
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
