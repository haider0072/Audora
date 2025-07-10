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

interface EqualizerProps {
  bands: EqualizerBand[]
  onBandChange: (index: number, gain: number) => void
  onReset: () => void
}

export function Equalizer({ bands, onBandChange, onReset }: EqualizerProps) {
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
    <Card>
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
        <div className="grid grid-cols-5 md:grid-cols-10 gap-4">
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

              <div className="text-xs text-center">
                <div className="font-mono mb-1">
                  {band.gain > 0 ? "+" : ""}
                  {band.gain.toFixed(1)}dB
                </div>

                <div className="flex flex-col gap-1">
                  <Input
                    type="number"
                    min="-12"
                    max="12"
                    step="0.1"
                    value={manualInputs[index] || ""}
                    onChange={(e) => handleManualInput(index, e.target.value)}
                    onKeyPress={(e) => handleKeyPress(e, index)}
                    onBlur={() => applyManualInput(index)}
                    className="h-6 text-xs text-center"
                    placeholder={band.gain.toFixed(1)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 text-center">
          <p className="text-xs text-muted-foreground">
            Tip: Enter values manually in the input fields or use the sliders. Press Enter or click away to apply.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export type { EqualizerBand }
