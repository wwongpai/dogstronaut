'use strict'

const express = require('express')
const pool = require('../db/client')
const logger = require('../logger')

const router = express.Router()

// GET /api/destinations
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM destinations ORDER BY price_usd ASC'
    )
    logger.info('Destinations fetched', { count: result.rows.length })
    res.json(result.rows)
  } catch (err) {
    logger.error('Failed to fetch destinations', { error: err.message })
    res.status(500).json({ error: 'Failed to fetch destinations', message: err.message })
  }
})

// GET /api/destinations/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params
  try {
    const result = await pool.query('SELECT * FROM destinations WHERE id = $1', [id])
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Destination not found', id })
    }
    res.json(result.rows[0])
  } catch (err) {
    logger.error('Failed to fetch destination', { id, error: err.message })
    res.status(500).json({ error: 'Failed to fetch destination', message: err.message })
  }
})

module.exports = router
