/**
 * k6 API Load Test — Dogstronaut Tours (CosmoCab)
 *
 * Simulates realistic user traffic across all 4 backend services:
 *   - booking-service  (port 4001)  — destinations, bookings, payments proxy
 *   - payment-service  (port 4002)  — direct payment processing
 *   - fleet-service    (port 4003)  — rocket availability, fleet list, crew
 *   - user-service     (port 4004)  — user profiles, leaderboard, loyalty
 *
 * Access strategy:
 *   When running OUTSIDE the cluster (local dev): point LB_IP at the frontend
 *   LoadBalancer IP (set LB_IP=http://<your-frontend-ip>) for /api/* and
 *   /users/* routes.
 *
 *   When running INSIDE the cluster (k8s CronJob): use cluster-internal DNS
 *   names so all 4 services are reachable without any external LB dependency.
 *   The CLUSTER_INTERNAL env var switches the base URLs automatically.
 *
 * Usage:
 *   # External (local):
 *   k6 run k6-api-load.js
 *
 *   # Internal cluster mode (set by CronJob manifest):
 *   CLUSTER_INTERNAL=true k6 run k6-api-load.js
 *
 *   # Override individual base URLs:
 *   BOOKING_URL=http://booking-service:4001 k6 run k6-api-load.js
 */

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Rate, Trend, Counter } from 'k6/metrics'

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const bookingSuccessRate  = new Rate('booking_success_rate')
const paymentSuccessRate  = new Rate('payment_success_rate')
const bookingDuration     = new Trend('booking_flow_duration_ms', true)
const fleetQueryDuration  = new Trend('fleet_query_duration_ms', true)
const userQueryDuration   = new Trend('user_query_duration_ms', true)
const totalBookingsCreated = new Counter('total_bookings_created')
const totalPaymentsProcessed = new Counter('total_payments_processed')

// ---------------------------------------------------------------------------
// Base URL configuration
// ---------------------------------------------------------------------------
const IS_CLUSTER_INTERNAL = __ENV.CLUSTER_INTERNAL === 'true'

// External (via LoadBalancer nginx proxy). Override per-run:
//   LB_IP=http://<your-frontend-lb-ip> k6 run k6-api-load.js
const LB_IP = __ENV.LB_IP || 'http://localhost'

// Internal cluster DNS (used when running as a k8s CronJob)
const BOOKING_URL  = __ENV.BOOKING_URL  || (IS_CLUSTER_INTERNAL ? 'http://booking-service.dogstronaut.svc.cluster.local:4001'  : LB_IP)
const PAYMENT_URL  = __ENV.PAYMENT_URL  || (IS_CLUSTER_INTERNAL ? 'http://payment-service.dogstronaut.svc.cluster.local:4002'  : LB_IP)
const FLEET_URL    = __ENV.FLEET_URL    || (IS_CLUSTER_INTERNAL ? 'http://fleet-service.dogstronaut.svc.cluster.local:4003'    : LB_IP)
const USER_URL     = __ENV.USER_URL     || (IS_CLUSTER_INTERNAL ? 'http://user-service.dogstronaut.svc.cluster.local:4004'     : LB_IP)

// ---------------------------------------------------------------------------
// k6 test options
// ---------------------------------------------------------------------------
export const options = {
  vus: 5,
  // Duration is overridden to 4m by the CronJob --duration flag.
  // Set a longer default here so the script is also useful for local runs.
  duration: '10m',

  thresholds: {
    // Overall HTTP success rate >= 90% (chaos mode may cause intentional errors)
    http_req_failed:          ['rate<0.10'],
    // p95 of all requests should complete within 8s (accounts for slow chaos)
    http_req_duration:        ['p(95)<8000'],
    // Core booking flow p95 < 10s
    booking_flow_duration_ms: ['p(95)<10000'],
    // At least 85% of booking attempts succeed
    booking_success_rate:     ['rate>0.85'],
    // At least 80% of payment attempts succeed (payment has higher chaos rate)
    payment_success_rate:     ['rate>0.80'],
  },
}

// ---------------------------------------------------------------------------
// Static test data
// ---------------------------------------------------------------------------
const DESTINATIONS = ['iss', 'moon', 'mars', 'jupiter', 'saturn']
const ROCKET_CLASSES = ['economy', 'business', 'first_class']
const PILOTS = ['Captain Zara', 'Pilot Rex', 'Ace Voss', 'Dr. Flint']
const ROCKET_IDS = ['r001', 'r002', 'r003', 'r004', 'r005', 'r006', 'r007', 'r008', 'r009']

// Known demo user UUIDs are resolved at runtime via POST /users or leaderboard.
// We keep a small in-VU cache of user IDs discovered during the run.
let knownUserIds = []

// Demo users pre-seeded in user-service (emails match seed data)
const DEMO_USER_EMAILS = [
  'salah@epl.io', 'haaland@epl.io', 'saka@epl.io', 'rashford@epl.io',
  'bellingham@epl.io', 'palmer@epl.io', 'foden@epl.io', 'son@epl.io',
]

const DEMO_USER_NAMES = [
  'Salah', 'Haaland', 'Saka', 'Rashford',
  'Bellingham', 'Palmer', 'Foden', 'Son',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function futureDate(daysFromNow) {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().split('T')[0]
}

/** Common headers applied to every request. */
function headers(extra) {
  return Object.assign({
    'Content-Type': 'application/json',
    'User-Agent':   'k6-dogstronaut-load-test/1.0',
  }, extra || {})
}

/** Standard tag set applied to every request group. */
function tags(name) {
  return {
    env:      'demo',
    scenario: name,
  }
}

// ---------------------------------------------------------------------------
// Scenario functions
// ---------------------------------------------------------------------------

/**
 * Full booking flow:
 *   1. GET  /api/destinations
 *   2. POST /api/bookings
 *   3. POST /api/payments/process  (via booking-service proxy)
 *   4. GET  /api/bookings/:id
 *   5. GET  /api/bookings/:id/status
 */
function bookingFlow() {
  const flowStart = Date.now()
  let bookingId = null
  let price = 9999

  group('booking_flow', () => {
    // ---- Step 1: list destinations ----------------------------------------
    const destRes = http.get(`${BOOKING_URL}/api/destinations`, {
      headers: headers(),
      tags: tags('booking_flow'),
    })

    check(destRes, {
      'destinations: status 200': (r) => r.status === 200,
      'destinations: has items':  (r) => {
        try { return JSON.parse(r.body).length > 0 } catch { return false }
      },
    })

    let destinationId = pick(DESTINATIONS)

    // Try to parse a real destination ID from the response
    try {
      const dests = JSON.parse(destRes.body)
      if (Array.isArray(dests) && dests.length > 0) {
        const dest = pick(dests)
        destinationId = dest.id || destinationId
        price = dest.price_usd || price
      }
    } catch (_) {}

    sleep(randomInt(1, 2))

    // ---- Step 2: create booking --------------------------------------------
    const rocketClass = pick(ROCKET_CLASSES)
    const idx         = randomInt(0, DEMO_USER_NAMES.length - 1)
    const name        = DEMO_USER_NAMES[idx]
    const email       = DEMO_USER_EMAILS[idx]

    const bookingPayload = JSON.stringify({
      destination_id:  destinationId,
      passenger_name:  name,
      passenger_email: email,
      departure_date:  futureDate(randomInt(14, 180)),
      rocket_class:    rocketClass,
      pilot_name:      pick(PILOTS),
      total_price_usd: price,
    })

    const bookingRes = http.post(
      `${BOOKING_URL}/api/bookings`,
      bookingPayload,
      { headers: headers(), tags: tags('booking_flow') }
    )

    const bookingOk = check(bookingRes, {
      'booking: status 201':    (r) => r.status === 201,
      'booking: has id':        (r) => {
        try { return !!JSON.parse(r.body).id } catch { return false }
      },
    })

    bookingSuccessRate.add(bookingOk)

    if (bookingOk) {
      totalBookingsCreated.add(1)
      try {
        const b = JSON.parse(bookingRes.body)
        bookingId = b.id
        price = b.total_price_usd || price
      } catch (_) {}
    }

    sleep(randomInt(1, 2))

    // ---- Step 3: process payment -------------------------------------------
    if (bookingId) {
      const payPayload = JSON.stringify({
        booking_id:    bookingId,
        amount_usd:    price,
        card_last_four: String(randomInt(1000, 9999)),
      })

      const payRes = http.post(
        `${BOOKING_URL}/api/payments/process`,
        payPayload,
        { headers: headers(), tags: tags('booking_flow') }
      )

      const payOk = check(payRes, {
        'payment: status 200':        (r) => r.status === 200,
        'payment: has transaction_id': (r) => {
          try { return !!JSON.parse(r.body).transaction_id } catch { return false }
        },
      })

      paymentSuccessRate.add(payOk)
      if (payOk) totalPaymentsProcessed.add(1)

      sleep(randomInt(1, 2))

      // ---- Step 4: get booking confirmation --------------------------------
      const confirmRes = http.get(
        `${BOOKING_URL}/api/bookings/${bookingId}`,
        { headers: headers(), tags: tags('booking_flow') }
      )

      check(confirmRes, {
        'confirmation: status 200': (r) => r.status === 200,
      })

      sleep(randomInt(1, 2))

      // ---- Step 5: poll booking status -------------------------------------
      const statusRes = http.get(
        `${BOOKING_URL}/api/bookings/${bookingId}/status`,
        { headers: headers(), tags: tags('booking_flow') }
      )

      check(statusRes, {
        'booking_status: status 200': (r) => r.status === 200,
        'booking_status: has status field': (r) => {
          try { return !!JSON.parse(r.body).status } catch { return false }
        },
      })
    }
  })

  bookingDuration.add(Date.now() - flowStart)
}

/**
 * Fleet browsing scenario:
 *   1. GET /fleet
 *   2. GET /availability?rocketClass=...
 *   3. GET /rockets/:rocket_id/status
 *   4. GET /maintenance-schedule
 *   5. GET /crew/:pilot_name
 */
function fleetBrowsingFlow() {
  const flowStart = Date.now()

  group('fleet_browsing', () => {
    // ---- Fleet list --------------------------------------------------------
    const fleetRes = http.get(
      `${FLEET_URL}/fleet`,
      { headers: headers(), tags: tags('fleet_browsing') }
    )

    check(fleetRes, {
      'fleet: status 200':    (r) => r.status === 200,
      'fleet: has rockets':   (r) => {
        try { return JSON.parse(r.body).fleet.length > 0 } catch { return false }
      },
    })

    sleep(randomInt(1, 2))

    // ---- Availability check ------------------------------------------------
    const rocketClass = pick(ROCKET_CLASSES)
    const availRes = http.get(
      `${FLEET_URL}/availability?rocketClass=${rocketClass}&date=${futureDate(30)}`,
      { headers: headers(), tags: tags('fleet_browsing') }
    )

    check(availRes, {
      'availability: status 200':         (r) => r.status === 200,
      'availability: available field exists': (r) => {
        try { return typeof JSON.parse(r.body).available === 'boolean' } catch { return false }
      },
    })

    sleep(randomInt(1, 2))

    // ---- Individual rocket status ------------------------------------------
    const rocketId = pick(ROCKET_IDS)
    const rocketStatusRes = http.get(
      `${FLEET_URL}/rockets/${rocketId}/status`,
      { headers: headers(), tags: tags('fleet_browsing') }
    )

    check(rocketStatusRes, {
      'rocket_status: status 200 or 404': (r) => r.status === 200 || r.status === 404,
    })

    sleep(randomInt(1, 2))

    // ---- Maintenance schedule ----------------------------------------------
    const maintRes = http.get(
      `${FLEET_URL}/maintenance-schedule`,
      { headers: headers(), tags: tags('fleet_browsing') }
    )

    check(maintRes, {
      'maintenance_schedule: status 200': (r) => r.status === 200,
    })

    sleep(randomInt(1, 2))

    // ---- Crew info ---------------------------------------------------------
    const crewRes = http.get(
      `${FLEET_URL}/crew/${encodeURIComponent(pick(PILOTS))}`,
      { headers: headers(), tags: tags('fleet_browsing') }
    )

    check(crewRes, {
      'crew: status 200': (r) => r.status === 200,
      'crew: has name':   (r) => {
        try { return !!JSON.parse(r.body).name } catch { return false }
      },
    })
  })

  fleetQueryDuration.add(Date.now() - flowStart)
}

/**
 * User service scenario:
 *   1. GET  /users/leaderboard
 *   2. POST /users  (create a random new user)
 *   3. GET  /users/:id
 *   4. GET  /users/:id/loyalty
 *   5. PATCH /users/:id  (update name)
 */
function userServiceFlow() {
  const flowStart = Date.now()

  group('user_service', () => {
    // ---- Leaderboard -------------------------------------------------------
    const lbRes = http.get(
      `${USER_URL}/users/leaderboard`,
      { headers: headers(), tags: tags('user_service') }
    )

    check(lbRes, {
      'leaderboard: status 200':   (r) => r.status === 200,
      'leaderboard: has entries':  (r) => {
        try { return JSON.parse(r.body).leaderboard.length > 0 } catch { return false }
      },
    })

    // Harvest user IDs from leaderboard for later use
    try {
      const lb = JSON.parse(lbRes.body)
      if (lb.leaderboard) {
        lb.leaderboard.forEach((u) => {
          if (u.id && !knownUserIds.includes(u.id)) knownUserIds.push(u.id)
        })
        // Cap the cache at 20 entries to avoid unbounded growth
        if (knownUserIds.length > 20) knownUserIds = knownUserIds.slice(-20)
      }
    } catch (_) {}

    sleep(randomInt(1, 2))

    // ---- Create new user ---------------------------------------------------
    const ts = Date.now()
    const newUserPayload = JSON.stringify({
      name:  `LoadTest User ${ts}`,
      email: `loadtest+${ts}@dogstronaut.space`,
    })

    const createRes = http.post(
      `${USER_URL}/users`,
      newUserPayload,
      { headers: headers(), tags: tags('user_service') }
    )

    let newUserId = null
    check(createRes, {
      'create_user: status 201': (r) => r.status === 201,
      'create_user: has id':     (r) => {
        try { return !!JSON.parse(r.body).id } catch { return false }
      },
    })

    try {
      newUserId = JSON.parse(createRes.body).id
      if (newUserId && !knownUserIds.includes(newUserId)) knownUserIds.push(newUserId)
    } catch (_) {}

    sleep(randomInt(1, 2))

    // ---- Get user profile --------------------------------------------------
    const userId = newUserId || pick(knownUserIds) || null
    if (userId) {
      const profileRes = http.get(
        `${USER_URL}/users/${userId}`,
        { headers: headers(), tags: tags('user_service') }
      )

      check(profileRes, {
        'user_profile: status 200': (r) => r.status === 200,
        'user_profile: has email':  (r) => {
          try { return !!JSON.parse(r.body).email } catch { return false }
        },
      })

      sleep(randomInt(1, 2))

      // ---- Loyalty balance -------------------------------------------------
      const loyaltyRes = http.get(
        `${USER_URL}/users/${userId}/loyalty`,
        { headers: headers(), tags: tags('user_service') }
      )

      check(loyaltyRes, {
        'loyalty: status 200':     (r) => r.status === 200,
        'loyalty: has points':     (r) => {
          try { return typeof JSON.parse(r.body).points === 'number' } catch { return false }
        },
      })

      sleep(randomInt(1, 2))

      // ---- Update user profile (patch name) --------------------------------
      if (newUserId) {
        const patchRes = http.patch(
          `${USER_URL}/users/${newUserId}`,
          JSON.stringify({ name: `LoadTest User Updated ${Date.now()}` }),
          { headers: headers(), tags: tags('user_service') }
        )

        check(patchRes, {
          'patch_user: status 200': (r) => r.status === 200,
        })
      }
    }
  })

  userQueryDuration.add(Date.now() - flowStart)
}

/**
 * Booking list + direct payment-service scenario:
 *   1. GET /api/bookings?limit=10
 *   2. POST /process  (direct payment-service call — internal only)
 *   3. GET  /payments/:booking_id  (payment history)
 */
function paymentAndListFlow() {
  group('payment_and_list', () => {
    // ---- List recent bookings ----------------------------------------------
    const listRes = http.get(
      `${BOOKING_URL}/api/bookings?limit=10`,
      { headers: headers(), tags: tags('payment_and_list') }
    )

    check(listRes, {
      'bookings_list: status 200':    (r) => r.status === 200,
      'bookings_list: has bookings':  (r) => {
        try { return Array.isArray(JSON.parse(r.body).bookings) } catch { return false }
      },
    })

    let bookingId = null
    try {
      const list = JSON.parse(listRes.body)
      if (list.bookings && list.bookings.length > 0) {
        bookingId = pick(list.bookings).id
      }
    } catch (_) {}

    sleep(randomInt(1, 2))

    // ---- Direct payment-service call (only reachable inside cluster) -------
    const fakeBid = bookingId || `test-${Date.now()}`
    const directPayRes = http.post(
      `${PAYMENT_URL}/process`,
      JSON.stringify({
        booking_id:    fakeBid,
        amount_usd:    randomInt(5000, 75000),
        card_last_four: String(randomInt(1000, 9999)),
      }),
      { headers: headers(), tags: tags('payment_and_list') }
    )

    const payOk = check(directPayRes, {
      'direct_payment: status 200':        (r) => r.status === 200,
      'direct_payment: has transaction_id': (r) => {
        try { return !!JSON.parse(r.body).transaction_id } catch { return false }
      },
    })

    paymentSuccessRate.add(payOk)
    if (payOk) totalPaymentsProcessed.add(1)

    sleep(randomInt(1, 2))

    // ---- Payment history ---------------------------------------------------
    const historyRes = http.get(
      `${PAYMENT_URL}/payments/${fakeBid}`,
      { headers: headers(), tags: tags('payment_and_list') }
    )

    check(historyRes, {
      'payment_history: status 200': (r) => r.status === 200,
    })
  })
}

// ---------------------------------------------------------------------------
// Main VU loop
// ---------------------------------------------------------------------------
export default function () {
  // Rotate through all 4 scenarios each iteration to spread load.
  // Each iteration a VU picks a weighted random scenario.
  const roll = Math.random()

  if (roll < 0.45) {
    // ~45% of iterations: full booking flow (most important business path)
    bookingFlow()
  } else if (roll < 0.70) {
    // ~25%: fleet browsing
    fleetBrowsingFlow()
  } else if (roll < 0.88) {
    // ~18%: user service
    userServiceFlow()
  } else {
    // ~12%: payment list + direct payment call
    paymentAndListFlow()
  }

  // Global think time between iterations
  sleep(randomInt(1, 3))
}
