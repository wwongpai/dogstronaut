'use strict'

// IMPORTANT: tracer must be the very first require
require('./tracer')

const tracer = require('dd-trace')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const logger = require('./logger')
const { chaosMiddleware, setChaosMode, getChaosMode } = require('./middleware/chaosMiddleware')

const PORT = parseInt(process.env.PORT || '4006', 10)
const SERVICE_NAME = 'dogstronaut-loyalty'
const VERSION = process.env.DD_VERSION || '1.0.0'

// Simulate loyalty tier lookup by email domain / pattern
function getLoyaltyTier(email) {
  const hash = email.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const tiers = ['new', 'bronze', 'silver', 'gold']
  return tiers[hash % tiers.length]
}

const TIER_CONFIG = {
  gold:   { discount_pct: 15, points_multiplier: 3 },
  silver: { discount_pct: 10, points_multiplier: 2 },
  bronze: { discount_pct: 5,  points_multiplier: 1.5 },
  new:    { discount_pct: 0,  points_multiplier: 1 },
}

const app = express()

// Security headers (permissive for demo)
app.use(helmet({ contentSecurityPolicy: false }))

// CORS — allow all origins for demo
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'Authorization', 'X-Chaos-Mode', 'x-chaos-mode',
    'x-datadog-trace-id', 'x-datadog-parent-id', 'x-datadog-sampling-priority',
    'x-datadog-origin', 'x-datadog-tags', 'traceparent', 'tracestate',
  ],
}))

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
    logger[level]('HTTP request', {
      event_type: 'http_request',
      service: SERVICE_NAME,
      method: req.method,
      path: req.path,
      status_code: res.statusCode,
      duration_ms: duration,
      user_agent: req.headers['user-agent'],
      remote_ip: req.ip,
    })
  })
  next()
})

// Chaos engineering middleware
app.use(chaosMiddleware)

// Health check (before routes)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: SERVICE_NAME,
    version: VERSION,
    env: process.env.DD_ENV || 'development',
    chaos_mode: getChaosMode(),
    timestamp: new Date().toISOString(),
  })
})

// Admin chaos endpoints
app.get('/admin/chaos', (req, res) => {
  res.json({
    chaos_mode: getChaosMode(),
    service: SERVICE_NAME,
  })
})

app.post('/admin/chaos', (req, res) => {
  const { mode } = req.body
  const VALID_MODES = ['normal', 'slow', 'error', 'error-full']
  if (!VALID_MODES.includes(mode)) {
    return res.status(400).json({ error: 'Invalid chaos mode', valid: VALID_MODES })
  }
  setChaosMode(mode)
  logger.info('Chaos mode changed via admin endpoint', { mode, service: SERVICE_NAME })
  res.json({ success: true, chaos_mode: mode, service: SERVICE_NAME })
})

// POST /check — check loyalty tier and calculate discount + points
app.post('/check', (req, res) => {
  const start = Date.now()
  const { passenger_email, total_price_usd } = req.body

  if (!passenger_email || total_price_usd === undefined) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['passenger_email', 'total_price_usd'],
    })
  }

  const tier = getLoyaltyTier(passenger_email)
  const config = TIER_CONFIG[tier]
  const pointsEarned = Math.round(parseFloat(total_price_usd) * config.points_multiplier)
  const duration = Date.now() - start

  logger.info('Loyalty check completed', {
    event_type: 'loyalty_checked',
    service: SERVICE_NAME,
    passenger_email,
    tier,
    discount_pct: config.discount_pct,
    points_earned: pointsEarned,
    duration_ms: duration,
    status_code: 200,
  })

  res.json({
    tier,
    discount_pct: config.discount_pct,
    points_earned: pointsEarned,
    passenger_email,
  })
})

// GET /tiers — return tier configuration
app.get('/tiers', (req, res) => {
  res.json({
    tiers: Object.entries(TIER_CONFIG).map(([name, cfg]) => ({
      name,
      discount_pct: cfg.discount_pct,
      points_multiplier: cfg.points_multiplier,
    })),
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `${req.method} ${req.path} does not exist.`,
  })
})

// Global error handler
app.use((err, req, res, next) => {
  const span = tracer.scope().active()
  if (span) {
    span.setTag('error', err)
  }
  logger.error('Unhandled error', {
    event_type: 'unhandled_error',
    service: SERVICE_NAME,
    error: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
  })
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'Loyalty service encountered an unexpected error.',
  })
})

process.on('uncaughtException', (err) => {
  const span = tracer.scope().active()
  if (span) {
    span.setTag('error', err)
  }
  logger.error('Uncaught exception', {
    event_type: 'uncaught_exception',
    service: SERVICE_NAME,
    error: err.message,
    stack: err.stack,
  })
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  const span = tracer.scope().active()
  if (span) {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    span.setTag('error', err)
  }
  logger.error('Unhandled promise rejection', {
    event_type: 'unhandled_rejection',
    service: SERVICE_NAME,
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  })
})

app.listen(PORT, '0.0.0.0', () => {
  logger.info('Loyalty service started', {
    event_type: 'service_started',
    service: SERVICE_NAME,
    version: VERSION,
    port: PORT,
    env: process.env.DD_ENV || 'development',
  })
})

module.exports = app
