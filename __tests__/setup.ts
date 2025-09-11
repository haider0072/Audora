// Global test setup and type augmentation
import '@testing-library/jest-dom'

// Augment Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeInTheDocument(): R
      toHaveAttribute(attr: string, value?: string): R
      toBeVisible(): R
      toBeDisabled(): R
    }
  }
}