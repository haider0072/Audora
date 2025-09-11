'use client'

import { Button } from '@/components/ui/button'
import { Music, Mic, Youtube } from 'lucide-react'
import { createLogger } from '@/lib/logger'

const logger = createLogger('ViewSwitcher')

export type ViewMode = 'player' | 'lyrics' | 'youtube'

interface ViewSwitcherProps {
  activeView: ViewMode
  onViewChange: (view: ViewMode) => void
  hasCurrentSong: boolean
}

export function ViewSwitcher({ activeView, onViewChange, hasCurrentSong }: ViewSwitcherProps) {
  const handleViewChange = (view: ViewMode) => {
    logger.debug('View changed', { from: activeView, to: view })
    onViewChange(view)
  }

  const views = [
    {
      id: 'player' as const,
      label: 'Player',
      icon: Music,
      disabled: false,
    },
    {
      id: 'lyrics' as const,
      label: 'Lyrics',
      icon: Mic,
      disabled: !hasCurrentSong,
    },
    {
      id: 'youtube' as const,
      label: 'Video',
      icon: Youtube,
      disabled: !hasCurrentSong,
    },
  ]

  return (
    <div className="flex gap-2 mb-4">
      {views.map((view) => (
        <Button
          key={view.id}
          variant={activeView === view.id ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleViewChange(view.id)}
          disabled={view.disabled}
          className="flex items-center gap-2"
          aria-pressed={activeView === view.id}
        >
          <view.icon className="w-4 h-4" />
          <span className="hidden sm:inline">{view.label}</span>
        </Button>
      ))}
    </div>
  )
}