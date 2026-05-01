'use strict'

// IMPORTANT: tracer must be the very first require
require('./tracer')

const tracer = require('dd-trace')
const express = require('express')
const logger = require('./logger')
const paymentsRouter = require('./routes/payments')

const PORT = parseInt(process.env.PORT || '4002', 10)
const SERVICE_NAME = 'dogstronaut-payment'
const VERSION = process.env.DD_VERSION || '1.0.0'

const app = express()

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Chaos-Mode, x-chaos-mode, x-datadog-trace-id, x-datadog-parent-id, x-datadog-sampling-priority, x-datadog-origin, x-datadog-tags, traceparent, tracestate')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// Request logging
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
    })
  })
  next()
})

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: SERVICE_NAME,
    version: VERSION,
    env: process.env.DD_ENV || 'development',
    chaos_mode: paymentsRouter.getChaosMode(),
    timestamp: new Date().toISOString(),
  })
})

// Routes
app.use('/', paymentsRouter)

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path })
})

// Error handler — records unhandled exceptions on the active span
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
  })
  res.status(500).json({ error: 'Internal Server Error', message: err.message })
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
  logger.info('Payment service started', {
    event_type: 'service_started',
    service: SERVICE_NAME,
    version: VERSION,
    port: PORT,
    env: process.env.DD_ENV || 'development',
  })
})

module.exports = app
