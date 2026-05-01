'use strict'

const axios = require('axios')
const logger = require('../logger')

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4008'

const client = axios.create({
  baseURL: NOTIFICATION_SERVICE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'x-source-service': 'dogstronaut-booking',
  },
})

async function sendNotification(passengerEmail, passengerName, bookingId, destinationName) {
  logger.info('Sending booking confirmation notification', {
    passenger_email: passengerEmail,
    booking_id: bookingId,
    destination_name: destinationName,
  })
  const response = await client.post('/send', {
    passenger_email: passengerEmail,
    passenger_name: passengerName,
    booking_id: bookingId,
    destination_name: destinationName,
  })
  return response.data
}

module.exports = { sendNotification }
