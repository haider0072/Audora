"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Settings, RotateCcw, Volume2, VolumeX, ChevronDown, Save, Trash2, Check } from "lucide-react"
import type { EqPreset } from "@/lib/eq-presets"

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
  preampDb,
  onPreampChange,
  normalizationEnabled,
  onNormalizationChange,
  presets,
  activePresetId,
  onPresetSelect,
  onPresetSave,
  onPresetDelete,
}: MobileEqualizerSheetProps) {
  // Per-band text buffers while an input is focused; a missing key means
  // "not editing" and the input shows the applied gain instead.
  const [manualInputs, setManualInputs] = useState<{ [key: number]: string }>({})
  const [isSavingPreset, setIsSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState("")

  const activePreset = presets.find((p) => p.id === activePresetId)

  const commitManualInput = (index: number) => {
    const raw = manualInputs[index]
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
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
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
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium flex-shrink-0">Equalizer</Label>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="max-w-[130px] justify-between">
                      <span className="truncate">{activePreset?.name ?? "Custom"}</span>
                      <ChevronDown className="w-3 h-3 ml-1 flex-shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
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
                          <DropdownMenuItem key={preset.id} onClick={() => onPresetSelect(preset)}>
                            {preset.id === activePresetId && <Check className="w-3.5 h-3.5 mr-2" />}
                            <span className={`flex-1 ${preset.id === activePresetId ? "" : "ml-[22px]"}`}>
                              {preset.name}
                            </span>
                            <button
                              type="button"
                              aria-label={`Delete preset ${preset.name}`}
                              className="ml-2 text-muted-foreground hover:text-destructive"
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
                  <Save className="w-3.5 h-3.5" />
                </Button>
                <Button variant="outline" size="sm" onClick={onReset} aria-label="Reset equalizer">
                  <RotateCcw className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {isSavingPreset && (
              <div className="flex items-center gap-2">
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
                      aria-label={`${band.label} gain`}
                    />
                  </div>

                  <div className="text-center space-y-1">
                    <div className="text-xs font-mono">
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
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                      }}
                      onBlur={() => commitManualInput(index)}
                      className="h-6 text-xs text-center w-12 p-1"
                      aria-label={`${band.label} gain in dB`}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Preamp */}
            <div className="flex items-center gap-3">
              <Label className="text-xs font-medium w-16 flex-shrink-0">Preamp</Label>
              <Slider
                value={[preampDb]}
                min={-12}
                max={12}
                step={0.5}
                onValueChange={(value) => onPreampChange(value[0])}
                className="flex-1"
                aria-label="Preamp gain"
              />
              <span className="text-xs font-mono w-14 text-right flex-shrink-0">
                {preampDb > 0 ? "+" : ""}
                {preampDb.toFixed(1)}dB
              </span>
            </div>

            {/* Normalization */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="mobile-normalization-switch" className="text-xs font-medium">
                  Loudness normalization
                </Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Evens out volume between tracks. Off = untouched original dynamics.
                </p>
              </div>
              <Switch
                id="mobile-normalization-switch"
                checked={normalizationEnabled}
                onCheckedChange={onNormalizationChange}
              />
            </div>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  )
}
