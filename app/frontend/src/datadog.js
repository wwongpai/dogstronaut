import { datadogRum } from '@datadog/browser-rum'
import { datadogLogs } from '@datadog/browser-logs'

const EPL_USERS = [
  { id: 'salah', name: 'Salah', team: 'Liverpool' },
  { id: 'haaland', name: 'Haaland', team: 'Man City' },
  { id: 'saka', name: 'Saka', team: 'Arsenal' },
  { id: 'rashford', name: 'Rashford', team: 'Man United' },
  { id: 'bellingham', name: 'Bellingham', team: 'Real Madrid' },
  { id: 'palmer', name: 'Palmer', team: 'Chelsea' },
  { id: 'watkins', name: 'Watkins', team: 'Aston Villa' },
  { id: 'mbeumo', name: 'Mbeumo', team: 'Brentford' },
  { id: 'isak', name: 'Isak', team: 'Newcastle' },
  { id: 'trippier', name: 'Trippier', team: 'Newcastle' },
  { id: 'bruno', name: 'Bruno', team: 'Man United' },
  { id: 'foden', name: 'Foden', team: 'Man City' },
  { id: 'rice', name: 'Rice', team: 'Arsenal' },
  { id: 'gordon', name: 'Gordon', team: 'Newcastle' },
  { id: 'son', name: 'Son', team: 'Spurs' },
  { id: 'maddison', name: 'Maddison', team: 'Spurs' },
  { id: 'vandijk', name: 'VanDijk', team: 'Liverpool' },
  { id: 'alisson', name: 'Alisson', team: 'Liverpool' },
  { id: 'odegaard', name: 'Odegaard', team: 'Arsenal' },
  { id: 'trent', name: 'Trent', team: 'Liverpool' },
]

export function initDatadog() {
  datadogRum.init({
    applicationId: import.meta.env.VITE_DD_RUM_APPLICATION_ID,
    clientToken: import.meta.env.VITE_DD_RUM_CLIENT_TOKEN,
    site: 'datadoghq.com',
    service: 'dogstronaut-tours',
    env: 'demo',
    version: '1.0.0',
    sessionSampleRate: 100,
    sessionReplaySampleRate: 100,
    trackBfcacheViews: true,
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    defaultPrivacyLevel: 'allow',
    allowedTracingUrls: [
      { match: (url) => url.startsWith(window.location.origin), propagatorTypes: ['tracecontext', 'datadog'] },
    ],
  })

  datadogLogs.init({
    clientToken: import.meta.env.VITE_DD_RUM_CLIENT_TOKEN,
    site: 'datadoghq.com',
    service: 'dogstronaut-tours',
    env: 'demo',
    version: '1.0.0',
    forwardErrorsToLogs: true,
    sessionSampleRate: 100,
  })

  datadogRum.startSessionReplayRecording()
  console.log('[Dogstronaut Tours] Datadog RUM initialized — dogstronaut-tours @ demo')
}

export function setDemoUser() {
  const user = EPL_USERS[Math.floor(Math.random() * EPL_USERS.length)]
  datadogRum.setUser({ id: user.id, name: user.name, team: user.team })
  return user
}

export function trackAction(name, context = {}) {
  try {
    datadogRum.addAction(name, {
      ...context,
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('[Dogstronaut Tours] Failed to track action', name, e)
  }
}

export function setRumUser(user) {
  try {
    datadogRum.setUser({
      id: user.email?.toLowerCase() || user.name?.toLowerCase().replace(/\s+/g, '_'),
      name: user.name,
      email: user.email,
    })
  } catch (e) {
    console.warn('[Dogstronaut Tours] Failed to set RUM user', e)
  }
}

export function logInfo(message, context = {}) {
  try {
    datadogLogs.logger.info(message, context)
  } catch (e) {
    console.info(message, context)
  }
}

export function logError(message, error, context = {}) {
  try {
    datadogLogs.logger.error(message, { error: error?.message, ...context })
  } catch (e) {
    console.error(message, error, context)
  }
}
