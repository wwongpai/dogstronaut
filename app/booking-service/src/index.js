'use strict'

// IMPORTANT: tracer must be the very first require
require('./tracer')

const tracer = require('dd-trace')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const logger = require('./logger')
const { runMigrations } = require('./db/migrations')
const { chaosMiddleware, setChaosMode, getChaosMode } = require('./middleware/chaosMiddleware')
const destinationsRouter = require('./routes/destinations')
const bookingsRouter = require('./routes/bookings')
const paymentsRouter = require('./routes/payments')

const PORT = parseInt(process.env.PORT || '4001', 10)
const SERVICE_NAME = 'dogstronaut-booking'
const VERSION = process.env.DD_VERSION || '1.0.0'

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

// Routes
app.use('/api/destinations', destinationsRouter)
app.use('/api/bookings', bookingsRouter)
app.use('/api/payments', paymentsRouter)

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `${req.method} ${req.path} does not exist. Even in space, some routes are undefined.`,
  })
})

// Global error handler — records unhandled exceptions on the active span
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
    message: 'Houston, we have a problem. Check the logs.',
  })
})

// Capture process-level uncaught exceptions and unhandled rejections on the active span
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

// Boot
async function start() {
  try {
    await runMigrations()
    app.listen(PORT, '0.0.0.0', () => {
      logger.info('Booking service started', {
        event_type: 'service_started',
        service: SERVICE_NAME,
        version: VERSION,
        port: PORT,
        env: process.env.DD_ENV || 'development',
      })
    })
  } catch (err) {
    logger.error('Failed to start booking service', {
      event_type: 'service_start_failed',
      service: SERVICE_NAME,
      error: err.message,
    })
    process.exit(1)
  }
}

start()

module.exports = app
