"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Settings, RotateCcw } from "lucide-react"

interface EqualizerBand {
  frequency: number
  gain: number
  label: string
}

interface RefinedEqualizerProps {
  bands: EqualizerBand[]
  onBandChange: (index: number, gain: number) => void
  onReset: () => void
}

export function RefinedEqualizer({ bands, onBandChange, onReset }: RefinedEqualizerProps) {
  const [manualInputs, setManualInputs] = useState<{ [key: number]: string }>({})

  const handleManualInput = (index: number, value: string) => {
    setManualInputs((prev) => ({ ...prev, [index]: value }))
  }

  const applyManualInput = (index: number) => {
    const value = Number.parseFloat(manualInputs[index] || "0")
    if (!isNaN(value) && value >= -12 && value <= 12) {
      onBandChange(index, value)
      setManualInputs((prev) => ({ ...prev, [index]: "" }))
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      applyManualInput(index)
    }
  }

  return (
    <Card className="bg-transparent border-none shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            10-Band Equalizer
          </div>
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 lg:grid-cols-10 gap-3">
          {bands.map((band, index) => (
            <div key={band.frequency} className="flex flex-col items-center space-y-2">
              <Label className="text-xs font-medium text-center">{band.label}</Label>

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

              <div className="text-xs text-center space-y-1">
                <div className="font-mono">
                  {band.gain > 0 ? "+" : ""}
                  {band.gain.toFixed(1)}dB
                </div>

                <Input
                  type="number"
                  min="-12"
                  max="12"
                  step="0.1"
                  value={manualInputs[index] || ""}
                  onChange={(e) => handleManualInput(index, e.target.value)}
                  onKeyPress={(e) => handleKeyPress(e, index)}
                  onBlur={() => applyManualInput(index)}
                  className="h-6 text-xs text-center w-16"
                  placeholder={band.gain.toFixed(1)}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 text-center">
          <p className="text-xs text-muted-foreground">
            Professional 10-band equalizer with standard frequencies. Enter values manually or use sliders.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export type { EqualizerBand }
