import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { CloudUploadSection } from '@/components/cloud-upload-section'
import type { Song } from '@/lib/song'
import { cloudUploads, type UploadSnapshot } from '@/lib/cloud/upload-queue'
import { trackSyncKey } from '@/lib/sync/song-match'

const IDLE: UploadSnapshot = {
  active: false,
  total: 0,
  uploaded: 0,
  skipped: 0,
  failed: [],
  inProgress: [],
  bytesTotal: 0,
  bytesSent: 0,
  bytesPerSecond: 0,
}

let mockSnapshot: UploadSnapshot = IDLE

jest.mock('@/lib/cloud/upload-queue', () => ({
  cloudUploads: {
    subscribe: () => () => {},
    getSnapshot: () => mockSnapshot,
    add: jest.fn(() => 1),
    cancel: jest.fn(),
    retryFailed: jest.fn(),
    clear: jest.fn(),
  },
}))

const queue = cloudUploads as jest.Mocked<typeof cloudUploads>

function song(name: string, size: number, options: { local?: boolean; cloud?: boolean }): Song {
  return {
    id: name,
    url: '',
    fileName: name,
    fileSize: size,
    file: options.local ? new File([new Uint8Array(size)], name) : undefined,
    cloud: options.cloud ? { key: `library/${name}`, streamUrl: 'https://r2.test/x' } : undefined,
  } as Song
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSnapshot = IDLE
})

describe('CloudUploadSection', () => {
  it('offers to sync only the songs the cloud lacks, and tells the queue which ones it holds', () => {
    const onlyHere = song('only-here.flac', 1000, { local: true })
    const both = song('both.flac', 2000, { local: true, cloud: true })
    const onlyCloud = song('only-cloud.flac', 3000, { cloud: true })
    render(<CloudUploadSection songs={[onlyHere, both, onlyCloud]} />)

    expect(screen.getByText(/1 song on this device isn't in your cloud yet \(1000 B\)/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))

    const [files, isInCloud] = queue.add.mock.calls[0]
    expect([...files]).toEqual([onlyHere.file])
    expect(isInCloud?.(trackSyncKey(both)!)).toBe(true)
    expect(isInCloud?.(trackSyncKey(onlyCloud)!)).toBe(true)
    expect(isInCloud?.(trackSyncKey(onlyHere)!)).toBe(false)
  })

  it('shows progress while a batch runs, and can cancel it', () => {
    mockSnapshot = {
      ...IDLE,
      active: true,
      total: 3,
      uploaded: 1,
      inProgress: [{ name: 'two.flac', sent: 250, size: 1000 }],
      bytesTotal: 1000,
      bytesSent: 500,
      bytesPerSecond: 100,
    }
    render(<CloudUploadSection songs={[song('only-here.flac', 1000, { local: true })]} />)

    expect(screen.getByText('Uploading — 1 of 3 done')).toBeInTheDocument()
    expect(screen.getByText('500 B of 1000 B · under a minute left')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
    // No second batch on top of a running one.
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }))
    expect(queue.cancel).toHaveBeenCalled()
  })

  it('reports how a batch ended, with the failures and a way to retry them', () => {
    mockSnapshot = {
      ...IDLE,
      total: 4,
      uploaded: 2,
      skipped: 1,
      failed: [{ name: 'bad.flac', reason: 'Upload failed (503)', retryable: true }],
      bytesTotal: 2000,
      bytesSent: 2000,
    }
    render(<CloudUploadSection songs={[]} />)

    expect(screen.getByText('2 uploaded · 1 already in your cloud · 1 failed')).toBeInTheDocument()
    expect(screen.getByText('Upload failed (503)')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Retry failed/ }))
    expect(queue.retryFailed).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(queue.clear).toHaveBeenCalled()
  })

  it('offers no retry when every failure is one the library can never take', () => {
    mockSnapshot = {
      ...IDLE,
      total: 1,
      failed: [{ name: 'empty.flac', reason: 'The file is empty', retryable: false }],
    }
    render(<CloudUploadSection songs={[]} />)
    expect(screen.queryByRole('button', { name: /Retry failed/ })).not.toBeInTheDocument()
  })

  it('says so when a pick holds no music', () => {
    queue.add.mockReturnValueOnce(0)
    const { container } = render(<CloudUploadSection songs={[]} />)
    const folderInput = container.querySelector('input[webkitdirectory]') as HTMLInputElement

    fireEvent.change(folderInput, { target: { files: [new File(['x'], 'cover.jpg')] } })
    expect(screen.getByText(/No music files there/)).toBeInTheDocument()
  })
})
