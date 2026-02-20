"use client"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Settings, RotateCcw, Volume2, VolumeX } from "lucide-react"

interface EqualizerBand {
  frequency: number
  gain: number
  label: string
}

interface MobileEqualizerSheetProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  bands: EqualizerBand[]
  onBandChange: (index: number, gain: number) => void
  onReset: () => void
  volume: number[]
  onVolumeChange: (value: number[]) => void
  isMuted: boolean
  onToggleMute: () => void
  crossfadeDuration?: number
  onCrossfadeDurationChange?: (value: number) => void
}

export function MobileEqualizerSheet({
  isOpen,
  onOpenChange,
  bands,
  onBandChange,
  onReset,
  volume,
  onVolumeChange,
  isMuted,
  onToggleMute,
  crossfadeDuration = 0,
  onCrossfadeDurationChange,
}: MobileEqualizerSheetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Audio Settings
          </SheetTitle>
          <SheetDescription>Adjust equalizer bands and volume settings</SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          {/* Volume Control */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Volume</Label>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={onToggleMute} className="h-8 w-8 flex-shrink-0">
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </Button>
              <Slider value={volume} max={100} step={1} onValueChange={onVolumeChange} className="flex-1" />
              <span className="text-sm text-muted-foreground w-10 text-right">{volume[0]}%</span>
            </div>
          </div>

          {/* Equalizer */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">10-Band Equalizer</Label>
              <Button variant="outline" size="sm" onClick={onReset}>
                <RotateCcw className="w-3 h-3 mr-2" />
                Reset
              </Button>
            </div>

            {/* Mobile-optimized equalizer grid */}
            <div className="grid grid-cols-5 gap-3">
              {bands.map((band, index) => (
                <div key={band.frequency} className="flex flex-col items-center space-y-2">
                  <Label className="text-xs font-medium text-center leading-tight">{band.label}</Label>

                  <div className="h-32 flex items-end">
                    <Slider
                      orientation="vertical"
                      value={[band.gain]}
                      min={-12}
                      max={12}
                      step={0.1}
                      onValueChange={(value) => onBandChange(index, value[0])}
                      className="h-full"
                    />
                  </div>

                  <div className="text-center space-y-1">
                    <div className="text-xs font-mono">
                      {band.gain > 0 ? "+" : ""}
                      {band.gain.toFixed(1)}dB
                    </div>
                    <Input
                      type="number"
                      min="-12"
                      max="12"
                      step="0.1"
                      value={band.gain.toFixed(1)}
                      onChange={(e) => {
                        const value = Number.parseFloat(e.target.value)
                        if (!isNaN(value) && value >= -12 && value <= 12) {
                          onBandChange(index, value)
                        }
                      }}
                      className="h-6 text-xs text-center w-12 p-1"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center">
              <p className="text-xs text-muted-foreground">Adjust frequency bands to customize your audio experience</p>
            </div>
          </div>

          {/* Crossfade Control */}
          {onCrossfadeDurationChange && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Crossfade</Label>
                <span className="text-sm text-muted-foreground">
                  {crossfadeDuration === 0 ? "Off" : `${crossfadeDuration}s`}
                </span>
              </div>
              <Slider
                value={[crossfadeDuration]}
                min={0}
                max={5}
                step={0.5}
                onValueChange={(v) => onCrossfadeDurationChange(v[0])}
                aria-label="Crossfade duration"
              />
              <p className="text-xs text-muted-foreground">
                {crossfadeDuration === 0 ? "Gapless playback (no overlap)" : "Songs overlap and fade during transitions"}
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
