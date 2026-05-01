'use strict'

const express = require('express')
const logger = require('../logger')

const router = express.Router()

const SERVICE_NAME = 'dogstronaut-fleet'

// Runtime chaos mode
let runtimeChaosMode = null

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getEffectiveChaosMode(req) {
  return req.headers['x-chaos-mode'] || runtimeChaosMode || process.env.CHAOS_MODE || 'normal'
}

const ERROR_SCENARIOS = [
  {
    name: 'rocket_under_maintenance',
    status: 503,
    message: 'Rocket scheduled for maintenance window',
  },
  {
    name: 'crew_unavailable',
    status: 503,
    message: 'Pilot crew unavailable for requested departure',
  },
  {
    name: 'launch_window_expired',
    status: 422,
    message: 'Launch window has passed for this destination',
  },
]

// Chaos middleware applied to all routes (skip health/admin)
function applyChaos(req, res, next) {
  if (req.path === '/health' || req.path.startsWith('/admin')) {
    return next()
  }
  const mode = getEffectiveChaosMode(req)
  if (mode === 'slow') {
    const delayMs = 2000 + Math.floor(Math.random() * 3000)
    logger.warn('CHAOS: slow mode active — injecting delay', {
      event_type: 'chaos_slow_injected',
      service: SERVICE_NAME,
      chaos_mode: 'slow',
      delay_ms: delayMs,
      path: req.path,
    })
    sleep(delayMs).then(next)
  } else if (mode === 'error') {
    const shouldFail = Math.random() < 0.30 // 30% failure rate
    if (shouldFail) {
      const scenario = ERROR_SCENARIOS[Math.floor(Math.random() * ERROR_SCENARIOS.length)]
      logger.error('chaos error injected', {
        event_type: scenario.name,
        service: SERVICE_NAME,
        chaos_mode: 'error',
        http_status: scenario.status,
        path: req.path,
      })
      return res.status(scenario.status).json({
        error: 'CHAOS MODE: ' + scenario.message,
        chaos_mode: 'error',
        scenario: scenario.name,
        message: scenario.message,
      })
    }
    next()
  } else if (mode === 'error-full') {
    // 100% failure rate — used by ad-hoc chaos script
    const scenario = ERROR_SCENARIOS[Math.floor(Math.random() * ERROR_SCENARIOS.length)]
    logger.error('chaos error injected (100%)', {
      event_type: scenario.name,
      service: SERVICE_NAME,
      chaos_mode: 'error-full',
      http_status: scenario.status,
      path: req.path,
    })
    return res.status(scenario.status).json({
      error: 'CHAOS MODE (100%): ' + scenario.message,
      chaos_mode: 'error-full',
      scenario: scenario.name,
      message: scenario.message,
    })
  } else {
    next()
  }
}

router.use(applyChaos)

const ROCKET_NAMES_BY_CLASS = {
  economy: [
    'Shooting Star IV',
    'Cloud Hopper 9',
    'Budget Blaster 2000',
    'The Tin Can Express',
    'Economy Eagle',
    'Frugal Falcon',
  ],
  business: [
    'Red Wanderer',
    'Midnight Cruiser',
    'Executive Voyager',
    'Stellar Suite',
    'Orbit One',
    'The Premium Pod',
  ],
  first_class: [
    'Cosmic Empress',
    'Galaxy Platinum',
    "The Billionaire's Bolt",
    'Nova Royale',
    'Prestige Prime',
    'The Golden Orbit',
  ],
}

const FLEET = [
  { id: 'r001', name: 'Shooting Star IV', class: 'economy', status: 'available', status_label: 'Fueling', capacity: 4 },
  { id: 'r002', name: 'Cloud Hopper 9', class: 'economy', status: 'available', status_label: 'Waiting for launch window', capacity: 4 },
  { id: 'r003', name: 'Budget Blaster 2000', class: 'economy', status: 'maintenance', status_label: 'Being cleaned after last trip', capacity: 4 },
  { id: 'r004', name: 'Red Wanderer', class: 'business', status: 'available', status_label: 'Pre-flight checklist (item 3 of 847)', capacity: 2 },
  { id: 'r005', name: 'Midnight Cruiser', class: 'business', status: 'in_flight', status_label: 'Currently en route to the Moon', capacity: 2 },
  { id: 'r006', name: 'Executive Voyager', class: 'business', status: 'available', status_label: 'Chilling at pad 7', capacity: 2 },
  { id: 'r007', name: 'Cosmic Empress', class: 'first_class', status: 'available', status_label: 'Butler being briefed', capacity: 1 },
  { id: 'r008', name: 'Nova Royale', class: 'first_class', status: 'in_flight', status_label: "Somewhere near Jupiter. Don't ask.", capacity: 1 },
  { id: 'r009', name: "The Billionaire's Bolt", class: 'first_class', status: 'available', status_label: 'Waiting for someone rich enough', capacity: 1 },
]

const CREW = {
  'Captain Zara': { name: 'Captain Zara', callsign: 'NOVA-1', missions: 47, rating: 4.9, speciality: 'Deep space navigation', status: 'available' },
  'Pilot Rex': { name: 'Pilot Rex', callsign: 'ORBIT-7', missions: 23, rating: 4.7, speciality: 'Lunar landings', status: 'available' },
  'Commander Kira': { name: 'Commander Kira', callsign: 'STAR-3', missions: 61, rating: 5.0, speciality: 'Emergency maneuvers', status: 'on_mission' },
  'Ace Voss': { name: 'Ace Voss', callsign: 'BLAZE-9', missions: 12, rating: 4.5, speciality: 'Atmospheric re-entry', status: 'available' },
  'Dr. Flint': { name: 'Dr. Flint', callsign: 'COMET-2', missions: 34, rating: 4.8, speciality: 'Science missions', status: 'furlough' },
}

const MAINTENANCE_SCHEDULE = [
  { rocket_id: 'r003', rocket_name: 'Budget Blaster 2000', start_date: '2026-03-15', end_date: '2026-03-18', type: 'routine_inspection', technician: 'HAL-9001' },
  { rocket_id: 'r005', rocket_name: 'Midnight Cruiser', start_date: '2026-03-20', end_date: '2026-03-22', type: 'engine_overhaul', technician: 'R2-D2' },
  { rocket_id: 'r008', rocket_name: 'Nova Royale', start_date: '2026-04-01', end_date: '2026-04-05', type: 'luxury_refit', technician: 'C-3PO' },
  { rocket_id: 'r001', rocket_name: 'Shooting Star IV', start_date: '2026-04-10', end_date: '2026-04-11', type: 'fuel_system_check', technician: 'HAL-9001' },
]

const ROCKET_STATUSES = ['operational', 'maintenance', 'fueling']

// GET /availability?rocketClass=&date=
router.get('/availability', (req, res) => {
  const start = Date.now()
  const { rocketClass, date } = req.query

  if (!rocketClass) {
    return res.status(400).json({ error: 'rocketClass query param required' })
  }

  const available = FLEET.filter(
    (r) => r.class === rocketClass && r.status === 'available'
  )

  const duration = Date.now() - start

  logger.info('Availability checked', {
    event_type: 'fleet_availability_checked',
    service: SERVICE_NAME,
    rocket_class: rocketClass,
    date,
    available_count: available.length,
    duration_ms: duration,
    status_code: 200,
  })

  res.json({
    available: available.length > 0,
    count: available.length,
    rocket_class: rocketClass,
    date: date || null,
    rockets: available.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity })),
  })
})

// POST /assign
router.post('/assign', (req, res) => {
  const start = Date.now()
  const { rocketClass } = req.body

  if (!rocketClass) {
    return res.status(400).json({ error: 'rocketClass required' })
  }

  const available = FLEET.filter(
    (r) => r.class === rocketClass && r.status === 'available'
  )

  if (available.length === 0) {
    logger.warn('No available rockets for class', {
      event_type: 'rocket_assignment_failed',
      service: SERVICE_NAME,
      rocket_class: rocketClass,
    })
    return res.status(409).json({
      error: 'No available rockets',
      message: `All ${rocketClass} rockets are currently occupied by other cosmic adventurers.`,
      rocket_class: rocketClass,
    })
  }

  // Pick a random available rocket
  const rocket = available[Math.floor(Math.random() * available.length)]
  const names = ROCKET_NAMES_BY_CLASS[rocketClass] || ROCKET_NAMES_BY_CLASS.economy
  const assignedName = names[Math.floor(Math.random() * names.length)]
  const duration = Date.now() - start

  logger.info('Rocket assigned', {
    event_type: 'rocket_assigned',
    service: SERVICE_NAME,
    rocket_id: rocket.id,
    rocket_name: assignedName,
    rocket_class: rocketClass,
    duration_ms: duration,
    status_code: 200,
  })

  res.json({
    success: true,
    rocket_id: rocket.id,
    rocket_name: assignedName,
    rocket_class: rocketClass,
    capacity: rocket.capacity,
    launch_pad: `Pad ${Math.floor(Math.random() * 12) + 1}`,
    assigned_at: new Date().toISOString(),
    fun_fact: getFunFact(rocketClass),
  })
})

// GET /fleet — list all rockets
router.get('/fleet', (req, res) => {
  const start = Date.now()
  const duration = Date.now() - start

  logger.info('Fleet listed', {
    event_type: 'fleet_listed',
    service: SERVICE_NAME,
    total: FLEET.length,
    duration_ms: duration,
    status_code: 200,
  })

  res.json({
    fleet: FLEET,
    total: FLEET.length,
    available: FLEET.filter((r) => r.status === 'available').length,
    in_flight: FLEET.filter((r) => r.status === 'in_flight').length,
    maintenance: FLEET.filter((r) => r.status === 'maintenance').length,
  })
})

// GET /rockets/:rocket_id/status — return rocket operational status
router.get('/rockets/:rocket_id/status', (req, res) => {
  const start = Date.now()
  const { rocket_id } = req.params

  const rocket = FLEET.find((r) => r.id === rocket_id)
  if (!rocket) {
    return res.status(404).json({ error: 'Rocket not found', rocket_id })
  }

  // Map fleet status or inject chaos-influenced randomness
  const chaosMode = getEffectiveChaosMode(req)
  let operationalStatus
  if (chaosMode === 'error' && Math.random() < 0.3) {
    operationalStatus = 'maintenance'
  } else if (rocket.status === 'available') {
    const rand = Math.random()
    operationalStatus = rand < 0.7 ? 'operational' : rand < 0.9 ? 'fueling' : 'maintenance'
  } else if (rocket.status === 'in_flight') {
    operationalStatus = 'operational'
  } else {
    operationalStatus = 'maintenance'
  }

  const duration = Date.now() - start

  logger.info('Rocket status fetched', {
    event_type: 'rocket_status_fetched',
    service: SERVICE_NAME,
    rocket_id,
    rocket_name: rocket.name,
    status: operationalStatus,
    duration_ms: duration,
    status_code: 200,
  })

  res.json({
    rocket_id,
    rocket_name: rocket.name,
    rocket_class: rocket.class,
    status: operationalStatus,
    status_label: rocket.status_label,
    checked_at: new Date().toISOString(),
  })
})

// GET /maintenance-schedule — upcoming maintenance windows
router.get('/maintenance-schedule', (req, res) => {
  const start = Date.now()
  const duration = Date.now() - start

  logger.info('Maintenance schedule fetched', {
    event_type: 'maintenance_schedule_fetched',
    service: SERVICE_NAME,
    window_count: MAINTENANCE_SCHEDULE.length,
    duration_ms: duration,
    status_code: 200,
  })

  res.json({
    schedule: MAINTENANCE_SCHEDULE,
    total: MAINTENANCE_SCHEDULE.length,
    fetched_at: new Date().toISOString(),
  })
})

// GET /crew/:pilot_name — get crew info for a pilot
router.get('/crew/:pilot_name', (req, res) => {
  const start = Date.now()
  const { pilot_name } = req.params

  const crew = CREW[pilot_name]
  if (!crew) {
    // Return a generated crew member for unknown pilots
    const generatedCrew = {
      name: pilot_name,
      callsign: `PILOT-${Math.floor(Math.random() * 900) + 100}`,
      missions: Math.floor(Math.random() * 50) + 1,
      rating: (3.5 + Math.random() * 1.5).toFixed(1),
      speciality: 'General space travel',
      status: 'available',
    }
    const duration = Date.now() - start
    logger.info('Crew info fetched (generated)', {
      event_type: 'crew_info_fetched',
      service: SERVICE_NAME,
      pilot_name,
      generated: true,
      duration_ms: duration,
      status_code: 200,
    })
    return res.json(generatedCrew)
  }

  const duration = Date.now() - start

  logger.info('Crew info fetched', {
    event_type: 'crew_info_fetched',
    service: SERVICE_NAME,
    pilot_name,
    missions: crew.missions,
    rating: crew.rating,
    duration_ms: duration,
    status_code: 200,
  })

  res.json(crew)
})

// Admin chaos control
router.post('/admin/chaos', (req, res) => {
  const { mode } = req.body
  const VALID_MODES = ['normal', 'slow', 'error', 'error-full']
  if (!VALID_MODES.includes(mode)) {
    return res.status(400).json({ error: 'Invalid chaos mode', valid: VALID_MODES })
  }
  runtimeChaosMode = mode
  logger.info('Chaos mode changed', { mode, service: SERVICE_NAME })
  res.json({ success: true, chaos_mode: mode, service: SERVICE_NAME })
})

router.get('/admin/chaos', (req, res) => {
  res.json({
    chaos_mode: runtimeChaosMode || process.env.CHAOS_MODE || 'normal',
    service: SERVICE_NAME,
  })
})

function getFunFact(rocketClass) {
  const facts = {
    economy: [
      "The Economy Pod was designed by the same team that made budget airline seats. You'll feel right at home.",
      "Window? What window? You have a very vivid imagination.",
      'Oxygen is extra. Just kidding. Probably.',
    ],
    business: [
      'The porthole window offers a stunning 4-inch view of the infinite cosmos.',
      'Freeze-dried meals prepared by a Michelin-starred chef (the freezing removed one of the stars).',
      'Your personal space is roughly the size of a generous closet. In Manhattan, this costs $4,000/month.',
    ],
    first_class: [
      'Your space butler has completed 3 spacewalks and a sommelier certification.',
      'WiFi speed: 2.4 Mbps. Latency: 22 minutes. Perfect for sending very patient emails.',
      'The private cabin includes a 18-inch porthole. For that price, it should be 18 feet.',
    ],
  }
  const arr = facts[rocketClass] || facts.economy
  return arr[Math.floor(Math.random() * arr.length)]
}

module.exports = router
module.exports.setChaosMode = (mode) => { runtimeChaosMode = mode }
module.exports.getChaosMode = () => runtimeChaosMode || process.env.CHAOS_MODE || 'normal'
