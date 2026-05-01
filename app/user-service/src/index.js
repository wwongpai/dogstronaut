'use strict'

// IMPORTANT: tracer must be the very first require
require('./tracer')

const tracer = require('dd-trace')

const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const { v4: uuidv4 } = require('uuid')
const logger = require('./logger')
const pool = require('./db/client')
const { chaosMiddleware, setChaosMode, getChaosMode } = require('./middleware/chaosMiddleware')

const PORT = parseInt(process.env.PORT || '4004', 10)
const SERVICE_NAME = 'dogstronaut-user'
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

// GET /users/leaderboard — top 10 users by loyalty points (defined before /:id to avoid route conflict)
app.get('/users/leaderboard', async (req, res) => {
  const start = Date.now()
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, lp.points, u.created_at
       FROM users u
       JOIN loyalty_points lp ON u.id = lp.user_id
       ORDER BY lp.points DESC
       LIMIT 10`
    )
    const duration = Date.now() - start

    logger.info('Leaderboard fetched', {
      event_type: 'leaderboard_fetched',
      service: SERVICE_NAME,
      count: result.rows.length,
      duration_ms: duration,
      status_code: 200,
    })

    res.json({
      leaderboard: result.rows.map((row, idx) => ({ rank: idx + 1, ...row })),
      total: result.rows.length,
      fetched_at: new Date().toISOString(),
    })
  } catch (err) {
    logger.error('Failed to fetch leaderboard', {
      event_type: 'leaderboard_fetch_failed',
      service: SERVICE_NAME,
      error: err.message,
    })
    res.status(500).json({ error: 'Failed to fetch leaderboard', message: err.message })
  }
})

// POST /users — create user
app.post('/users', async (req, res) => {
  const start = Date.now()
  const { name, email } = req.body

  if (!name || !email) {
    return res.status(400).json({ error: 'name and email are required' })
  }

  let dbClient
  try {
    dbClient = await pool.connect()

    const result = await dbClient.query(
      `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *`,
      [name, email]
    )
    const user = result.rows[0]

    // Insert loyalty_points row with 1000 starting points
    await dbClient.query(
      `INSERT INTO loyalty_points (user_id, points) VALUES ($1, 1000)`,
      [user.id]
    )

    const duration = Date.now() - start

    logger.info('User created', {
      event_type: 'user_created',
      service: SERVICE_NAME,
      user_id: user.id,
      email: user.email,
      duration_ms: duration,
      status_code: 201,
    })

    res.status(201).json({ ...user, loyalty_points: 1000 })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already exists', email })
    }
    logger.error('Failed to create user', {
      event_type: 'user_creation_failed',
      service: SERVICE_NAME,
      error: err.message,
    })
    res.status(500).json({ error: 'Failed to create user', message: err.message })
  } finally {
    if (dbClient) dbClient.release()
  }
})

// GET /users/:id — get user profile
app.get('/users/:id', async (req, res) => {
  const start = Date.now()
  const { id } = req.params

  try {
    const result = await pool.query(
      `SELECT u.*, lp.points as loyalty_points, lp.updated_at as loyalty_updated_at
       FROM users u
       LEFT JOIN loyalty_points lp ON u.id = lp.user_id
       WHERE u.id = $1`,
      [id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found', id })
    }

    const duration = Date.now() - start

    logger.info('User profile fetched', {
      event_type: 'user_profile_fetched',
      service: SERVICE_NAME,
      user_id: id,
      duration_ms: duration,
      status_code: 200,
    })

    res.json(result.rows[0])
  } catch (err) {
    logger.error('Failed to fetch user profile', {
      event_type: 'user_profile_fetch_failed',
      service: SERVICE_NAME,
      user_id: id,
      error: err.message,
    })
    res.status(500).json({ error: 'Failed to fetch user profile', message: err.message })
  }
})

// PATCH /users/:id — update user profile
app.patch('/users/:id', async (req, res) => {
  const start = Date.now()
  const { id } = req.params
  const { name, email } = req.body

  if (!name && !email) {
    return res.status(400).json({ error: 'At least one field (name, email) is required' })
  }

  try {
    const fields = []
    const values = []
    let paramIdx = 1

    if (name) {
      fields.push(`name = $${paramIdx++}`)
      values.push(name)
    }
    if (email) {
      fields.push(`email = $${paramIdx++}`)
      values.push(email)
    }
    values.push(id)

    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found', id })
    }

    const duration = Date.now() - start

    logger.info('User profile updated', {
      event_type: 'user_profile_updated',
      service: SERVICE_NAME,
      user_id: id,
      updated_fields: Object.keys(req.body),
      duration_ms: duration,
      status_code: 200,
    })

    res.json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already exists', email })
    }
    logger.error('Failed to update user profile', {
      event_type: 'user_profile_update_failed',
      service: SERVICE_NAME,
      user_id: id,
      error: err.message,
    })
    res.status(500).json({ error: 'Failed to update user profile', message: err.message })
  }
})

// GET /users/:id/loyalty — get loyalty points balance
app.get('/users/:id/loyalty', async (req, res) => {
  const start = Date.now()
  const { id } = req.params

  try {
    const result = await pool.query(
      `SELECT lp.points, lp.updated_at, u.name, u.email
       FROM loyalty_points lp
       JOIN users u ON lp.user_id = u.id
       WHERE lp.user_id = $1`,
      [id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found', id })
    }

    const row = result.rows[0]
    const duration = Date.now() - start

    logger.info('Loyalty points fetched', {
      event_type: 'loyalty_points_fetched',
      service: SERVICE_NAME,
      user_id: id,
      points: row.points,
      duration_ms: duration,
      status_code: 200,
    })

    res.json({
      user_id: id,
      name: row.name,
      email: row.email,
      points: row.points,
      updated_at: row.updated_at,
    })
  } catch (err) {
    logger.error('Failed to fetch loyalty points', {
      event_type: 'loyalty_points_fetch_failed',
      service: SERVICE_NAME,
      user_id: id,
      error: err.message,
    })
    res.status(500).json({ error: 'Failed to fetch loyalty points', message: err.message })
  }
})

// POST /users/:id/loyalty/redeem — deduct loyalty points
app.post('/users/:id/loyalty/redeem', async (req, res) => {
  const start = Date.now()
  const { id } = req.params
  const { points } = req.body

  if (!points || typeof points !== 'number' || points <= 0) {
    return res.status(400).json({ error: 'points must be a positive number' })
  }

  let dbClient
  try {
    dbClient = await pool.connect()

    // Check current balance
    const balanceResult = await dbClient.query(
      'SELECT points FROM loyalty_points WHERE user_id = $1',
      [id]
    )

    if (balanceResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found', id })
    }

    const currentPoints = balanceResult.rows[0].points
    if (currentPoints < points) {
      return res.status(422).json({
        error: 'Insufficient loyalty points',
        current_points: currentPoints,
        requested_points: points,
      })
    }

    const result = await dbClient.query(
      `UPDATE loyalty_points SET points = points - $1, updated_at = NOW()
       WHERE user_id = $2 RETURNING points`,
      [points, id]
    )

    const newBalance = result.rows[0].points
    const duration = Date.now() - start

    logger.info('Loyalty points redeemed', {
      event_type: 'loyalty_points_redeemed',
      service: SERVICE_NAME,
      user_id: id,
      points_redeemed: points,
      new_balance: newBalance,
      duration_ms: duration,
      status_code: 200,
    })

    res.json({
      user_id: id,
      points_redeemed: points,
      new_balance: newBalance,
      redeemed_at: new Date().toISOString(),
    })
  } catch (err) {
    logger.error('Failed to redeem loyalty points', {
      event_type: 'loyalty_points_redeem_failed',
      service: SERVICE_NAME,
      user_id: id,
      error: err.message,
    })
    res.status(500).json({ error: 'Failed to redeem loyalty points', message: err.message })
  } finally {
    if (dbClient) dbClient.release()
  }
})

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

// DB schema init
async function initDb() {
  const client = await pool.connect()
  try {
    logger.info('Initializing user-service database schema...')

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS loyalty_points (
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        points INTEGER DEFAULT 1000,
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (user_id)
      )
    `)

    logger.info('Database schema ready')

    // Pre-populate demo users (Premier League players)
    const DEMO_USERS = [
      { name: 'Salah', email: 'salah@epl.io' },
      { name: 'Haaland', email: 'haaland@epl.io' },
      { name: 'Saka', email: 'saka@epl.io' },
      { name: 'Rashford', email: 'rashford@epl.io' },
      { name: 'Bellingham', email: 'bellingham@epl.io' },
      { name: 'Palmer', email: 'palmer@epl.io' },
      { name: 'Watkins', email: 'watkins@epl.io' },
      { name: 'Mbeumo', email: 'mbeumo@epl.io' },
      { name: 'Isak', email: 'isak@epl.io' },
      { name: 'Trippier', email: 'trippier@epl.io' },
      { name: 'Bruno', email: 'bruno@epl.io' },
      { name: 'Foden', email: 'foden@epl.io' },
      { name: 'Rice', email: 'rice@epl.io' },
      { name: 'Gordon', email: 'gordon@epl.io' },
      { name: 'Son', email: 'son@epl.io' },
      { name: 'Maddison', email: 'maddison@epl.io' },
      { name: 'VanDijk', email: 'vandijk@epl.io' },
      { name: 'Alisson', email: 'alisson@epl.io' },
      { name: 'Odegaard', email: 'odegaard@epl.io' },
      { name: 'Trent', email: 'trent@epl.io' },
    ]

    let insertedCount = 0
    for (const user of DEMO_USERS) {
      const result = await client.query(
        `INSERT INTO users (name, email) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id`,
        [user.name, user.email]
      )
      if (result.rows.length > 0) {
        const userId = result.rows[0].id
        // Assign random starting loyalty points between 500-5000
        const startingPoints = 500 + Math.floor(Math.random() * 4501)
        await client.query(
          `INSERT INTO loyalty_points (user_id, points) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
          [userId, startingPoints]
        )
        insertedCount++
      }
    }

    if (insertedCount > 0) {
      logger.info('Demo users seeded', {
        event_type: 'demo_users_seeded',
        service: SERVICE_NAME,
        count: insertedCount,
      })
    } else {
      logger.info('Demo users already exist, skipping seed', { service: SERVICE_NAME })
    }
  } catch (err) {
    logger.error('Database initialization failed', {
      event_type: 'db_init_failed',
      service: SERVICE_NAME,
      error: err.message,
      stack: err.stack,
    })
    throw err
  } finally {
    client.release()
  }
}

// Boot
async function start() {
  try {
    await initDb()
    app.listen(PORT, '0.0.0.0', () => {
      logger.info('User service started', {
        event_type: 'service_started',
        service: SERVICE_NAME,
        version: VERSION,
        port: PORT,
        env: process.env.DD_ENV || 'development',
      })
    })
  } catch (err) {
    logger.error('Failed to start user service', {
      event_type: 'service_start_failed',
      service: SERVICE_NAME,
      error: err.message,
    })
    process.exit(1)
  }
}

start()

module.exports = app
