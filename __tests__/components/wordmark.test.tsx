// Pulls in the matcher type augmentation as well as the matchers themselves;
// jest.setup.js registers them at runtime but TypeScript needs the import here.
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { Wordmark } from '@/components/brand/wordmark'

describe('Wordmark', () => {
  it('reads as "Audora", not as its drawn letters', () => {
    render(
      <h1>
        <Wordmark />
      </h1>,
    )
    expect(screen.getByRole('heading', { name: 'Audora' })).toBeInTheDocument()
  })

  it('adds no second name when hidden beside a labelled icon', () => {
    render(
      <button type="button">
        <span role="img" aria-label="Audora" />
        <Wordmark aria-hidden="true" />
      </button>,
    )
    expect(screen.getByRole('button', { name: 'Audora' })).toBeInTheDocument()
  })
})
