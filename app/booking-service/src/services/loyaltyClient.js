'use strict'

const axios = require('axios')
const logger = require('../logger')

const LOYALTY_SERVICE_URL = process.env.LOYALTY_SERVICE_URL || 'http://localhost:4006'

const client = axios.create({
  baseURL: LOYALTY_SERVICE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'x-source-service': 'dogstronaut-booking',
  },
})

async function checkLoyalty(passengerEmail, totalPriceUsd) {
  logger.info('Checking loyalty tier', { passenger_email: passengerEmail, total_price_usd: totalPriceUsd })
  const response = await client.post('/check', {
    passenger_email: passengerEmail,
    total_price_usd: totalPriceUsd,
  })
  return response.data
}

module.exports = { checkLoyalty }
