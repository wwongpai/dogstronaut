'use strict'

const express = require('express')
const pool = require('../db/client')
const logger = require('../logger')
const paymentClient = require('../services/paymentClient')

const router = express.Router()

// POST /api/payments/process — proxy to payment-service
router.post('/process', async (req, res) => {
  const { booking_id, amount_usd, card_last_four } = req.body

  if (!booking_id || !amount_usd) {
    return res.status(400).json({ error: 'booking_id and amount_usd are required' })
  }

  logger.info('Processing payment via payment-service', { booking_id, amount_usd })

  // Forward chaos header if present
  const chaosMode = req.headers['x-chaos-mode'] || process.env.CHAOS_MODE
  try {
    const result = await paymentClient.processPayment(booking_id, amount_usd, card_last_four, chaosMode)

    // Update booking status to paid
    try {
      await pool.query(
        'UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2',
        ['paid', booking_id]
      )

      // Record payment
      await pool.query(
        `INSERT INTO payments (booking_id, amount_usd, status, transaction_id, card_last_four, processed_at)
         VALUES ($1, $2, 'completed', $3, $4, NOW())`,
        [booking_id, amount_usd, result.transaction_id, card_last_four || '0000']
      )
    } catch (dbErr) {
      logger.warn('Failed to update booking/payment records after payment success', { error: dbErr.message })
    }

    logger.info('Payment processed successfully', {
      booking_id,
      transaction_id: result.transaction_id,
      amount_usd,
    })

    res.json(result)
  } catch (err) {
    logger.error('Payment processing failed', { booking_id, error: err.message })
    const statusCode = err.response?.status || 500
    const errorMsg = err.response?.data?.error || err.message || 'Payment processing failed'
    res.status(statusCode).json({ error: errorMsg })
  }
})

module.exports = router
