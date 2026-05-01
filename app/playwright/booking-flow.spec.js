// @ts-check
/**
 * booking-flow.spec.js
 *
 * Full end-to-end booking flow for Dogstronaut Tours.
 * Drives a real Chromium browser so the Datadog RUM SDK fires view/action/resource
 * events and Core Web Vitals — exactly what k6 API traffic cannot generate.
 *
 * Flow: Home → Browse destinations → Select Moon → Fill booking form →
 *       Submit → Fill payment → Submit → Confirm confirmation page.
 */
const { test, expect } = require('@playwright/test')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a departure date 30 days from now in YYYY-MM-DD format. */
function futureDateStr(daysAhead = 30) {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  return d.toISOString().split('T')[0]
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Dogstronaut Tours — Full Booking Flow', () => {
  // Run each test in a fresh browser context so RUM session IDs are distinct
  test.use({
    userAgent: 'PlaywrightSynthetic/1.0 CosmoCab-LoadTest',
  })

  // --------------------------------------------------------------------------
  // 1. Home page loads and destinations grid is visible
  // --------------------------------------------------------------------------
  test('home page renders destination cards', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Brand name in navbar (use first() — appears in both nav and page hero)
    await expect(page.getByText('Dogstronaut Tours').first()).toBeVisible()

    // Hero section CTA
    await expect(page.getByRole('button', { name: /Book Your Launch/i })).toBeVisible()

    // Destinations grid — wait for at least one card to appear
    // The grid loads async from the API; fall back to cached data on timeout
    await page.waitForSelector('.dest-card', { timeout: 15000 })
    const cards = page.locator('.dest-card')
    expect(await cards.count()).toBeGreaterThan(0)

    // Verify at least Moon is present (always in seed data)
    await expect(page.getByText('Moon (Luna Economy)')).toBeVisible()
  })

  // --------------------------------------------------------------------------
  // 2. Navigate to booking page for the Moon destination
  // --------------------------------------------------------------------------
  test('select Moon destination opens booking form', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('.dest-card', { timeout: 15000 })

    // Click the "Select Launch" button on the Moon card
    // Use text matching to be resilient to layout changes
    const moonCard = page.locator('.dest-card', { hasText: 'Moon (Luna Economy)' })
    await expect(moonCard).toBeVisible()
    await moonCard.getByRole('button', { name: /Select Launch/i }).click()

    await page.waitForLoadState('networkidle')

    // Should be on /book/moon
    await expect(page).toHaveURL(/\/book\/moon/)

    // Booking form should be visible
    await expect(page.locator('#passengerName')).toBeVisible()
    await expect(page.locator('#passengerEmail')).toBeVisible()
    await expect(page.locator('#departureDate')).toBeVisible()
  })

  // --------------------------------------------------------------------------
  // 3. Complete full booking → payment → confirmation flow
  // --------------------------------------------------------------------------
  test('completes full booking flow: Moon booking → payment → confirmation', async ({ page }) => {
    // ---- Step 1: Home page ----
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('.dest-card', { timeout: 15000 })

    // ---- Step 2: Select Moon ----
    const moonCard = page.locator('.dest-card', { hasText: 'Moon (Luna Economy)' })
    await moonCard.getByRole('button', { name: /Select Launch/i }).click()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/book\/moon/)

    // ---- Step 3: Fill booking form ----
    const ts = Date.now()
    const passengerName = `Playwright Bot`
    const passengerEmail = `pw.synthetic+${ts}@dogstronaut.space`

    await page.locator('#passengerName').fill(passengerName)
    await page.locator('#passengerEmail').fill(passengerEmail)

    // Set departure date to 30 days from now (already pre-filled to +7 days,
    // but we set it explicitly for reliability)
    await page.locator('#departureDate').fill(futureDateStr(30))

    // Select Economy Pod rocket class (default, but click explicitly to generate RUM action)
    const economyCard = page.locator('.rocket-card', { hasText: 'Economy Pod' })
    await economyCard.click()

    // Select Captain Buzz pilot (default, click for RUM action)
    const captainBuzzCard = page.locator('.pilot-card', { hasText: 'Captain Buzz' })
    await captainBuzzCard.click()

    // ---- Step 4: Submit booking ----
    await page.getByRole('button', { name: /Continue to Payment/i }).click()

    // Wait for navigation to /payment
    await page.waitForURL(/\/payment/, { timeout: 20000 })
    await page.waitForLoadState('networkidle')

    // Verify payment page shows the booking summary with correct passenger name
    await expect(page.getByText(passengerName)).toBeVisible()
    await expect(page.getByText('Launch Summary')).toBeVisible()
    await expect(page.getByText('Payment Details')).toBeVisible()

    // ---- Step 5: Fill payment form ----
    await page.locator('#cardName').fill('Playwright Synthetic')
    await page.locator('#cardNumber').fill('4242424242424242')
    await page.locator('#expiry').fill('1228')
    await page.locator('#cvv').fill('737')

    // ---- Step 6: Submit payment ----
    // Button text includes price, so use partial match
    await page.getByRole('button', { name: /Confirm & Pay/i }).click()

    // Wait for navigation to /confirmation
    await page.waitForURL(/\/confirmation/, { timeout: 25000 })
    await page.waitForLoadState('networkidle')

    // ---- Step 7: Verify confirmation page ----
    await expect(page.getByText("You're Going to Space!")).toBeVisible()
    await expect(page.getByText('Launch Confirmed')).toBeVisible()

    // Booking reference should be present (8-char uppercase hex)
    const bookingRefEl = page.locator('.ref-value').first()
    await expect(bookingRefEl).toBeVisible()
    const refText = await bookingRefEl.textContent()
    expect(refText).toMatch(/^[A-F0-9]{8}$/)

    // Passenger name appears in confirmation details
    await expect(page.getByText(`Passenger: ${passengerName}`)).toBeVisible()

    // "Book Another Launch" button is present (allows the next test cycle to loop)
    await expect(page.getByRole('button', { name: /Book Another Launch/i })).toBeVisible()
  })

  // --------------------------------------------------------------------------
  // 4. ISS Day Trip booking (alternate destination, validates URL param routing)
  // --------------------------------------------------------------------------
  test('completes booking flow for ISS destination', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('.dest-card', { timeout: 15000 })

    const issCard = page.locator('.dest-card', { hasText: 'ISS Day Trip' })
    await issCard.getByRole('button', { name: /Select Launch/i }).click()

    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/book\/iss/)

    const ts = Date.now()
    await page.locator('#passengerName').fill('ISS Tester')
    await page.locator('#passengerEmail').fill(`iss+${ts}@dogstronaut.space`)
    await page.locator('#departureDate').fill(futureDateStr(14))

    // Pick Business Capsule for variety
    const businessCard = page.locator('.rocket-card', { hasText: 'Business Capsule' })
    await businessCard.click()

    // Pick Rookie Rick for variety
    const rookieRickCard = page.locator('.pilot-card', { hasText: 'Rookie Rick' })
    await rookieRickCard.click()

    await page.getByRole('button', { name: /Continue to Payment/i }).click()
    await page.waitForURL(/\/payment/, { timeout: 20000 })
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('ISS Day Trip').first()).toBeVisible()

    await page.locator('#cardName').fill('ISS Tester Synthetic')
    await page.locator('#cardNumber').fill('5555555555554444')
    await page.locator('#expiry').fill('0930')
    await page.locator('#cvv').fill('123')

    await page.getByRole('button', { name: /Confirm & Pay/i }).click()
    await page.waitForURL(/\/confirmation/, { timeout: 25000 })
    await page.waitForLoadState('networkidle')

    await expect(page.getByText("You're Going to Space!")).toBeVisible()
    await expect(page.getByText('Launch Confirmed')).toBeVisible()
  })
})
