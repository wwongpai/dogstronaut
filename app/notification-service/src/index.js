'use strict'

// IMPORTANT: tracer must be the very first require
require('./tracer')

const tracer = require('dd-trace')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const { v4: uuidv4 } = require('uuid')
const logger = require('./logger')
const { chaosMiddleware, setChaosMode, getChaosMode } = require('./middleware/chaosMiddleware')

const PORT = parseInt(process.env.PORT || '4008', 10)
const SERVICE_NAME = 'dogstronaut-notification'
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

// POST /send — send booking confirmation notification
app.post('/send', (req, res) => {
  const start = Date.now()
  const { passenger_email, passenger_name, booking_id, destination_name } = req.body

  if (!passenger_email || !passenger_name || !booking_id || !destination_name) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['passenger_email', 'passenger_name', 'booking_id', 'destination_name'],
    })
  }

  const messageId = uuidv4()
  const duration = Date.now() - start

  logger.info('Booking confirmation notification sent', {
    event_type: 'notification_sent',
    service: SERVICE_NAME,
    booking_id,
    passenger_email,
    destination_name,
    message_id: messageId,
    channel: 'email',
    duration_ms: duration,
    status_code: 200,
  })

  res.json({
    sent: true,
    channel: 'email',
    message_id: messageId,
    recipient: passenger_email,
    booking_id,
  })
})

// GET /status/:messageId — check notification delivery status
app.get('/status/:messageId', (req, res) => {
  const { messageId } = req.params
  res.json({
    message_id: messageId,
    status: 'delivered',
    channel: 'email',
    delivered_at: new Date().toISOString(),
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
    message: 'Notification service encountered an unexpected error.',
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
  logger.info('Notification service started', {
    event_type: 'service_started',
    service: SERVICE_NAME,
    version: VERSION,
    port: PORT,
    env: process.env.DD_ENV || 'development',
  })
})

module.exports = app
