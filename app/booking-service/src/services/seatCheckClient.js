'use strict'

const axios = require('axios')
const logger = require('../logger')

const SEAT_CHECK_SERVICE_URL = process.env.SEAT_CHECK_SERVICE_URL || 'http://localhost:4005'

const client = axios.create({
  baseURL: SEAT_CHECK_SERVICE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'x-source-service': 'dogstronaut-booking',
  },
})

async function checkSeats(rocketClass, departureDate, passengerCount) {
  logger.info('Checking seat inventory', { rocket_class: rocketClass, departure_date: departureDate, passenger_count: passengerCount })
  const response = await client.post('/check', {
    rocket_class: rocketClass,
    departure_date: departureDate,
    passenger_count: passengerCount,
  })
  return response.data
}

module.exports = { checkSeats }
