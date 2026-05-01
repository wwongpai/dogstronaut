'use strict'

const tracer = require('dd-trace')
const logger = require('../logger')

const SERVICE_NAME = 'dogstronaut-launch-control'

// Runtime chaos mode — can be changed via POST /admin/chaos without restart
let runtimeChaosMode = null

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getEffectiveChaosMode(req) {
  // Priority: X-Chaos-Mode header > runtime variable > CHAOS_MODE env
  return req.headers['x-chaos-mode'] || runtimeChaosMode || process.env.CHAOS_MODE || 'normal'
}

const ERROR_SCENARIOS = [
  {
    name: 'launch_window_blocked',
    status: 409,
    message: 'Launch window is blocked by scheduled traffic',
  },
  {
    name: 'weather_alert',
    status: 503,
    message: 'Weather alert: launch conditions unsafe',
  },
  {
    name: 'safety_clearance_failed',
    status: 403,
    message: 'Safety clearance denied by launch control authority',
  },
]

function chaosMiddleware(req, res, next) {
  // Skip chaos on health and admin endpoints
  if (req.path === '/health' || req.path.startsWith('/admin')) {
    return next()
  }

  const mode = getEffectiveChaosMode(req)

  if (mode === 'slow') {
    const delayMs = 2000 + Math.floor(Math.random() * 3000) // 2000-5000ms
    logger.warn('CHAOS: slow mode active — injecting delay', {
      event_type: 'chaos_slow_injected',
      service: SERVICE_NAME,
      chaos_mode: 'slow',
      delay_ms: delayMs,
      path: req.path,
    })
    sleep(delayMs).then(next)
  } else if (mode === 'error') {
    const shouldFail = Math.random() < 0.80 // 80% failure rate
    if (shouldFail) {
      const scenario = ERROR_SCENARIOS[Math.floor(Math.random() * ERROR_SCENARIOS.length)]
      const span = tracer.scope().active()
      if (span) {
        const err = new Error(scenario.message)
        err.name = scenario.name
        span.setTag('error', err)
        span.addTags({
          'chaos.scenario': scenario.name,
          'chaos.mode': 'error',
          'http.status_code': scenario.status,
        })
      }
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
    const span = tracer.scope().active()
    if (span) {
      const err = new Error(scenario.message)
      err.name = scenario.name
      span.setTag('error', err)
      span.addTags({
        'chaos.scenario': scenario.name,
        'chaos.mode': 'error-full',
        'http.status_code': scenario.status,
      })
    }
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

function setChaosMode(mode) {
  runtimeChaosMode = mode
  logger.info('Chaos mode updated', { mode })
}

function getChaosMode() {
  return runtimeChaosMode || process.env.CHAOS_MODE || 'normal'
}

module.exports = { chaosMiddleware, setChaosMode, getChaosMode }
