import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { trackAction, logInfo } from '../datadog.js'

const PACK_TIPS = [
  '🧦 Thermal socks (space is cold — very, very cold)',
  '📸 Camera with a very wide lens (Earth is surprisingly round)',
  '🌮 At least 6 months of snacks for Mars trips',
  '📚 Books (lots of them — no Netflix in the asteroid belt)',
  '💊 Anti-nausea meds (microgravity is not as fun as it looks)',
  '🎵 A curated playlist because silence in space is genuinely terrifying',
  '🪥 Toothbrush (oral hygiene remains important at 17,500 mph)',
  '🤳 Selfie stick (the views will be unmatched, literally)',
  '🧘 A zen attitude (you cannot pull over and ask for directions)',
  '📝 Your will (just practical advice, not a warning)',
]

function formatPrice(price) {
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(2)}M`
  return `$${price.toLocaleString()}`
}

function Countdown({ departureDate }) {
  const [timeLeft, setTimeLeft] = useState({})

  useEffect(() => {
    function calc() {
      const now = new Date()
      const dep = new Date(departureDate)
      const diff = dep - now
      if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
      return {
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      }
    }
    setTimeLeft(calc())
    const interval = setInterval(() => setTimeLeft(calc()), 1000)
    return () => clearInterval(interval)
  }, [departureDate])

  return (
    <div className="countdown">
      {[['days', 'Days'], ['hours', 'Hrs'], ['minutes', 'Min'], ['seconds', 'Sec']].map(([key, label]) => (
        <div key={key} className="countdown-unit">
          <span className="countdown-number">{String(timeLeft[key] ?? 0).padStart(2, '0')}</span>
          <span className="countdown-label">{label}</span>
        </div>
      ))}
    </div>
  )
}

function StepIndicator() {
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
          <div className={`step-item ${s.n === 4 ? 'active' : 'done'}`}>
            <span className="step-num">{s.n === 4 ? '4' : '✓'}</span>
            <span>{s.label}</span>
          </div>
          {i < steps.length - 1 && <div className="step-connector" />}
        </React.Fragment>
      ))}
    </div>
  )
}

export default function ConfirmationPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { booking, payment, destination, totalPrice } = location.state || {}

  useEffect(() => {
    logInfo('confirmation_page_viewed', { booking_id: booking?.id, destination: destination?.name })
    if (booking) {
      trackAction('booking_confirmed', {
        booking_id: booking.id,
        destination: destination?.name,
        amount_usd: totalPrice,
      })
    }
  }, [])

  if (!booking || !destination) {
    navigate('/')
    return null
  }

  const bookingRef = booking.id?.slice(0, 8).toUpperCase() || 'CC000001'
  const transactionId = payment?.transaction_id?.slice(0, 8).toUpperCase() || 'TX000001'

  const randomTips = PACK_TIPS.sort(() => 0.5 - Math.random()).slice(0, 5)

  function handleShare() {
    const text = `I just booked a trip to ${destination.name} with Dogstronaut Tours for ${formatPrice(totalPrice)}! See you never, Earth peasants. 🐾🚀 #DogstronautTours #SpaceTravel`
    if (navigator.share) {
      navigator.share({ title: 'Dogstronaut Tours Booking', text })
    } else {
      navigator.clipboard?.writeText(text)
      alert("Copied to clipboard! Share with your earthbound friends (who probably can't afford it).")
    }
    trackAction('booking_shared', { destination: destination.name })
  }

  return (
    <div className="page confirmation-page">
      <div className="star-field" aria-hidden="true">
        {Array.from({ length: 80 }).map((_, i) => (
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

      {/* Confetti rockets */}
      <div className="confetti-rockets" aria-hidden="true">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="confetti-rocket" style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 2}s`,
            animationDuration: `${2 + Math.random() * 2}s`,
          }}>🚀</div>
        ))}
      </div>

      <nav className="navbar">
        <div className="navbar-brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <span className="brand-rocket">🚀</span>
          <span className="brand-name">Dogstronaut Tours</span>
        </div>
      </nav>

      <div className="confirmation-container">
        <StepIndicator />

        {/* Hero */}
        <div className="confirmation-hero">
          <span className="confirmation-rocket-anim">🚀</span>
          <h1 className="confirmation-title">You're Going to Space!</h1>
          <p className="confirmation-subtitle">
            Or at least you've paid a lot of money for the privilege of trying.
          </p>
        </div>

        {/* Booking card */}
        <div className="confirmation-card">
          <div className="confirmation-badge">
            <span className="badge-icon">✅</span>
            <span className="badge-text">Launch Confirmed</span>
          </div>

          <div className="confirmation-refs">
            <div className="ref-item">
              <span className="ref-label">Booking Reference</span>
              <span className="ref-value">{bookingRef}</span>
            </div>
            <div className="ref-item">
              <span className="ref-label">Transaction ID</span>
              <span className="ref-value">{transactionId}</span>
            </div>
          </div>

          <div className="confirmation-details">
            <div className="conf-dest-header">
              <span className="conf-dest-emoji">{destination.emoji}</span>
              <div>
                <div className="conf-dest-name">{destination.name}</div>
                <div className="conf-dest-passenger">Passenger: {booking.passenger_name}</div>
                <div className="conf-dest-date">
                  Launch: {new Date(booking.departure_date).toLocaleDateString('en-US', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                  })}
                </div>
                <div className="conf-total">Total Paid: <strong>{formatPrice(totalPrice)}</strong></div>
              </div>
            </div>
          </div>
        </div>

        {/* Countdown */}
        <div className="countdown-section">
          <h2 className="countdown-title">T-Minus Until Launch</h2>
          <Countdown departureDate={booking.departure_date} />
          <p className="countdown-note">
            (This countdown is purely psychological. Packing anxiety begins now.)
          </p>
        </div>

        {/* Pack tips */}
        <div className="pack-tips-section">
          <h2 className="pack-tips-title">What to Pack</h2>
          <p className="pack-tips-subtitle">Curated packing advice from people who've never been to space:</p>
          <ul className="pack-tips-list">
            {randomTips.map((tip, i) => (
              <li key={i} className="pack-tip">{tip}</li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="confirmation-actions">
          <button className="btn btn-secondary" onClick={handleShare}>
            📣 Share with Friends
            <span className="btn-subtext">(who probably can't afford it)</span>
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Book Another Launch 🚀
          </button>
        </div>

        <p className="confirmation-email-note">
          A confirmation email has been sent to {booking.passenger_email}.
          <br />
          If you don't receive it, check your spam. Or maybe space already scrambled the signal.
        </p>
      </div>
    </div>
  )
}
