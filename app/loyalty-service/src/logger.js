'use strict'

const winston = require('winston')

const SERVICE_NAME = 'dogstronaut-loyalty'

// dd-trace with logInjection:true automatically populates info.dd with
// { trace_id, span_id, service, env, version } on each log call.
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    const log = {
      timestamp: info.timestamp,
      level: info.level,
      message: info.message,
      service: SERVICE_NAME,
      env: process.env.DD_ENV || 'development',
      version: process.env.DD_VERSION || '1.0.0',
    }
    if (info.dd) log.dd = info.dd
    if (info.event_type !== undefined) log.event_type = info.event_type
    if (info.duration_ms !== undefined) log.duration_ms = info.duration_ms
    if (info.status_code !== undefined) log.status_code = info.status_code
    if (info.user_id !== undefined) log.user_id = info.user_id
    if (info.booking_id !== undefined) log.booking_id = info.booking_id
    if (info.error !== undefined) log.error = info.error
    const skip = new Set([
      'timestamp', 'level', 'message', 'service', 'splat', 'dd',
      'event_type', 'duration_ms', 'status_code', 'user_id', 'booking_id', 'error',
      Symbol.for('level'), Symbol.for('splat'),
    ])
    for (const [k, v] of Object.entries(info)) {
      if (!skip.has(k)) log[k] = v
    }
    if (info.stack) log.stack = info.stack
    return JSON.stringify(log)
  })
)

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: jsonFormat,
  transports: [new winston.transports.Console()],
})

module.exports = logger
