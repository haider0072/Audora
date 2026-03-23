"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface SearchTypeTabsProps {
  value: string
  onChange: (value: "track" | "album" | "artist" | "all") => void
}

export function SearchTypeTabs({ value, onChange }: SearchTypeTabsProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as "track" | "album" | "artist" | "all")}>
      <TabsList className="w-full h-8">
        <TabsTrigger value="all" className="flex-1 text-xs px-2 h-6">
          All
        </TabsTrigger>
        <TabsTrigger value="track" className="flex-1 text-xs px-2 h-6">
          Tracks
        </TabsTrigger>
        <TabsTrigger value="album" className="flex-1 text-xs px-2 h-6">
          Albums
        </TabsTrigger>
        <TabsTrigger value="artist" className="flex-1 text-xs px-2 h-6">
          Artists
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
