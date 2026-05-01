'use strict'

const express = require('express')
const pool = require('../db/client')
const logger = require('../logger')
const fleetClient = require('../services/fleetClient')
const seatCheckClient = require('../services/seatCheckClient')
const loyaltyClient = require('../services/loyaltyClient')
const launchControlClient = require('../services/launchControlClient')
const notificationClient = require('../services/notificationClient')

const router = express.Router()

const SERVICE_NAME = 'dogstronaut-booking'

// POST /api/bookings — create a new booking
router.post('/', async (req, res) => {
  const start = Date.now()
  const {
    destination_id,
    passenger_name,
    passenger_email,
    departure_date,
    rocket_class,
    pilot_name,
    total_price_usd,
  } = req.body

  // Basic validation
  if (!destination_id || !passenger_name || !passenger_email || !departure_date || !rocket_class || !pilot_name) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['destination_id', 'passenger_name', 'passenger_email', 'departure_date', 'rocket_class', 'pilot_name'],
    })
  }

  logger.info('Creating new booking', {
    event_type: 'booking_creating',
    service: SERVICE_NAME,
    destination_id,
    passenger_email,
    rocket_class,
    pilot_name,
    total_price_usd,
  })

  let dbClient
  try {
    dbClient = await pool.connect()

    // Check destination exists
    const destResult = await dbClient.query('SELECT * FROM destinations WHERE id = $1', [destination_id])
    if (destResult.rows.length === 0) {
      return res.status(404).json({ error: 'Destination not found', destination_id })
    }
    const destination = destResult.rows[0]

    // 1. Check seat inventory (non-blocking)
    let seatCheckResult = null
    try {
      seatCheckResult = await seatCheckClient.checkSeats(rocket_class, departure_date, 1)
      logger.info('Seat check completed', {
        event_type: 'seat_check_completed',
        service: SERVICE_NAME,
        available: seatCheckResult?.available,
        seats_remaining: seatCheckResult?.seats_remaining,
        rocket_class,
      })
    } catch (seatErr) {
      logger.warn('Seat check service unavailable — proceeding without seat validation', {
        event_type: 'seat_check_unavailable',
        service: SERVICE_NAME,
        error: seatErr.message,
      })
    }

    // 2. Check loyalty tier and award points (non-blocking)
    let loyaltyResult = null
    try {
      const finalPriceForLoyalty = total_price_usd || parseFloat(destination.price_usd)
      loyaltyResult = await loyaltyClient.checkLoyalty(passenger_email, finalPriceForLoyalty)
      logger.info('Loyalty check completed', {
        event_type: 'loyalty_check_completed',
        service: SERVICE_NAME,
        tier: loyaltyResult?.tier,
        discount_pct: loyaltyResult?.discount_pct,
        points_earned: loyaltyResult?.points_earned,
        passenger_email,
      })
    } catch (loyaltyErr) {
      logger.warn('Loyalty service unavailable — proceeding without loyalty check', {
        event_type: 'loyalty_service_unavailable',
        service: SERVICE_NAME,
        error: loyaltyErr.message,
      })
    }

    // 3. Validate launch window and safety clearance (non-blocking)
    let launchControlResult = null
    try {
      launchControlResult = await launchControlClient.validateLaunch(destination_id, departure_date, rocket_class)
      logger.info('Launch control validated', {
        event_type: 'launch_control_validated',
        service: SERVICE_NAME,
        approved: launchControlResult?.approved,
        launch_window: launchControlResult?.launch_window,
        weather_status: launchControlResult?.weather_status,
        destination_id,
      })
    } catch (launchErr) {
      logger.warn('Launch control service unavailable — proceeding without launch validation', {
        event_type: 'launch_control_unavailable',
        service: SERVICE_NAME,
        error: launchErr.message,
      })
    }

    // 4. Check fleet availability (non-blocking — log warning if fails)
    let rocketAssignment = null
    try {
      const availability = await fleetClient.checkAvailability(rocket_class, departure_date)
      if (availability.available) {
        rocketAssignment = await fleetClient.assignRocket(rocket_class)
        logger.info('Rocket assigned', {
          event_type: 'rocket_assigned',
          service: SERVICE_NAME,
          rocket: rocketAssignment?.rocket_name,
          rocket_class,
        })
      } else {
        logger.warn('No rocket available for requested class/date', {
          event_type: 'rocket_unavailable',
          service: SERVICE_NAME,
          rocket_class,
          departure_date,
        })
      }
    } catch (fleetErr) {
      logger.warn('Fleet service unavailable — proceeding without rocket assignment', {
        event_type: 'fleet_service_unavailable',
        service: SERVICE_NAME,
        error: fleetErr.message,
      })
    }

    // Calculate final price
    const finalPrice = total_price_usd || parseFloat(destination.price_usd)

    // Insert booking
    const insertResult = await dbClient.query(
      `INSERT INTO bookings (destination_id, passenger_name, passenger_email, rocket_class, pilot_name, departure_date, status, total_price_usd)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       RETURNING *`,
      [destination_id, passenger_name, passenger_email, rocket_class, pilot_name, departure_date, finalPrice]
    )

    const booking = insertResult.rows[0]

    // 6. Send booking confirmation notification (non-blocking — after booking is persisted)
    try {
      await notificationClient.sendNotification(
        passenger_email,
        passenger_name,
        booking.id,
        destination.name
      )
      logger.info('Booking confirmation notification sent', {
        event_type: 'notification_sent',
        service: SERVICE_NAME,
        booking_id: booking.id,
        passenger_email,
      })
    } catch (notifErr) {
      logger.warn('Notification service unavailable — booking confirmed without notification', {
        event_type: 'notification_unavailable',
        service: SERVICE_NAME,
        booking_id: booking.id,
        error: notifErr.message,
      })
    }

    const duration = Date.now() - start

    logger.info('Booking created successfully', {
      event_type: 'booking_created',
      service: SERVICE_NAME,
      booking_id: booking.id,
      destination_id,
      passenger_email,
      total_price_usd: finalPrice,
      rocket: rocketAssignment?.rocket_name,
      loyalty_tier: loyaltyResult?.tier,
      launch_window: launchControlResult?.launch_window,
      duration_ms: duration,
      status_code: 201,
    })

    res.status(201).json({
      ...booking,
      destination,
      rocket_assignment: rocketAssignment,
    })
  } catch (err) {
    logger.error('Failed to create booking', {
      event_type: 'booking_creation_failed',
      service: SERVICE_NAME,
      error: err.message,
      stack: err.stack,
    })
    res.status(500).json({ error: 'Failed to create booking', message: err.message })
  } finally {
    if (dbClient) dbClient.release()
  }
})

// GET /api/bookings — list all bookings (supports query params: destination_id, status, passenger_email)
router.get('/', async (req, res) => {
  const start = Date.now()
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200)
    const offset = parseInt(req.query.offset || '0', 10)
    const { destination_id, status, passenger_email } = req.query

    const conditions = []
    const params = []
    let paramIdx = 1

    if (destination_id) {
      conditions.push(`b.destination_id = $${paramIdx++}`)
      params.push(destination_id)
    }
    if (status) {
      conditions.push(`b.status = $${paramIdx++}`)
      params.push(status)
    }
    if (passenger_email) {
      conditions.push(`b.passenger_email = $${paramIdx++}`)
      params.push(passenger_email)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await pool.query(
      `SELECT b.*, d.name as destination_name, d.emoji as destination_emoji
       FROM bookings b
       LEFT JOIN destinations d ON b.destination_id = d.id
       ${whereClause}
       ORDER BY b.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    )

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM bookings b ${whereClause}`,
      params
    )

    const duration = Date.now() - start

    logger.info('Bookings listed', {
      event_type: 'bookings_listed',
      service: SERVICE_NAME,
      count: result.rows.length,
      filters: { destination_id, status, passenger_email },
      duration_ms: duration,
      status_code: 200,
    })

    res.json({
      bookings: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      limit,
      offset,
    })
  } catch (err) {
    logger.error('Failed to list bookings', {
      event_type: 'bookings_list_failed',
      service: SERVICE_NAME,
      error: err.message,
    })
    res.status(500).json({ error: 'Failed to list bookings', message: err.message })
  }
})

// GET /api/bookings/:id
router.get('/:id', async (req, res) => {
  const start = Date.now()
  const { id } = req.params
  try {
    const result = await pool.query(
      `SELECT b.*, d.name as destination_name, d.emoji as destination_emoji, d.tagline as destination_tagline
       FROM bookings b
       LEFT JOIN destinations d ON b.destination_id = d.id
       WHERE b.id = $1`,
      [id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found', id })
    }
    const duration = Date.now() - start
    logger.info('Booking fetched', {
      event_type: 'booking_fetched',
      service: SERVICE_NAME,
      booking_id: id,
      duration_ms: duration,
      status_code: 200,
    })
    res.json(result.rows[0])
  } catch (err) {
    logger.error('Failed to fetch booking', {
      event_type: 'booking_fetch_failed',
      service: SERVICE_NAME,
      booking_id: id,
      error: err.message,
    })
    res.status(500).json({ error: 'Failed to fetch booking', message: err.message })
  }
})

// GET /api/bookings/:id/status — get just the status of a booking
router.get('/:id/status', async (req, res) => {
  const start = Date.now()
  const { id } = req.params
  try {
    const result = await pool.query(
      'SELECT id, status, updated_at FROM bookings WHERE id = $1',
      [id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found', id })
    }
    const booking = result.rows[0]
    const duration = Date.now() - start

    logger.info('Booking status fetched', {
      event_type: 'booking_status_fetched',
      service: SERVICE_NAME,
      booking_id: id,
      status: booking.status,
      duration_ms: duration,
      status_code: 200,
    })

    res.json({
      booking_id: booking.id,
      status: booking.status,
      updated_at: booking.updated_at,
    })
  } catch (err) {
    logger.error('Failed to fetch booking status', {
      event_type: 'booking_status_fetch_failed',
      service: SERVICE_NAME,
      booking_id: id,
      error: err.message,
    })
    res.status(500).json({ error: 'Failed to fetch booking status', message: err.message })
  }
})

// DELETE /api/bookings/:id — cancel a booking
router.delete('/:id', async (req, res) => {
  const start = Date.now()
  const { id } = req.params
  try {
    const result = await pool.query(
      `UPDATE bookings SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found', id })
    }
    const booking = result.rows[0]
    const duration = Date.now() - start

    logger.info('Booking cancelled', {
      event_type: 'booking_cancelled',
      service: SERVICE_NAME,
      booking_id: id,
      passenger_email: booking.passenger_email,
      destination_id: booking.destination_id,
      duration_ms: duration,
      status_code: 200,
    })

    res.json({
      success: true,
      booking_id: id,
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    })
  } catch (err) {
    logger.error('Failed to cancel booking', {
      event_type: 'booking_cancellation_failed',
      service: SERVICE_NAME,
      booking_id: id,
      error: err.message,
    })
    res.status(500).json({ error: 'Failed to cancel booking', message: err.message })
  }
})

// PATCH /api/bookings/:id/status — update booking status
router.patch('/:id/status', async (req, res) => {
  const start = Date.now()
  const { id } = req.params
  const { status } = req.body

  const VALID_STATUSES = ['pending', 'confirmed', 'paid', 'cancelled', 'launched']
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status', valid: VALID_STATUSES })
  }

  try {
    const result = await pool.query(
      'UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found', id })
    }
    const duration = Date.now() - start

    logger.info('Booking status updated', {
      event_type: 'booking_status_updated',
      service: SERVICE_NAME,
      booking_id: id,
      status,
      duration_ms: duration,
      status_code: 200,
    })

    res.json(result.rows[0])
  } catch (err) {
    logger.error('Failed to update booking status', {
      event_type: 'booking_status_update_failed',
      service: SERVICE_NAME,
      booking_id: id,
      error: err.message,
    })
    res.status(500).json({ error: 'Failed to update booking', message: err.message })
  }
})

module.exports = router
