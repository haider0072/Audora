"use client"

import { useEffect, useRef, useState } from "react"

import { toast } from "@/hooks/use-toast"
import { readDroppedFiles } from "@/lib/dropped-files"
import { formatCount } from "@/lib/utils"

interface UseFileDropOptions {
  /** Everything dropped that the library can add, with folders read through. */
  onDrop: (files: File[]) => void
  /** While the library cannot take new songs, a drop is turned away with a message. */
  busy: boolean
}

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false
}

/**
 * Songs and folders dragged in from outside can be dropped anywhere in the
 * window. Returns whether such a drag is over the window now. The listeners
 * do nothing until a drag comes in.
 */
export function useFileDrop({ onDrop, busy }: UseFileDropOptions): boolean {
  const [dragging, setDragging] = useState(false)
  const latest = useRef({ onDrop, busy })
  useEffect(() => {
    latest.current = { onDrop, busy }
  }, [onDrop, busy])

  useEffect(() => {
    // dragenter and dragleave fire for every element the pointer crosses; the
    // drag has left the window once they balance out.
    let depth = 0
    // A drag that began on this page, an album cover say, is not an import.
    let fromPage = false

    const isImport = (event: DragEvent) => !fromPage && carriesFiles(event)

    const onDragStart = () => {
      fromPage = true
    }
    const onDragEnd = () => {
      fromPage = false
    }
    const onDragEnter = (event: DragEvent) => {
      if (!isImport(event)) return
      event.preventDefault()
      depth++
      setDragging(true)
    }
    const onDragOver = (event: DragEvent) => {
      if (!isImport(event)) return
      // Without this the browser opens the file itself, leaving the player.
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
    }
    const onDragLeave = (event: DragEvent) => {
      if (!isImport(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDropped = (event: DragEvent) => {
      if (!isImport(event) || !event.dataTransfer) {
        fromPage = false
        return
      }
      event.preventDefault()
      depth = 0
      setDragging(false)
      if (latest.current.busy) {
        toast({ title: "Your library is busy", description: "Drop again once it has finished loading or adding songs." })
        return
      }
      readDroppedFiles(event.dataTransfer)
        .then(({ files, unreadable }) => {
          if (unreadable > 0) {
            toast({ title: `Couldn't read ${formatCount(unreadable, "dropped item")}`, variant: "destructive" })
          }
          latest.current.onDrop(files)
        })
        .catch((error: unknown) => {
          console.error("Could not add the dropped files", error)
          toast({ title: "Couldn't add what was dropped", variant: "destructive" })
        })
    }

    window.addEventListener("dragstart", onDragStart)
    window.addEventListener("dragend", onDragEnd)
    window.addEventListener("dragenter", onDragEnter)
    window.addEventListener("dragover", onDragOver)
    window.addEventListener("dragleave", onDragLeave)
    window.addEventListener("drop", onDropped)
    return () => {
      window.removeEventListener("dragstart", onDragStart)
      window.removeEventListener("dragend", onDragEnd)
      window.removeEventListener("dragenter", onDragEnter)
      window.removeEventListener("dragover", onDragOver)
      window.removeEventListener("dragleave", onDragLeave)
      window.removeEventListener("drop", onDropped)
    }
  }, [])

  return dragging
}
