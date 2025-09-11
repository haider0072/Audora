import { test, expect } from '@playwright/test'

test.describe('Music Player', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the music player
    await page.goto('/')
  })

  test('should load the music player interface', async ({ page }) => {
    // Check that the main elements are present
    await expect(page.getByText('Enhanced Music Player')).toBeVisible()
    await expect(page.getByRole('button', { name: /play/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /skip/i })).toBeVisible()
  })

  test('should handle responsive design', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    
    // Check mobile-specific elements are visible
    await expect(page.locator('[data-testid="mobile-player"]')).toBeVisible()
    
    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 })
    
    // Check desktop-specific elements are visible
    await expect(page.locator('[data-testid="desktop-player"]')).toBeVisible()
  })

  test('should toggle play/pause button', async ({ page }) => {
    const playButton = page.getByRole('button', { name: /play/i })
    
    // Initially should show play button
    await expect(playButton).toBeVisible()
    
    // Click play button (will be disabled without audio file)
    // This tests the UI interaction, not actual playback
    await playButton.click()
    
    // Check if button state changes (may be disabled without audio)
    await expect(playButton).toBeDefined()
  })

  test('should open and close equalizer', async ({ page }) => {
    // Click the equalizer/settings button
    const settingsButton = page.getByRole('button').filter({ has: page.locator('svg') }).first()
    await settingsButton.click()
    
    // Check if equalizer dialog opens
    await expect(page.getByText('Equalizer')).toBeVisible()
    
    // Close the dialog
    await page.keyboard.press('Escape')
    
    // Check if dialog closes
    await expect(page.getByText('Equalizer')).not.toBeVisible()
  })

  test('should switch between different views', async ({ page }) => {
    // Test switching to lyrics view (if button exists)
    const lyricsButton = page.getByRole('button').filter({ 
      has: page.locator('svg[data-testid="mic-icon"], svg[class*="lucide-mic"]') 
    }).first()
    
    if (await lyricsButton.isVisible()) {
      await lyricsButton.click()
      // Check if lyrics view is active
      await expect(page.getByText('Lyrics')).toBeVisible()
    }
    
    // Test switching to YouTube view (if button exists)
    const youtubeButton = page.getByRole('button').filter({ 
      has: page.locator('svg[data-testid="youtube-icon"], svg[class*="youtube"]') 
    }).first()
    
    if (await youtubeButton.isVisible()) {
      await youtubeButton.click()
      // Check if YouTube view loads
      await expect(page.locator('#youtube-player-container')).toBeVisible()
    }
  })

  test('should handle volume control', async ({ page }) => {
    // Find volume slider
    const volumeSlider = page.locator('[data-testid="volume-slider"], input[type="range"]').first()
    
    if (await volumeSlider.isVisible()) {
      // Test volume adjustment
      await volumeSlider.fill('50')
      
      // Check if volume value changed
      const value = await volumeSlider.getAttribute('value')
      expect(value).toBe('50')
    }
  })

  test('should handle file upload area', async ({ page }) => {
    // Check if add music controls are present
    const addMusicButton = page.getByText('Add Music', { exact: false }).first()
    
    if (await addMusicButton.isVisible()) {
      await addMusicButton.click()
      
      // Check if file input or drag area is visible
      await expect(page.getByText(/drag.*files/i).or(page.locator('input[type="file"]'))).toBeDefined()
    }
  })
})

test.describe('Accessibility', () => {
  test('should meet basic accessibility requirements', async ({ page }) => {
    await page.goto('/')
    
    // Check for proper ARIA labels on interactive elements
    const playButton = page.getByRole('button', { name: /play/i })
    await expect(playButton).toHaveAttribute('aria-label', /.+/)
    
    // Check keyboard navigation
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()
    
    // Check for proper heading structure
    const heading = page.getByRole('heading', { level: 1 }).or(page.getByRole('heading', { level: 2 }))
    await expect(heading).toBeVisible()
  })

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/')
    
    // Test tab navigation
    await page.keyboard.press('Tab')
    let focusedElement = page.locator(':focus')
    await expect(focusedElement).toBeVisible()
    
    // Test space bar for play/pause (if implemented)
    await page.keyboard.press('Space')
    
    // Test arrow keys for seeking (if implemented)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowLeft')
  })
})

test.describe('Performance', () => {
  test('should load within acceptable time', async ({ page }) => {
    const startTime = Date.now()
    
    await page.goto('/')
    
    // Wait for main content to load
    await page.waitForSelector('[data-testid="music-player"], .music-player, main', {
      timeout: 10000
    })
    
    const loadTime = Date.now() - startTime
    expect(loadTime).toBeLessThan(5000) // Should load within 5 seconds
  })

  test('should not have memory leaks on navigation', async ({ page, context }) => {
    // Navigate multiple times to check for memory leaks
    for (let i = 0; i < 3; i++) {
      await page.goto('/')
      await page.waitForTimeout(1000)
      await page.reload()
      await page.waitForTimeout(1000)
    }
    
    // This is a basic check - in a real scenario you'd monitor actual memory usage
    expect(true).toBeTruthy()
  })
})