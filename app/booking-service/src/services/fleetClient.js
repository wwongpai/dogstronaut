'use strict'

const axios = require('axios')
const logger = require('../logger')

const FLEET_SERVICE_URL = process.env.FLEET_SERVICE_URL || 'http://localhost:4003'

const client = axios.create({
  baseURL: FLEET_SERVICE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'x-source-service': 'cosmocab-booking',
  },
})

async function checkAvailability(rocketClass, date) {
  logger.info('Checking fleet availability', { rocket_class: rocketClass, date })
  const response = await client.get('/availability', {
    params: { rocketClass, date },
  })
  return response.data
}

async function assignRocket(rocketClass) {
  logger.info('Assigning rocket', { rocket_class: rocketClass })
  const response = await client.post('/assign', { rocketClass })
  return response.data
}

module.exports = { checkAvailability, assignRocket }
