"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"

import { ChoiceGroup, type Choice } from "@/components/choice-group"
import { LedSwitch } from "@/components/led-switch"
import { CenterFader } from "@/components/sound/center-fader"
import { describeHeadroom, formatDb, formatFrequency, parseDb } from "@/lib/eq-format"
import { clampGain, EQ_GAIN_LIMIT, type EqPreset, type EqualizerBand } from "@/lib/eq-presets"

export interface SoundPanelProps {
  bands: EqualizerBand[]
  onBandChange: (index: number, gain: number) => void
  onReset: () => void
  preampDb: number
  onPreampChange: (db: number) => void
  normalizationEnabled: boolean
  onNormalizationChange: (enabled: boolean) => void
  presets: EqPreset[]
  /** The preset the bands are at; none once a band has been moved off it. */
  activePresetId?: string
  onPresetSelect: (preset: EqPreset) => void
  onPresetSave: (name: string) => void
  onPresetDelete: (id: string) => void
}

/** A band's gain as mono text that can be typed over, kept while it is being typed and set on Return or on leaving it. */
function GainInput({ band, onCommit }: { band: EqualizerBand; onCommit: (gain: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = formatDb(band.gain)
  return (
    <input
      className="sound-band-value type-data"
      inputMode="decimal"
      aria-label={`${formatFrequency(band.frequency)} Hz gain in dB`}
      data-flat={shown === formatDb(0) || undefined}
      value={draft ?? shown}
      onFocus={(event) => {
        setDraft(shown)
        event.target.select()
      }}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        // Leaving the field is the one way a gain is set; Return leaves it.
        if (event.key === "Enter") event.currentTarget.blur()
      }}
      onBlur={() => {
        const gain = draft === null ? null : parseDb(draft)
        setDraft(null)
        if (gain !== null) onCommit(clampGain(gain))
      }}
    />
  )
}

/** Naming the bands as they stand, to keep them as a preset of one's own. */
function SavePresetForm({ onSave, onCancel }: { onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("")
  const trimmed = name.trim()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (trimmed) onSave(trimmed)
  }
  return (
    <form className="sound-save" onSubmit={submit}>
      <div className="soft-field soft-field-compact">
        <input
          // The form opens on asking for it, so the name is what to type next.
          autoFocus
          value={name}
          placeholder="Name this preset"
          aria-label="Preset name"
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <button type="submit" className="solid-button" aria-disabled={!trimmed || undefined}>
        Save
      </button>
      <button type="button" className="text-button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  )
}

/**
 * The Sound sheet's body: the equalizer, as LED presets over a bank of ten
 * hairline faders and the preamp; loudness normalization; and a line on the
 * headroom the engine takes so none of it clips. Styled by `.sound-*` and
 * the surfaces' sections.
 */
export function SoundPanel({
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
}: SoundPanelProps) {
  const ids = useId()
  const [saving, setSaving] = useState(false)
  const saveRef = useRef<HTMLButtonElement>(null)
  // The form closed: focus goes back to the way to save, once it is drawn again.
  const formClosed = useRef(false)
  const activePreset = presets.find((preset) => preset.id === activePresetId)
  const ownActive = activePreset && !activePreset.builtIn ? activePreset : undefined
  const choices: Choice<string>[] = presets.map((preset) => ({ value: preset.id, label: preset.name }))

  useEffect(() => {
    if (saving || !formClosed.current) return
    formClosed.current = false
    saveRef.current?.focus()
  }, [saving])

  const closeSave = () => {
    formClosed.current = true
    setSaving(false)
  }

  return (
    <div className="surface-body">
      <section className="surface-section" aria-labelledby={`${ids}-eq`}>
        <div className="surface-row">
          <h3 id={`${ids}-eq`} className="surface-heading">
            Equalizer
          </h3>
          <span className="surface-meta type-data">{activePreset?.name ?? "Custom"}</span>
        </div>
        <ChoiceGroup
          label="Preset"
          choices={choices}
          value={activePresetId}
          onChange={(id) => {
            const preset = presets.find((candidate) => candidate.id === id)
            if (preset) onPresetSelect(preset)
          }}
          className="sound-presets"
          choiceClassName="led-choice"
        />
        {saving ? (
          <SavePresetForm
            onSave={(name) => {
              onPresetSave(name)
              closeSave()
            }}
            onCancel={closeSave}
          />
        ) : (
          <div className="surface-actions">
            <button ref={saveRef} type="button" className="text-button" onClick={() => setSaving(true)}>
              Save as preset
            </button>
            {ownActive && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  onPresetDelete(ownActive.id)
                  // This button goes with the preset; the way to save is still here.
                  saveRef.current?.focus()
                }}
              >
                Delete “{ownActive.name}”
              </button>
            )}
            <button type="button" className="text-button sound-reset" onClick={onReset}>
              Reset
            </button>
          </div>
        )}
        <div className="sound-bank" role="group" aria-label="Bands">
          {bands.map((band, index) => (
            <div key={band.frequency} className="sound-band">
              <GainInput band={band} onCommit={(gain) => onBandChange(index, gain)} />
              <CenterFader
                className="sound-band-fader"
                orientation="vertical"
                value={band.gain}
                limit={EQ_GAIN_LIMIT}
                step={0.1}
                onChange={(gain) => onBandChange(index, gain)}
                label={`${formatFrequency(band.frequency)} Hz`}
                valueText={`${formatDb(band.gain)} dB`}
              />
              <span className="sound-band-label type-data" aria-hidden="true">
                {formatFrequency(band.frequency)}
              </span>
            </div>
          ))}
        </div>
        <div className="sound-preamp">
          <span className="surface-heading" aria-hidden="true">
            Preamp
          </span>
          <CenterFader
            orientation="horizontal"
            value={preampDb}
            limit={EQ_GAIN_LIMIT}
            step={0.5}
            onChange={onPreampChange}
            label="Preamp"
            valueText={`${formatDb(preampDb)} dB`}
          />
          <span className="sound-preamp-value type-data" aria-hidden="true">
            {formatDb(preampDb)} dB
          </span>
        </div>
      </section>

      <section className="surface-section" aria-labelledby={`${ids}-norm`}>
        <div className="surface-row">
          <h3 id={`${ids}-norm`} className="surface-heading">
            Loudness normalization
          </h3>
          <LedSwitch
            checked={normalizationEnabled}
            onCheckedChange={onNormalizationChange}
            labelledBy={`${ids}-norm`}
            describedBy={`${ids}-norm-hint`}
          />
        </div>
        <p id={`${ids}-norm-hint`} className="surface-hint">
          Evens out songs mastered louder or softer, to −14 LUFS. Off plays every file exactly as it was mastered.
        </p>
      </section>

      <p className="surface-status type-data">
        {describeHeadroom(
          bands.map((band) => band.gain),
          preampDb,
          normalizationEnabled,
        )}
      </p>
    </div>
  )
}
