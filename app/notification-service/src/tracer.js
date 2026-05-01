'use strict'

// dd-trace must be initialized before any other require.
// DD_SERVICE, DD_ENV, DD_VERSION, DD_AGENT_HOST are read from env vars automatically.
const tracer = require('dd-trace').init({
  logInjection: true,    // auto-injects dd.trace_id/span_id into Winston logs
  profiling: true,       // enables Continuous Profiler
  runtimeMetrics: true,  // enables runtime metrics (event loop, GC, heap)
})

module.exports = tracer
