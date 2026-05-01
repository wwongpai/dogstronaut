'use strict'

const axios = require('axios')
const logger = require('../logger')

const LAUNCH_CONTROL_SERVICE_URL = process.env.LAUNCH_CONTROL_SERVICE_URL || 'http://localhost:4007'

const client = axios.create({
  baseURL: LAUNCH_CONTROL_SERVICE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'x-source-service': 'dogstronaut-booking',
  },
})

async function validateLaunch(destinationId, departureDate, rocketClass) {
  logger.info('Validating launch window', { destination_id: destinationId, departure_date: departureDate, rocket_class: rocketClass })
  const response = await client.post('/validate', {
    destination_id: destinationId,
    departure_date: departureDate,
    rocket_class: rocketClass,
  })
  return response.data
}

module.exports = { validateLaunch }
