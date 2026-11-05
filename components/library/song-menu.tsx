"use client"

import type { ComponentType, ReactNode } from "react"
import { Disc3, ListEnd, ListPlus, Trash2, User } from "lucide-react"

import type { Song } from "@/lib/song"
import { isCloudOnlySong } from "@/lib/cloud/merge"

/** What the song menu can do with a song. A page leaves out going to itself. */
export interface SongActions {
  playNext: (song: Song) => void
  addToQueue: (song: Song) => void
  goToArtist?: (song: Song) => void
  goToAlbum?: (song: Song) => void
  remove: (song: Song) => void
}

interface MenuItemProps {
  onSelect?: (event: Event) => void
  className?: string
  children: ReactNode
}

interface SongMenuItemsProps {
  song: Song
  actions: SongActions
  /** The menu's own item and separator: the ⋯ dropdown's or the right-click menu's. */
  Item: ComponentType<MenuItemProps>
  Separator: ComponentType
}

/**
 * The song menu's items, for the ⋯ dropdown and the right-click menu alike.
 * A song only in the cloud library has nothing on this device to remove, so
 * it is not offered.
 */
export function SongMenuItems({ song, actions, Item, Separator }: SongMenuItemsProps) {
  const { goToArtist, goToAlbum } = actions
  return (
    <>
      <Item onSelect={() => actions.playNext(song)}>
        <ListPlus />
        Play next
      </Item>
      <Item onSelect={() => actions.addToQueue(song)}>
        <ListEnd />
        Add to queue
      </Item>
      {(goToArtist || goToAlbum) && <Separator />}
      {goToArtist && (
        <Item onSelect={() => goToArtist(song)}>
          <User />
          Go to artist
        </Item>
      )}
      {goToAlbum && (
        <Item onSelect={() => goToAlbum(song)}>
          <Disc3 />
          Go to album
        </Item>
      )}
      {!isCloudOnlySong(song) && (
        <>
          <Separator />
          <Item onSelect={() => actions.remove(song)} className="text-destructive focus:text-destructive">
            <Trash2 />
            Remove
          </Item>
        </>
      )}
    </>
  )
}
