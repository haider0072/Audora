"use client"

import { useState, useEffect } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { InsightsService } from "@/lib/insights-service"
import { Loader2, Sparkles, X, RefreshCw, BookOpen, Brain, Lightbulb, AlertCircle } from "lucide-react"
import type { Song } from "@/components/enhanced-playlist"

interface MobileSongInsightsProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  currentSong: Song | null
}

interface InsightSection {
  title: string
  content: string
  icon: "story" | "meaning" | "trivia"
}

function parseInsightSections(markdown: string): InsightSection[] {
  const sections: InsightSection[] = []
  const parts = markdown.split(/^## /m).filter(Boolean)

  for (const part of parts) {
    const newlineIndex = part.indexOf("\n")
    if (newlineIndex === -1) continue

    const title = part.slice(0, newlineIndex).trim()
    const content = part.slice(newlineIndex + 1).trim()
    if (!content) continue

    let icon: InsightSection["icon"] = "story"
    const titleLower = title.toLowerCase()
    if (titleLower.includes("meaning") || titleLower.includes("theme")) {
      icon = "meaning"
    } else if (titleLower.includes("know") || titleLower.includes("trivia") || titleLower.includes("fact")) {
      icon = "trivia"
    }

    sections.push({ title, content, icon })
  }

  return sections
}

function SectionIcon({ type }: { type: InsightSection["icon"] }) {
  switch (type) {
    case "story":
      return <BookOpen className="w-4 h-4 text-primary flex-shrink-0" />
    case "meaning":
      return <Brain className="w-4 h-4 text-primary flex-shrink-0" />
    case "trivia":
      return <Lightbulb className="w-4 h-4 text-primary flex-shrink-0" />
  }
}

export function MobileSongInsights({ isOpen, onOpenChange, currentSong }: MobileSongInsightsProps) {
  const [insightsContent, setInsightsContent] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [lastFetchedSongId, setLastFetchedSongId] = useState<string | null>(null)
  const [model, setModel] = useState<string | null>(null)

  const fetchInsights = async (song: Song) => {
    if (!song.artist || !song.title) {
      setError("Not enough song information to generate insights.")
      return
    }

    setIsLoading(true)
    setError(null)
    setInsightsContent(null)
    setNotConfigured(false)
    setLastFetchedSongId(song.id)

    try {
      const result = await InsightsService.getInsights(
        song.title,
        song.artist,
        song.album,
        song.year,
        song.genre,
      )

      if (!result.available) {
        setNotConfigured(true)
        setError(result.error || "AI insights not configured.")
        return
      }

      if (result.content) {
        setInsightsContent(result.content)
        setModel(result.model || null)
      } else {
        setError(result.error || "No insights generated.")
      }
    } catch (e: any) {
      setError(e.message || "An error occurred while fetching insights.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (currentSong && isOpen && currentSong.id !== lastFetchedSongId) {
      fetchInsights(currentSong)
    }
  }, [currentSong, isOpen, lastFetchedSongId])

  const handleRetry = () => {
    if (currentSong) {
      setLastFetchedSongId(null)
      fetchInsights(currentSong)
    }
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <Loader2 className="w-10 h-10 animate-spin mb-4" />
          <p>Generating insights...</p>
          <p className="text-sm mt-2">This may take a few seconds</p>
        </div>
      )
    }

    if (notConfigured) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <AlertCircle className="w-10 h-10 mb-4" />
          <p className="text-lg font-semibold text-center">AI Insights Not Configured</p>
          <p className="text-sm text-center mt-2">
            Add your OpenRouter API key to <code className="bg-muted px-1.5 py-0.5 rounded text-xs">.env.local</code>
          </p>
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-destructive">
          <X className="w-10 h-10 mb-4" />
          <p className="text-lg font-semibold text-center">{error}</p>
          <Button onClick={handleRetry} variant="outline" className="mt-4 bg-transparent">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>
      )
    }

    if (insightsContent) {
      const sections = parseInsightSections(insightsContent)

      if (sections.length === 0) {
        return (
          <div className="whitespace-pre-wrap text-md leading-relaxed">{insightsContent}</div>
        )
      }

      return (
        <div className="space-y-5">
          {sections.map((section, index) => (
            <div key={index} className="space-y-2">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <SectionIcon type={section.icon} />
                {section.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed pl-6">
                {section.content}
              </p>
            </div>
          ))}
          {model && (
            <div className="flex justify-center pt-3">
              <Badge variant="secondary" className="text-xs">
                AI Generated · {model}
              </Badge>
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Sparkles className="w-10 h-10 mb-4" />
        <p>Select a song to see insights.</p>
      </div>
    )
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Song Insights
          </SheetTitle>
          <SheetDescription>
            {currentSong ? `${currentSong.title} - ${currentSong.artist}` : "No song selected"}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4">{renderContent()}</div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  )
}
