// @ts-check
/**
 * browse-only.spec.js
 *
 * Lightweight browser session that browses without submitting any bookings.
 * Generates RUM view/action/resource events and Core Web Vitals for:
 *   - Home page (destination list)
 *   - Booking form page (without submitting)
 *   - User leaderboard endpoint (fetched via page.request so it goes through
 *     the browser's network layer and appears as a resource in RUM)
 *
 * This is intentionally lighter than booking-flow.spec.js so it can run more
 * frequently without hammering the DB.
 */
const { test, expect } = require('@playwright/test')

test.describe('Dogstronaut Tours — Browse Only (no form submission)', () => {
  test.use({
    userAgent: 'PlaywrightSynthetic/1.0 CosmoCab-LoadTest',
  })

  // --------------------------------------------------------------------------
  // 1. Home page: load and scroll through all destination cards
  // --------------------------------------------------------------------------
  test('visits home page and scrolls through destinations', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Brand / hero visible (use first() — appears in both nav and page hero)
    await expect(page.getByText('Dogstronaut Tours').first()).toBeVisible()
    await expect(page.getByText('Travel Beyond Earth.', { exact: false }).first()).toBeVisible()

    // Wait for destination cards
    await page.waitForSelector('.dest-card', { timeout: 15000 })

    // Scroll to destinations section to trigger "Book Your Launch" hero CTA
    const heroBtn = page.getByRole('button', { name: /Book Your Launch/i })
    await heroBtn.click()

    // Verify destinations grid is now in view
    await expect(page.locator('.destinations-section')).toBeVisible()

    // Count and verify all 5 expected destinations are rendered
    const cards = page.locator('.dest-card')
    const count = await cards.count()
    expect(count).toBeGreaterThanOrEqual(5)

    // Verify each expected destination name is present
    const expectedDestinations = [
      'ISS Day Trip',
      'Moon (Luna Economy)',
      'Mars (Red Getaway)',
      'Jupiter Flyby',
      'Saturn Ring Rider',
    ]
    for (const destName of expectedDestinations) {
      await expect(page.getByText(destName)).toBeVisible()
    }

    // Scroll each card into view (triggers intersection-based analytics if any)
    for (let i = 0; i < count; i++) {
      await cards.nth(i).scrollIntoViewIfNeeded()
      // Small pause so RUM registers the interaction timing
      await page.waitForTimeout(300)
    }
  })

  // --------------------------------------------------------------------------
  // 2. View booking page for Moon (without submitting)
  // --------------------------------------------------------------------------
  test('views Moon booking page without submitting', async ({ page }) => {
    // Navigate directly via URL to avoid depending on home page state
    await page.goto('/book/moon')
    await page.waitForLoadState('networkidle')

    // Destination header should show Moon details
    await expect(page.getByText('Moon (Luna Economy)')).toBeVisible()

    // Step indicator should show step 2 (Passenger) active
    await expect(page.locator('.booking-steps')).toBeVisible()

    // Form fields exist
    await expect(page.locator('#passengerName')).toBeVisible()
    await expect(page.locator('#passengerEmail')).toBeVisible()
    await expect(page.locator('#departureDate')).toBeVisible()

    // Rocket class options — browse through them (generates RUM actions)
    const rocketCards = page.locator('.rocket-card')
    const rocketCount = await rocketCards.count()
    expect(rocketCount).toBe(3) // economy, business, first_class

    for (let i = 0; i < rocketCount; i++) {
      await rocketCards.nth(i).click()
      await page.waitForTimeout(200)
    }

    // Pilot selection — browse through all pilots
    const pilotCards = page.locator('.pilot-card')
    const pilotCount = await pilotCards.count()
    expect(pilotCount).toBe(3)

    for (let i = 0; i < pilotCount; i++) {
      await pilotCards.nth(i).click()
      await page.waitForTimeout(200)
    }

    // Verify total price is displayed (should be visible in summary bar)
    await expect(page.locator('.summary-price')).toBeVisible()

    // Click back to home using the navbar link — another RUM navigation event
    await page.getByRole('button', { name: /Destinations/i }).click()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/')
  })

  // --------------------------------------------------------------------------
  // 3. View booking pages for additional destinations
  // --------------------------------------------------------------------------
  test('browses Mars and ISS booking pages', async ({ page }) => {
    // Mars
    await page.goto('/book/mars')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Mars (Red Getaway)')).toBeVisible()
    await expect(page.locator('#passengerName')).toBeVisible()

    // ISS
    await page.goto('/book/iss')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('ISS Day Trip')).toBeVisible()
    await expect(page.locator('#passengerName')).toBeVisible()
  })

  // --------------------------------------------------------------------------
  // 4. User leaderboard — fetch via browser request (generates RUM resource)
  // --------------------------------------------------------------------------
  test('checks user leaderboard endpoint', async ({ page }) => {
    // First load the home page so the RUM session is established
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Make the leaderboard request via the browser's fetch context
    // This appears as a "resource" event in Datadog RUM
    const response = await page.request.get('http://user-service.dogstronaut.svc.cluster.local:4004/users/leaderboard')

    // Accept either a successful response or a network error (service may not
    // be reachable from the playwright pod directly — the important thing is
    // that the RUM session includes the request attempt)
    // In cluster context this should resolve; outside cluster it may fail
    if (response.ok()) {
      const body = await response.json()
      // Leaderboard returns { leaderboard: [...] } or similar shape
      expect(body).toBeDefined()
    }

    // Also try via the frontend proxy path (nginx proxies /api/* to booking-service,
    // but user-service is separate — test the root page fetch is healthy)
    // Note: chaos mode may return 400/503 on /api/destinations — accept any 2xx or 4xx/5xx
    // The important thing is the frontend is reachable, not that the API succeeds
    const destResp = await page.request.get('/api/destinations')
    // Accept 200 (normal) or chaos-injected errors (4xx/5xx) — both prove the app is up
    expect([200, 400, 503, 409].includes(destResp.status())).toBe(true)
  })
})
