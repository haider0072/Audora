"use client"

import type { ReactNode } from "react"

import { ChoiceGroup, type Choice } from "@/components/choice-group"
import type { SearchType } from "@/hooks/use-tidal-search"
import type { SearchSource } from "@/lib/tidal-service"
import type { TidalSearchResult } from "@/lib/tidal-types"
import { resultCounts, TYPE_LABELS } from "./search-results"

const SOURCES: readonly Choice<SearchSource>[] = [
  { value: "auto", label: "Both" },
  { value: "qobuz", label: "Qobuz" },
  { value: "amazon", label: "Amazon" },
]

const TYPES: readonly SearchType[] = ["all", "track", "album", "artist"]

interface OnlineFiltersProps {
  type: SearchType
  onTypeChange: (type: SearchType) => void
  source: SearchSource
  onSourceChange: (source: SearchSource) => void
  /** The search shown, whose counts the choices carry. */
  results: TidalSearchResult | null
  /** Ends the row: the way to paste a link. */
  children?: ReactNode
}

/**
 * What to show of a search, in words with their counts, and where it
 * looks, in words lit by an LED, the way the stage's views are.
 */
export function OnlineFilters({ type, onTypeChange, source, onSourceChange, results, children }: OnlineFiltersProps) {
  const counts = results ? resultCounts(results) : {}
  const types = TYPES.map((value) => {
    const count = value === "all" ? undefined : counts[value]
    return {
      value,
      label: (
        <>
          {TYPE_LABELS[value]}
          {/* Heard as "Songs 10"; the flex row lays out no space of its own. */}
          {count !== undefined && <> <span className="online-type-count">{count}</span></>}
        </>
      ),
    }
  })

  return (
    <div className="online-filters">
      <ChoiceGroup
        label="Show"
        choices={types}
        value={type}
        onChange={onTypeChange}
        className="online-types"
        choiceClassName="online-type"
      />
      <div className="online-filters-end">
        <ChoiceGroup
          label="Search in"
          choices={SOURCES}
          value={source}
          onChange={onSourceChange}
          className="online-sources"
          choiceClassName="led-choice online-source"
        />
        {children}
      </div>
    </div>
  )
}
