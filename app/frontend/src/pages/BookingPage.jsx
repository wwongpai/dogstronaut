import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import axios from 'axios'
import { trackAction, setRumUser, logInfo, logError } from '../datadog.js'

const DESTINATIONS_MAP = {
  iss:     { id: 'iss',     name: 'ISS Day Trip',         emoji: '🛸', tagline: 'Budget space. Bring your own snacks.',                  price_usd: 9999,     duration_label: '6 hours'  },
  moon:    { id: 'moon',    name: 'Moon (Luna Economy)',   emoji: '🌙', tagline: "Been there, done that. Now it's your turn.",            price_usd: 49999,    duration_label: '3 days'   },
  mars:    { id: 'mars',    name: 'Mars (Red Getaway)',    emoji: '🔴', tagline: 'Escape Earth forever. Or just for a holiday.',          price_usd: 2500000,  duration_label: '7 months' },
  jupiter: { id: 'jupiter', name: 'Jupiter Flyby',         emoji: '♃', tagline: 'The gas giant. Not what you think.',                   price_usd: 50000000, duration_label: '2 years'  },
  saturn:        { id: 'saturn',        name: 'Saturn Ring Rider',         emoji: '🪐', tagline: 'The Instagram photo that breaks the internet.',                              price_usd: 75000000,      duration_label: '3 years'      },
  venus:         { id: 'venus',         name: 'Venus Flyby (Hot Deal)',     emoji: '🌋', tagline: '465°C surface. Our AC is under warranty.',                                  price_usd: 1200000,       duration_label: '5 months'     },
  mercury:       { id: 'mercury',       name: 'Mercury Sprint',             emoji: '☿',  tagline: 'Closest to the Sun. Sunscreen not provided.',                               price_usd: 800000,        duration_label: '3.5 months'   },
  europa:        { id: 'europa',        name: 'Europa Ocean Dive',          emoji: '🧊', tagline: "Alien ocean under the ice. What lives there? Good question.",                price_usd: 120000000,     duration_label: '2 years'      },
  titan:         { id: 'titan',         name: 'Titan Methane Lakes',        emoji: '🟠', tagline: "Saturn's moon has lakes. They're not water. Bring a hazmat suit.",           price_usd: 95000000,      duration_label: '3 years'      },
  neptune:       { id: 'neptune',       name: 'Neptune Deep Freeze',        emoji: '🔵', tagline: 'Winds at 2,100 km/h. Great hair day guaranteed.',                           price_usd: 500000000,     duration_label: '12 years'     },
  pluto:         { id: 'pluto',         name: 'Pluto (Still a Planet to Us)', emoji: '🩶', tagline: "Demoted but not forgotten. It's got heart — literally.",                  price_usd: 900000000,     duration_label: '14 years'     },
  asteroid_belt: { id: 'asteroid_belt', name: 'Asteroid Belt Safari',       emoji: '🪨', tagline: 'Dodge rocks at 25 km/s. A great team-building experience.',                 price_usd: 30000000,      duration_label: '18 months'    },
  proxima:       { id: 'proxima',       name: 'Proxima Centauri b',         emoji: '⭐', tagline: 'Only 4.24 light-years away. Pack light.',                                   price_usd: 999999999999,  duration_label: '~75,000 years' },
}

const ROCKET_CLASSES = [
  {
    id: 'economy',
    name: 'Economy Pod',
    icon: '🛸',
    desc: 'Seats 4. No windows. Existential dread included.',
    surcharge: 0,
  },
  {
    id: 'business',
    name: 'Business Capsule',
    icon: '🚀',
    desc: '2 seats. Porthole view. Freeze-dried gourmet meals.',
    surcharge: 0.25,
  },
  {
    id: 'first_class',
    name: 'First Class Shuttle',
    icon: '✨',
    desc: 'Private cabin. Space butler. WiFi (22-min delay to Earth).',
    surcharge: 0.75,
  },
]

const PILOTS = [
  {
    id: 'captain_buzz',
    name: 'Captain Buzz',
    icon: '👨‍🚀',
    desc: 'Retired astronaut. Seen it all. Charges extra for conversation.',
    rating: '⭐⭐⭐⭐⭐',
    trips: '47 missions',
  },
  {
    id: 'aria_v2',
    name: 'ARIA v2.3 (AI Pilot)',
    icon: '🤖',
    desc: '99.7% success rate. The 0.3% is classified.',
    rating: '⭐⭐⭐⭐½',
    trips: '∞ simulations',
  },
  {
    id: 'rookie_rick',
    name: 'Rookie Rick',
    icon: '😅',
    desc: "His 3rd commercial flight! What could go wrong?",
    rating: '⭐⭐⭐',
    trips: '2 completed',
  },
]

function formatPrice(price) {
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(1)}M`
  return `$${price.toLocaleString()}`
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(email)
}

function getTodayStr() {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().split('T')[0]
}

function StepIndicator({ current }) {
  const steps = [
    { n: 1, label: 'Destination' },
    { n: 2, label: 'Passenger' },
    { n: 3, label: 'Payment' },
    { n: 4, label: 'Confirmed' },
  ]
  return (
    <div className="booking-steps">
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <div className={`step-item ${current === s.n ? 'active' : current > s.n ? 'done' : ''}`}>
            <span className="step-num">{current > s.n ? '✓' : s.n}</span>
            <span>{s.label}</span>
          </div>
          {i < steps.length - 1 && <div className="step-connector" />}
        </React.Fragment>
      ))}
    </div>
  )
}

export default function BookingPage() {
  const { destinationId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const destination = location.state?.destination || DESTINATIONS_MAP[destinationId] || DESTINATIONS_MAP['moon']

  const [form, setForm] = useState({
    passengerName: '',
    passengerEmail: '',
    departureDate: getTodayStr(),
    rocketClass: 'economy',
    pilot: 'captain_buzz',
  })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState(null)

  useEffect(() => {
    logInfo('booking_page_viewed', { destination_id: destinationId })
  }, [])

  const selectedClass = ROCKET_CLASSES.find(r => r.id === form.rocketClass)
  const totalPrice = destination.price_usd * (1 + (selectedClass?.surcharge || 0))

  function validate() {
    const errs = {}
    if (!form.passengerName.trim()) {
      errs.passengerName = 'Your name is required. Even aliens have names.'
    } else if (form.passengerName.trim().length < 2) {
      errs.passengerName = 'Surely your name is longer than that?'
    }
    if (!form.passengerEmail.trim()) {
      errs.passengerEmail = 'Email required. Must be from this planet.'
    } else if (!validateEmail(form.passengerEmail)) {
      errs.passengerEmail = 'Email must be from this planet (e.g., you@earth.com)'
    }
    if (!form.departureDate) {
      errs.departureDate = 'Pick a date. Time travel not yet available.'
    } else if (new Date(form.departureDate) < new Date()) {
      errs.departureDate = 'We cannot depart in the past. That technology is still in beta.'
    }
    return errs
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    if (errors[name]) setErrors(e => ({ ...e, [name]: undefined }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setLoading(true)
    setApiError(null)

    setRumUser({ name: form.passengerName, email: form.passengerEmail })
    trackAction('booking_initiated', {
      destination_id: destination.id,
      destination_name: destination.name,
      rocket_class: form.rocketClass,
      pilot: form.pilot,
      price_usd: totalPrice,
    })

    try {
      const res = await axios.post('/api/bookings', {
        destination_id: destination.id,
        passenger_name: form.passengerName,
        passenger_email: form.passengerEmail,
        departure_date: form.departureDate,
        rocket_class: form.rocketClass,
        pilot_name: form.pilot,
        total_price_usd: totalPrice,
      })

      logInfo('booking_created', { booking_id: res.data.id, destination_id: destination.id, rocket_class: form.rocketClass })
      navigate('/payment', {
        state: {
          booking: res.data,
          destination,
          totalPrice,
        },
      })
    } catch (err) {
      logError('booking_failed', err, { destination_id: destinationId })
      const msg = err.response?.data?.error || err.message || 'Launch aborted. Please try again.'
      setApiError(`Houston, we have a problem: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page booking-page">
      <div className="star-field" aria-hidden="true">
        {Array.from({ length: 60 }).map((_, i) => (
          <div key={i} className="star" style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 4}s`,
            animationDuration: `${2 + Math.random() * 3}s`,
            width: `${1 + Math.random() * 2}px`,
            height: `${1 + Math.random() * 2}px`,
          }} />
        ))}
      </div>

      <nav className="navbar">
        <div className="navbar-brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <span className="brand-rocket">🚀</span>
          <span className="brand-name">Dogstronaut Tours</span>
        </div>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>← Destinations</button>
      </nav>

      <div className="booking-container">
        {/* Step indicator */}
        <StepIndicator current={2} />

        {/* Destination Summary */}
        <div className="booking-dest-header">
          <span className="booking-dest-emoji">{destination.emoji}</span>
          <div>
            <h1 className="booking-dest-name">{destination.name}</h1>
            <p className="booking-dest-tagline">"{destination.tagline}"</p>
            <div className="booking-dest-meta">
              <span className="price-tag">{formatPrice(destination.price_usd)}</span>
              <span className="duration-tag">{destination.duration_label}</span>
            </div>
          </div>
        </div>

        <form className="booking-form" onSubmit={handleSubmit} noValidate>
          {/* Passenger Details */}
          <div className="form-section">
            <h2 className="form-section-title">
              <span>👤</span> Passenger Details
            </h2>

            <div className="form-group">
              <label className="form-label" htmlFor="passengerName">
                Full Name <span className="required">*</span>
              </label>
              <input
                id="passengerName"
                name="passengerName"
                type="text"
                className={`form-input ${errors.passengerName ? 'input-error' : ''}`}
                placeholder="e.g. Elon Bezos"
                value={form.passengerName}
                onChange={handleChange}
                autoComplete="name"
              />
              {errors.passengerName && <p className="field-error">{errors.passengerName}</p>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="passengerEmail">
                Email Address <span className="required">*</span>
              </label>
              <input
                id="passengerEmail"
                name="passengerEmail"
                type="email"
                className={`form-input ${errors.passengerEmail ? 'input-error' : ''}`}
                placeholder="you@earth.com"
                value={form.passengerEmail}
                onChange={handleChange}
                autoComplete="email"
              />
              {errors.passengerEmail && <p className="field-error">{errors.passengerEmail}</p>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="departureDate">
                Launch Date <span className="required">*</span>
              </label>
              <input
                id="departureDate"
                name="departureDate"
                type="date"
                className={`form-input ${errors.departureDate ? 'input-error' : ''}`}
                value={form.departureDate}
                onChange={handleChange}
                min={getTodayStr()}
              />
              {errors.departureDate && <p className="field-error">{errors.departureDate}</p>}
            </div>
          </div>

          {/* Rocket Class */}
          <div className="form-section">
            <h2 className="form-section-title">
              <span>🚀</span> Select Rocket Class
            </h2>
            <div className="rocket-class-grid">
              {ROCKET_CLASSES.map(cls => (
                <label
                  key={cls.id}
                  className={`rocket-card ${form.rocketClass === cls.id ? 'rocket-card-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="rocketClass"
                    value={cls.id}
                    checked={form.rocketClass === cls.id}
                    onChange={handleChange}
                    style={{ display: 'none' }}
                  />
                  <span className="rocket-class-icon">{cls.icon}</span>
                  <span className="rocket-class-name">{cls.name}</span>
                  <span className="rocket-class-desc">{cls.desc}</span>
                  {cls.surcharge > 0 && (
                    <span className="rocket-class-surcharge">+{Math.round(cls.surcharge * 100)}%</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Pilot */}
          <div className="form-section">
            <h2 className="form-section-title">
              <span>👨‍✈️</span> Choose Your Pilot
            </h2>
            <p className="form-section-note">Choose wisely. Or not. We don't judge.</p>
            <div className="pilot-grid">
              {PILOTS.map(pilot => (
                <label
                  key={pilot.id}
                  className={`pilot-card ${form.pilot === pilot.id ? 'pilot-card-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="pilot"
                    value={pilot.id}
                    checked={form.pilot === pilot.id}
                    onChange={handleChange}
                    style={{ display: 'none' }}
                  />
                  <span className="pilot-icon">{pilot.icon}</span>
                  <div className="pilot-info">
                    <span className="pilot-name">{pilot.name}</span>
                    <span className="pilot-desc">{pilot.desc}</span>
                    <div className="pilot-meta">
                      <span className="pilot-rating">{pilot.rating}</span>
                      <span className="pilot-trips">{pilot.trips}</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {apiError && (
            <div className="api-error-banner">
              <span>🚨 {apiError}</span>
            </div>
          )}

          {/* Summary + CTA */}
          <div className="booking-summary-bar">
            <div className="summary-total">
              <span className="summary-label">Total Mission Cost</span>
              <span className="summary-price">{formatPrice(totalPrice)}</span>
            </div>
            <button type="submit" className="btn btn-primary btn-launch" disabled={loading}>
              {loading ? (
                <span className="loading-dots">Preparing Launch<span>.</span><span>.</span><span>.</span></span>
              ) : (
                'Continue to Payment →'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
