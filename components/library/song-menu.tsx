"use client"

import type { ComponentType, ReactNode } from "react"
import { Disc3, ListEnd, ListMinus, ListPlus, Trash2, User } from "lucide-react"

import type { Song } from "@/lib/song"
import { isCloudOnlySong } from "@/lib/cloud/merge"

/**
 * What the song menu can do with a song. A page leaves out going to itself,
 * and the queue offers taking a song off it rather than out of the library.
 */
export interface SongActions {
  playNext: (song: Song) => void
  addToQueue: (song: Song) => void
  /** Take the song off the queue. */
  dequeue?: (song: Song) => void
  goToArtist?: (song: Song) => void
  goToAlbum?: (song: Song) => void
  /** Remove the song from the library, and this device. */
  remove?: (song: Song) => void
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
  const { dequeue, goToArtist, goToAlbum, remove } = actions
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
      {dequeue && (
        <Item onSelect={() => dequeue(song)}>
          <ListMinus />
          Remove from queue
        </Item>
      )}
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
      {remove && !isCloudOnlySong(song) && (
        <>
          <Separator />
          <Item onSelect={() => remove(song)} className="text-destructive focus:text-destructive">
            <Trash2 />
            Remove
          </Item>
        </>
      )}
    </>
  )
}
