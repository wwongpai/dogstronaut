import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import { trackAction, logInfo, logError } from '../datadog.js'

function formatPrice(price) {
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(2)}M`
  return `$${price.toLocaleString()}`
}

function formatCardNumber(val) {
  return val.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
}

function formatExpiry(val) {
  const cleaned = val.replace(/\D/g, '').slice(0, 4)
  if (cleaned.length >= 3) return cleaned.slice(0, 2) + '/' + cleaned.slice(2)
  return cleaned
}

const PILOT_LABELS = {
  captain_buzz: 'Captain Buzz',
  aria_v2: 'ARIA v2.3 (AI Pilot)',
  rookie_rick: 'Rookie Rick',
}

const ROCKET_LABELS = {
  economy: 'Economy Pod',
  business: 'Business Capsule',
  first_class: 'First Class Shuttle',
}

function StepIndicator({ current }) {
  const steps = [
    { n: 1, label: 'Destination' },
    { n: 2, label: 'Passenger' },
    { n: 3, label: 'Payment' },
    { n: 4, label: 'Confirmed' },
  ]
  return (
    <div className="booking-steps" style={{ marginBottom: '1.5rem' }}>
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

export default function PaymentPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { booking, destination, totalPrice } = location.state || {}

  const [form, setForm] = useState({
    cardNumber: '',
    expiry: '',
    cvv: '',
    cardName: '',
  })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState(null)

  useEffect(() => {
    logInfo('payment_page_viewed', { booking_id: booking?.id })
  }, [])

  if (!booking || !destination) {
    navigate('/')
    return null
  }

  function validate() {
    const errs = {}
    const raw = form.cardNumber.replace(/\s/g, '')
    if (raw.length < 16) errs.cardNumber = 'Card number must be 16 digits. We checked.'
    if (!form.cardName.trim()) errs.cardName = "Cardholder name required. Even if it's your cat."
    const exp = form.expiry.replace('/', '')
    if (exp.length < 4) {
      errs.expiry = 'Enter valid expiry (MM/YY)'
    } else {
      const month = parseInt(exp.slice(0, 2), 10)
      if (month < 1 || month > 12) errs.expiry = 'Month must be 01-12. Time still works linearly.'
    }
    if (form.cvv.replace(/\D/g, '').length < 3) errs.cvv = 'CVV is 3-4 digits (not the safe combination)'
    return errs
  }

  function handleChange(e) {
    let { name, value } = e.target
    if (name === 'cardNumber') value = formatCardNumber(value)
    if (name === 'expiry') value = formatExpiry(value)
    if (name === 'cvv') value = value.replace(/\D/g, '').slice(0, 4)
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
    const cardLastFour = form.cardNumber.replace(/\s/g, '').slice(-4)

    trackAction('payment_attempted', {
      booking_id: booking.id,
      destination: destination.name,
      amount_usd: totalPrice,
    })

    try {
      const res = await axios.post('/api/payments/process', {
        booking_id: booking.id,
        amount_usd: totalPrice,
        card_last_four: cardLastFour,
      })

      logInfo('payment_completed', { booking_id: booking.id, amount: totalPrice })
      trackAction('booking_confirmed', {
        booking_id: booking.id,
        payment_id: res.data.transaction_id,
        destination: destination.name,
        amount_usd: totalPrice,
      })

      navigate('/confirmation', {
        state: {
          booking,
          payment: res.data,
          destination,
          totalPrice,
        },
      })
    } catch (err) {
      logError('payment_failed', err, { booking_id: booking.id, cart_value_usd: totalPrice })
      // RUM custom action — captures cart value at point of failure for revenue-lost analytics
      trackAction('payment_failed', {
        booking_id: booking.id,
        destination: destination.name,
        cart_value_usd: totalPrice,
        error_message: err.response?.data?.error || err.message,
        http_status: err.response?.status,
        error_type: err.response?.data?.scenario || 'unknown',
      })
      const msg = err.response?.data?.error || err.message || 'Payment gateway encountered a cosmic anomaly.'
      setApiError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page payment-page">
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
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Secure Checkout</div>
      </nav>

      <div className="payment-container">
        <StepIndicator current={3} />

        <div className="payment-layout">
          {/* Booking Summary */}
          <div className="booking-summary-card">
            <h2 className="summary-card-title">Launch Summary</h2>

            <div className="summary-dest">
              <span className="summary-dest-emoji">{destination.emoji}</span>
              <div>
                <div className="summary-dest-name">{destination.name}</div>
                <div className="summary-dest-dur">Duration: {destination.duration_label}</div>
              </div>
            </div>

            <div className="summary-divider" />

            <div className="summary-details">
              <div className="summary-row">
                <span>Passenger</span>
                <span>{booking.passenger_name}</span>
              </div>
              <div className="summary-row">
                <span>Launch Date</span>
                <span>{new Date(booking.departure_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              </div>
              <div className="summary-row">
                <span>Rocket Class</span>
                <span>{ROCKET_LABELS[booking.rocket_class] || booking.rocket_class}</span>
              </div>
              <div className="summary-row">
                <span>Pilot</span>
                <span>{PILOT_LABELS[booking.pilot_name] || booking.pilot_name}</span>
              </div>
              <div className="summary-row">
                <span>Booking Ref</span>
                <span className="booking-ref-mini">{booking.id?.slice(0, 8).toUpperCase()}</span>
              </div>
            </div>

            <div className="summary-divider" />

            <div className="summary-total-row">
              <span>Total</span>
              <span className="summary-total-price">{formatPrice(totalPrice)}</span>
            </div>

            <p className="summary-fine-print">
              We accept all Earth currencies. Space Bucks coming Q3 2027.
              <br />No refunds after launch. We mean it.
            </p>
          </div>

          {/* Payment Form */}
          <div className="payment-form-card">
            <h2 className="payment-form-title">Payment Details</h2>
            <p className="payment-form-subtitle">Your funds will be processed at the speed of light (minus network latency).</p>

            <form onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="cardName">Name on Card</label>
                <input
                  id="cardName"
                  name="cardName"
                  type="text"
                  className={`form-input ${errors.cardName ? 'input-error' : ''}`}
                  placeholder="As it appears on your Amex Black"
                  value={form.cardName}
                  onChange={handleChange}
                  autoComplete="cc-name"
                />
                {errors.cardName && <p className="field-error">{errors.cardName}</p>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="cardNumber">Card Number</label>
                <div className="card-input-wrapper">
                  <input
                    id="cardNumber"
                    name="cardNumber"
                    type="text"
                    inputMode="numeric"
                    className={`form-input card-number-input ${errors.cardNumber ? 'input-error' : ''}`}
                    placeholder="4242 4242 4242 4242"
                    value={form.cardNumber}
                    onChange={handleChange}
                    autoComplete="cc-number"
                  />
                  <span className="card-icon">💳</span>
                </div>
                {errors.cardNumber && <p className="field-error">{errors.cardNumber}</p>}
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="expiry">Expiry Date</label>
                  <input
                    id="expiry"
                    name="expiry"
                    type="text"
                    inputMode="numeric"
                    className={`form-input ${errors.expiry ? 'input-error' : ''}`}
                    placeholder="MM/YY"
                    value={form.expiry}
                    onChange={handleChange}
                    autoComplete="cc-exp"
                  />
                  {errors.expiry && <p className="field-error">{errors.expiry}</p>}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="cvv">CVV</label>
                  <input
                    id="cvv"
                    name="cvv"
                    type="text"
                    inputMode="numeric"
                    className={`form-input ${errors.cvv ? 'input-error' : ''}`}
                    placeholder="•••"
                    value={form.cvv}
                    onChange={handleChange}
                    autoComplete="cc-csc"
                  />
                  {errors.cvv && <p className="field-error">{errors.cvv}</p>}
                </div>
              </div>

              {apiError && (
                <div className="api-error-banner">
                  <span>💳 {apiError}</span>
                </div>
              )}

              <button type="submit" className="btn btn-primary btn-pay" disabled={loading}>
                {loading ? (
                  <span>Processing<span className="loading-dots">...</span></span>
                ) : (
                  `Confirm & Pay ${formatPrice(totalPrice)} 🚀`
                )}
              </button>

              <p className="security-note">
                🔒 256-bit encryption. Your card details are safer than you'll be on Mars.
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
