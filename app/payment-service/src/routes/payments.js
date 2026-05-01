'use strict'

const express = require('express')
const { v4: uuidv4 } = require('uuid')
const tracer = require('dd-trace')
const logger = require('../logger')

const router = express.Router()

const SERVICE_NAME = 'dogstronaut-payment'

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
    name: 'payment_gateway_timeout',
    status: 503,
    message: 'Payment gateway timeout after 30s',
  },
  {
    name: 'fraud_check_failed',
    status: 403,
    message: 'Transaction flagged by fraud detection system',
  },
  {
    name: 'insufficient_funds_simulation',
    status: 402,
    message: 'Insufficient funds for transaction amount',
  },
]

// Chaos middleware applied per-route (skip health/admin)
function applyChaos(req, res, next) {
  if (req.path === '/health' || req.path.startsWith('/admin')) {
    return next()
  }
  const mode = getEffectiveChaosMode(req)
  if (mode === 'slow') {
    const delayMs = 3000 + Math.floor(Math.random() * 5000)
    logger.warn('CHAOS: slow mode — payment gateway timeout simulation', {
      event_type: 'chaos_slow_injected',
      service: SERVICE_NAME,
      chaos_mode: 'slow',
      delay_ms: delayMs,
      path: req.path,
    })
    sleep(delayMs).then(next)
  } else if (mode === 'error') {
    const shouldFail = Math.random() < 0.4 // 40% failure rate
    if (shouldFail) {
      const scenario = ERROR_SCENARIOS[Math.floor(Math.random() * ERROR_SCENARIOS.length)]
      const cartValue = parseFloat(req.body && req.body.amount_usd) || 0
      // Tag the active span with cart value and mark as payment failure
      const span = tracer.scope().active()
      if (span) {
        span.setTag('payment.cart_value_usd', cartValue)
        span.setTag('payment.failed', true)
        span.setTag('payment.error_type', scenario.name)
        span.setTag('payment.chaos_mode', 'error')
        span.setTag('error', true); span.setTag('error.message', scenario.message)
      }
      logger.error('chaos error injected', {
        event_type: 'payment_failed',
        service: SERVICE_NAME,
        chaos_mode: 'error',
        http_status: scenario.status,
        path: req.path,
        error_type: scenario.name,
        cart_value_usd: cartValue,
        booking_id: req.body && req.body.booking_id,
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
    // 100% failure rate — used by chaos-error-30min.sh
    const scenario = ERROR_SCENARIOS[Math.floor(Math.random() * ERROR_SCENARIOS.length)]
    const cartValue = parseFloat(req.body && req.body.amount_usd) || 0
    // Tag the active span with cart value and mark as payment failure
    const span = tracer.scope().active()
    if (span) {
      span.setTag('payment.cart_value_usd', cartValue)
      span.setTag('payment.failed', true)
      span.setTag('payment.error_type', scenario.name)
      span.setTag('payment.chaos_mode', 'error-full')
      span.setTag('error', true); span.setTag('error.message', scenario.message)
    }
    logger.error('chaos error injected (100%)', {
      event_type: 'payment_failed',
      service: SERVICE_NAME,
      chaos_mode: 'error-full',
      http_status: scenario.status,
      path: req.path,
      error_type: scenario.name,
      cart_value_usd: cartValue,
      booking_id: req.body && req.body.booking_id,
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

// POST /process
router.post('/process', async (req, res) => {
  const start = Date.now()
  const { booking_id, amount_usd, card_last_four } = req.body

  if (!booking_id || !amount_usd) {
    return res.status(400).json({ error: 'booking_id and amount_usd are required' })
  }

  logger.info('Processing payment', {
    event_type: 'payment_processing',
    service: SERVICE_NAME,
    booking_id,
    amount_usd,
    card_last_four: card_last_four || '****',
    chaos_mode: getEffectiveChaosMode(req),
  })

  // Simulate a small network processing delay (realistic)
  await sleep(200 + Math.floor(Math.random() * 300))

  const transactionId = `TXN-${uuidv4().replace(/-/g, '').toUpperCase().slice(0, 16)}`
  const duration = Date.now() - start

  // Tag span with cart value and success outcome for APM analytics
  const span = tracer.scope().active()
  if (span) {
    span.setTag('payment.cart_value_usd', parseFloat(amount_usd) || 0)
    span.setTag('payment.transaction_id', transactionId)
    span.setTag('payment.booking_id', booking_id)
    span.setTag('payment.failed', false)
  }

  logger.info('Payment processed successfully', {
    event_type: 'payment_processed',
    service: SERVICE_NAME,
    booking_id,
    transaction_id: transactionId,
    amount_usd,
    card_last_four: card_last_four || '****',
    duration_ms: duration,
    status_code: 200,
  })

  res.json({
    success: true,
    transaction_id: transactionId,
    booking_id,
    amount_usd,
    status: 'completed',
    processed_at: new Date().toISOString(),
    card_last_four: card_last_four || '****',
    message: 'Payment accepted. Your financial recklessness has been recorded.',
  })
})

// POST /refund — refund a payment
router.post('/refund', async (req, res) => {
  const start = Date.now()
  const { transaction_id, reason } = req.body

  if (!transaction_id) {
    return res.status(400).json({ error: 'transaction_id is required' })
  }

  // Simulate processing delay
  await sleep(150 + Math.floor(Math.random() * 200))

  const refundId = `RFD-${uuidv4().replace(/-/g, '').toUpperCase().slice(0, 16)}`
  const duration = Date.now() - start

  logger.info('Payment refunded', {
    event_type: 'payment_refunded',
    service: SERVICE_NAME,
    transaction_id,
    refund_id: refundId,
    reason: reason || 'not specified',
    duration_ms: duration,
    status_code: 200,
  })

  res.json({
    success: true,
    refund_id: refundId,
    transaction_id,
    status: 'refunded',
    reason: reason || 'not specified',
    refunded_at: new Date().toISOString(),
  })
})

// GET /payments/:booking_id — get payment history for a booking
router.get('/payments/:booking_id', async (req, res) => {
  const start = Date.now()
  const { booking_id } = req.params

  // Mock payment history
  const mockHistory = [
    {
      transaction_id: `TXN-${booking_id.replace(/-/g, '').toUpperCase().slice(0, 16)}`,
      booking_id,
      amount_usd: 49999,
      status: 'completed',
      processed_at: new Date(Date.now() - 86400000).toISOString(),
      card_last_four: '4242',
    },
  ]

  const duration = Date.now() - start

  logger.info('Payment history fetched', {
    event_type: 'payment_history_fetched',
    service: SERVICE_NAME,
    booking_id,
    transaction_count: mockHistory.length,
    duration_ms: duration,
    status_code: 200,
  })

  res.json({
    booking_id,
    payments: mockHistory,
    total: mockHistory.length,
  })
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

module.exports = router
module.exports.setChaosMode = (mode) => { runtimeChaosMode = mode }
module.exports.getChaosMode = () => runtimeChaosMode || process.env.CHAOS_MODE || 'normal'
