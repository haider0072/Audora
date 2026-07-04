"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Settings, RotateCcw, ChevronDown, Save, Trash2, Check } from "lucide-react"
import type { EqPreset } from "@/lib/eq-presets"

interface EqualizerBand {
  frequency: number
  gain: number
  label: string
}

interface RefinedEqualizerProps {
  bands: EqualizerBand[]
  onBandChange: (index: number, gain: number) => void
  onReset: () => void
  preampDb: number
  onPreampChange: (db: number) => void
  normalizationEnabled: boolean
  onNormalizationChange: (enabled: boolean) => void
  presets: EqPreset[]
  activePresetId?: string
  onPresetSelect: (preset: EqPreset) => void
  onPresetSave: (name: string) => void
  onPresetDelete: (id: string) => void
}

export function RefinedEqualizer({
  bands,
  onBandChange,
  onReset,
  preampDb,
  onPreampChange,
  normalizationEnabled,
  onNormalizationChange,
  presets,
  activePresetId,
  onPresetSelect,
  onPresetSave,
  onPresetDelete,
}: RefinedEqualizerProps) {
  // Per-band text buffers while an input is focused. A missing key means
  // "not editing" and the input falls back to showing the applied gain.
  const [manualInputs, setManualInputs] = useState<{ [key: number]: string }>({})
  const [isSavingPreset, setIsSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState("")

  const activePreset = presets.find((p) => p.id === activePresetId)

  const commitManualInput = (index: number) => {
    const raw = manualInputs[index]
    // Clear the buffer by deleting the key so the input falls back to the
    // applied value. (Setting "" here caused the old Enter-reset bug: the
    // follow-up blur parsed the empty buffer as 0 and reset the band.)
    setManualInputs((prev) => {
      const next = { ...prev }
      delete next[index]
      return next
    })
    if (raw == null || raw.trim() === "") return
    const value = Number.parseFloat(raw)
    if (Number.isNaN(value)) return
    onBandChange(index, Math.max(-12, Math.min(12, value)))
  }

  const savePreset = () => {
    const name = presetName.trim()
    if (!name) return
    onPresetSave(name)
    setPresetName("")
    setIsSavingPreset(false)
  }

  return (
    <Card className="bg-transparent border-none shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Equalizer
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="min-w-[130px] justify-between">
                  <span className="truncate">{activePreset?.name ?? "Custom"}</span>
                  <ChevronDown className="w-3.5 h-3.5 ml-1 flex-shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                <DropdownMenuLabel>Presets</DropdownMenuLabel>
                {presets.filter((p) => p.builtIn).map((preset) => (
                  <DropdownMenuItem key={preset.id} onClick={() => onPresetSelect(preset)}>
                    {preset.id === activePresetId && <Check className="w-3.5 h-3.5 mr-2" />}
                    <span className={preset.id === activePresetId ? "" : "ml-[22px]"}>{preset.name}</span>
                  </DropdownMenuItem>
                ))}
                {presets.some((p) => !p.builtIn) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>My Presets</DropdownMenuLabel>
                    {presets.filter((p) => !p.builtIn).map((preset) => (
                      <DropdownMenuItem
                        key={preset.id}
                        onClick={() => onPresetSelect(preset)}
                        className="group"
                      >
                        {preset.id === activePresetId && <Check className="w-3.5 h-3.5 mr-2" />}
                        <span className={`flex-1 ${preset.id === activePresetId ? "" : "ml-[22px]"}`}>
                          {preset.name}
                        </span>
                        <button
                          type="button"
                          aria-label={`Delete preset ${preset.name}`}
                          className="ml-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation()
                            onPresetDelete(preset.id)
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSavingPreset((v) => !v)}
              aria-label="Save current settings as preset"
            >
              <Save className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={onReset}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>
          </div>
        </CardTitle>
        {isSavingPreset && (
          <div className="flex items-center gap-2 pt-2">
            <Input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") savePreset()
                if (e.key === "Escape") setIsSavingPreset(false)
              }}
              placeholder="Preset name"
              className="h-8 text-sm"
              autoFocus
            />
            <Button size="sm" className="h-8" onClick={savePreset} disabled={!presetName.trim()}>
              Save
            </Button>
          </div>
        )}
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
                  aria-label={`${band.label} gain`}
                />
              </div>

              <div className="text-xs text-center space-y-1">
                <div className="font-mono">
                  {band.gain > 0 ? "+" : ""}
                  {band.gain.toFixed(1)}dB
                </div>

                <Input
                  type="text"
                  inputMode="decimal"
                  value={manualInputs[index] ?? band.gain.toFixed(1)}
                  onFocus={(e) => {
                    setManualInputs((prev) => ({ ...prev, [index]: band.gain.toFixed(1) }))
                    e.target.select()
                  }}
                  onChange={(e) => {
                    const raw = e.target.value
                    setManualInputs((prev) => ({ ...prev, [index]: raw }))
                  }}
                  onKeyDown={(e) => {
                    // Blur is the single commit path — Enter just triggers it.
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                  }}
                  onBlur={() => commitManualInput(index)}
                  className="h-6 text-xs text-center w-16"
                  aria-label={`${band.label} gain in dB`}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          {/* Preamp */}
          <div className="flex items-center gap-3">
            <Label className="text-xs font-medium w-20 flex-shrink-0">Preamp</Label>
            <Slider
              value={[preampDb]}
              min={-12}
              max={12}
              step={0.5}
              onValueChange={(value) => onPreampChange(value[0])}
              className="flex-1"
              aria-label="Preamp gain"
            />
            <span className="text-xs font-mono w-16 text-right flex-shrink-0">
              {preampDb > 0 ? "+" : ""}
              {preampDb.toFixed(1)}dB
            </span>
          </div>

          {/* Normalization */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="normalization-switch" className="text-xs font-medium">
                Loudness normalization
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Evens out volume between tracks (-14 LUFS). Off = untouched original dynamics.
              </p>
            </div>
            <Switch
              id="normalization-switch"
              checked={normalizationEnabled}
              onCheckedChange={onNormalizationChange}
            />
          </div>

          <p className="text-[11px] text-muted-foreground text-center">
            Boosts are automatically headroom-compensated — no clipping, no limiter in the signal path.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export type { EqualizerBand }
