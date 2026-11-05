// Pulls in the matcher type augmentation as well as the matchers themselves;
// jest.setup.js registers them at runtime but TypeScript needs the import here.
import '@testing-library/jest-dom'
import { render } from '@testing-library/react'

import { QualityLabel } from '@/components/player/quality-label'

const hiRes = { id: 'hi', format: 'FLAC', bitDepth: 24, sampleRate: 96_000, bitrate: 2683 }
const otherHiRes = { id: 'hi-2', format: 'FLAC', bitDepth: 24, sampleRate: 192_000, bitrate: 4912 }
const cd = { id: 'cd', format: 'FLAC', bitDepth: 16, sampleRate: 44_100, bitrate: 912 }
const mp3 = { id: 'mp3', format: 'MP3', bitrate: 320 }

const meter = (container: HTMLElement) => container.querySelector('.quality')

describe('QualityLabel', () => {
  it('shows the tier, figures and format the header gives', () => {
    const { container } = render(<QualityLabel song={hiRes} />)

    expect(meter(container)).toHaveAttribute('data-tier', 'hi-res')
    expect(meter(container)).toHaveTextContent('Hi-Res, 24/96FLAC')
    expect(container.querySelectorAll('.quality-bars > span')).toHaveLength(3)
  })

  it('rates CD-quality lossless and lossy audio', () => {
    expect(meter(render(<QualityLabel song={cd} />).container)).toHaveAttribute('data-tier', 'lossless')
    const lossy = meter(render(<QualityLabel song={mp3} />).container)
    expect(lossy).toHaveAttribute('data-tier', 'lossy')
    expect(lossy).toHaveTextContent('Lossy, MP3')
  })

  it('keeps the figures for assistive technology alone when compact', () => {
    const { container } = render(<QualityLabel song={hiRes} compact />)

    expect(container.querySelector('.sr-only')).toHaveTextContent('Hi-Res, 24/96')
    expect(meter(container)).toHaveTextContent('Hi-Res, 24/96 FLAC')
    expect(container.querySelectorAll('.quality > span:not(.sr-only):not(.quality-bars)')).toHaveLength(1)
  })

  it('adds the bitrate for lossless audio only', () => {
    expect(render(<QualityLabel song={hiRes} withBitrate />).container.querySelector('.quality-detail')).toHaveTextContent(
      '2,683 kbps',
    )
    expect(render(<QualityLabel song={mp3} withBitrate />).container.querySelector('.quality-detail')).toBeNull()
    expect(render(<QualityLabel song={hiRes} />).container.querySelector('.quality-detail')).toBeNull()
  })

  it('fills the meter when a hi-res song starts, but not for the first song shown', () => {
    const { container, rerender } = render(<QualityLabel song={cd} />)
    expect(meter(container)).not.toHaveAttribute('data-rise')

    rerender(<QualityLabel song={hiRes} />)
    expect(meter(container)).toHaveAttribute('data-rise')
    const bars = container.querySelector('.quality-bars')

    rerender(<QualityLabel song={otherHiRes} />)
    expect(meter(container)).toHaveAttribute('data-rise')
    // A fresh meter for each song, so the fill plays again.
    expect(container.querySelector('.quality-bars')).not.toBe(bars)

    rerender(<QualityLabel song={cd} />)
    expect(meter(container)).not.toHaveAttribute('data-rise')
  })

  it('does not fill the meter for a hi-res song shown first', () => {
    expect(meter(render(<QualityLabel song={hiRes} />).container)).not.toHaveAttribute('data-rise')
  })

  it('shows the format alone when the quality is unknown, or nothing when asked', () => {
    const unread = { id: 'old', format: 'flac' }
    const { container } = render(<QualityLabel song={unread} />)
    expect(meter(container)).toHaveTextContent('FLAC')
    expect(meter(container)).not.toHaveAttribute('data-tier')

    expect(render(<QualityLabel song={unread} hideWhenUnknown />).container).toBeEmptyDOMElement()
    expect(render(<QualityLabel song={{ id: 'none' }} />).container).toBeEmptyDOMElement()
    expect(render(<QualityLabel song={null} />).container).toBeEmptyDOMElement()
  })
})
