'use strict'

const axios = require('axios')
const logger = require('../logger')

const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:4002'

const client = axios.create({
  baseURL: PAYMENT_SERVICE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'x-source-service': 'cosmocab-booking',
  },
})

async function processPayment(bookingId, amountUsd, cardLastFour, chaosMode) {
  logger.info('Calling payment-service', {
    booking_id: bookingId,
    amount_usd: amountUsd,
    payment_service_url: PAYMENT_SERVICE_URL,
  })

  const headers = {}
  if (chaosMode) {
    headers['x-chaos-mode'] = chaosMode
  }

  const response = await client.post('/process', {
    booking_id: bookingId,
    amount_usd: amountUsd,
    card_last_four: cardLastFour || '0000',
  }, { headers })

  return response.data
}

module.exports = { processPayment }
