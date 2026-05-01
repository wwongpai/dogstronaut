'use strict'

const { Pool } = require('pg')
const logger = require('../logger')

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'cosmocab',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cosmocab',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { error: err.message })
})

pool.on('connect', () => {
  logger.debug('New database connection established')
})

module.exports = pool
