import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { trackAction, logInfo, logError, setDemoUser } from '../datadog.js'
import dogstronautLogo from '../assets/dogstronaut-logo.png'

const FALLBACK_DESTINATIONS = [
  {
    id: 'iss',
    name: 'ISS Day Trip',
    emoji: '🛸',
    tagline: 'Budget space. Bring your own snacks.',
    price_usd: 9999,
    duration_days: 0.25,
    duration_label: '6 hours',
  },
  {
    id: 'moon',
    name: 'Moon (Luna Economy)',
    emoji: '🌙',
    tagline: "Been there, done that. Now it's your turn.",
    price_usd: 49999,
    duration_days: 3,
    duration_label: '3 days',
  },
  {
    id: 'mars',
    name: 'Mars (Red Getaway)',
    emoji: '🔴',
    tagline: 'Escape Earth forever. Or just for a holiday.',
    price_usd: 2500000,
    duration_days: 210,
    duration_label: '7 months',
  },
  {
    id: 'jupiter',
    name: 'Jupiter Flyby',
    emoji: '♃',
    tagline: 'The gas giant. Not what you think.',
    price_usd: 50000000,
    duration_days: 730,
    duration_label: '2 years',
  },
  {
    id: 'saturn',
    name: 'Saturn Ring Rider',
    emoji: '🪐',
    tagline: 'The Instagram photo that breaks the internet.',
    price_usd: 75000000,
    duration_days: 1095,
    duration_label: '3 years',
  },
  {
    id: 'venus',
    name: 'Venus Flyby (Hot Deal)',
    emoji: '🌋',
    tagline: '465°C surface. Our AC is under warranty.',
    price_usd: 1200000,
    duration_days: 150,
    duration_label: '5 months',
  },
  {
    id: 'mercury',
    name: 'Mercury Sprint',
    emoji: '☿',
    tagline: 'Closest to the Sun. Sunscreen not provided.',
    price_usd: 800000,
    duration_days: 106,
    duration_label: '3.5 months',
  },
  {
    id: 'europa',
    name: 'Europa Ocean Dive',
    emoji: '🧊',
    tagline: "Alien ocean under the ice. What lives there? Good question.",
    price_usd: 120000000,
    duration_days: 730,
    duration_label: '2 years',
  },
  {
    id: 'titan',
    name: 'Titan Methane Lakes',
    emoji: '🟠',
    tagline: "Saturn's moon has lakes. They're not water. Bring a hazmat suit.",
    price_usd: 95000000,
    duration_days: 1095,
    duration_label: '3 years',
  },
  {
    id: 'neptune',
    name: 'Neptune Deep Freeze',
    emoji: '🔵',
    tagline: 'Winds at 2,100 km/h. Great hair day guaranteed.',
    price_usd: 500000000,
    duration_days: 4380,
    duration_label: '12 years',
  },
  {
    id: 'pluto',
    name: 'Pluto (Still a Planet to Us)',
    emoji: '🩶',
    tagline: "Demoted but not forgotten. It's got heart — literally.",
    price_usd: 900000000,
    duration_days: 5110,
    duration_label: '14 years',
  },
  {
    id: 'asteroid_belt',
    name: 'Asteroid Belt Safari',
    emoji: '🪨',
    tagline: 'Dodge rocks at 25 km/s. A great team-building experience.',
    price_usd: 30000000,
    duration_days: 548,
    duration_label: '18 months',
  },
  {
    id: 'proxima',
    name: 'Proxima Centauri b',
    emoji: '⭐',
    tagline: 'Only 4.24 light-years away. Pack light.',
    price_usd: 999999999999,
    duration_days: 999999,
    duration_label: '~75,000 years',
  },
]

function formatPrice(price) {
  if (price >= 1_000_000) {
    return `$${(price / 1_000_000).toFixed(1)}M`
  }
  return `$${price.toLocaleString()}`
}

export default function HomePage() {
  const navigate = useNavigate()
  const [destinations, setDestinations] = useState(FALLBACK_DESTINATIONS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedDest, setSelectedDest] = useState(null)

  useEffect(() => {
    setDemoUser()
    logInfo('home_page_viewed', {})
    async function fetchDestinations() {
      try {
        const res = await axios.get('/api/destinations')
        if (res.data && res.data.length > 0) {
          setDestinations(res.data)
          logInfo('destinations_loaded', { count: res.data.length })
        }
      } catch (err) {
        logError('destinations_fetch_failed', err, {})
        setError('Live data unavailable — showing cached destinations')
      } finally {
        setLoading(false)
      }
    }
    fetchDestinations()
  }, [])

  function handleBook(dest) {
    logInfo('destination_selected', { destination_id: dest.id, destination_name: dest.name })
    trackAction('destination_selected', {
      destination_id: dest.id,
      destination_name: dest.name,
      price_usd: dest.price_usd,
    })
    navigate(`/book/${dest.id}`, { state: { destination: dest } })
  }

  function handleHeroCTA() {
    if (selectedDest) {
      handleBook(selectedDest)
    } else {
      document.querySelector('.destinations-section')?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="page home-page">

      {/* Navigation */}
      <nav className="navbar">
        <div className="navbar-brand">
          <img src={dogstronautLogo} alt="Dogstronaut" className="brand-logo" />
          <span className="brand-name">Dogstronaut Tours</span>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No surge pricing… yet</div>
      </nav>

      {/* Hero — two-column Uber layout */}
      <section className="hero">

        {/* Left column: headline + booking form */}
        <div className="hero-left">
          <div className="hero-eyebrow">
            <span>🚀</span>
            <span>Space Travel, Simplified</span>
          </div>

          <h1 className="hero-title">
            Go anywhere.<br />
            Beyond Earth.
          </h1>

          {/* Uber-style destination picker */}
          <div className="hero-form">
            <div className="hero-form-row">
              <span className="hero-form-icon origin" />
              <span className="hero-form-label">Earth (Current Location)</span>
            </div>
            {selectedDest ? (
              <div
                className="hero-form-row dest-selected"
                onClick={() => setSelectedDest(null)}
              >
                <span className="hero-form-icon dest" />
                <span className="hero-form-label">{selectedDest.emoji} {selectedDest.name}</span>
              </div>
            ) : (
              <div
                className="hero-form-row"
                onClick={() => document.querySelector('.destinations-section')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <span className="hero-form-icon dest" />
                <span className="hero-form-label">Select a destination</span>
              </div>
            )}
          </div>

          <button className="btn-hero" onClick={handleHeroCTA}>
            {selectedDest ? `Book launch to ${selectedDest.name.split(' ')[0]}` : 'See all destinations'}
          </button>

          <div className="hero-stats">
            <div className="stat">
              <span className="stat-number">13</span>
              <span className="stat-label">Destinations</span>
            </div>
            <div className="stat">
              <span className="stat-number">3</span>
              <span className="stat-label">Rocket classes</span>
            </div>
            <div className="stat">
              <span className="stat-number">99.7%</span>
              <span className="stat-label">Success rate*</span>
            </div>
          </div>
        </div>

        {/* Right column: illustration */}
        <div className="hero-right">
          <div className="hero-illustration">
            <img src={dogstronautLogo} alt="Dogstronaut mascot" className="hero-logo" />
          </div>
        </div>
      </section>

      {/* Destinations — Uber suggestions style */}
      <section className="destinations-section">
        <div className="section-header">
          <span className="section-label">Destinations</span>
          <p className="section-subtitle">Choose your launch — no terminal queues, no baggage fees.</p>
          {error && <p className="error-banner">{error}</p>}
        </div>

        {loading ? (
          <div className="loading-grid">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="skeleton" />
            ))}
          </div>
        ) : (
          <div className="destinations-grid">
            {destinations.map((dest) => (
              <div
                key={dest.id}
                className="dest-card"
                onClick={() => {
                  setSelectedDest(dest)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
              >
                <span className="dest-emoji">{dest.emoji}</span>
                <div className="dest-body">
                  <h3 className="dest-name">{dest.name}</h3>
                  <p className="dest-tagline">"{dest.tagline}"</p>
                  <div className="dest-meta">
                    <div className="dest-price">{formatPrice(dest.price_usd)}</div>
                    <div className="dest-duration">
                      {dest.duration_label || (dest.duration_days < 1 ? `${Math.round(dest.duration_days * 24)}h` : `${dest.duration_days}d`)}
                    </div>
                  </div>
                </div>
                <button
                  className="btn btn-primary btn-book"
                  onClick={(e) => { e.stopPropagation(); handleBook(dest) }}
                >
                  Select Launch
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Trust badges */}
      <section className="trust-section">
        <div className="trust-grid">
          <div className="trust-item">
            <span className="trust-icon">🛡️</span>
            <span>Probably Safe</span>
          </div>
          <div className="trust-item">
            <span className="trust-icon">💳</span>
            <span>All Earth Currencies</span>
          </div>
          <div className="trust-item">
            <span className="trust-icon">📡</span>
            <span>Spotty WiFi Included</span>
          </div>
          <div className="trust-item">
            <span className="trust-icon">🌍</span>
            <span>Earth-Certified Pilots*</span>
          </div>
        </div>
      </section>

      <footer className="footer">
        <p>© 2027 Dogstronaut Tours Inc. — "We're not responsible for gravitational anomalies, alien encounters, or existential crises triggered by viewing Earth from orbit."</p>
        <p className="footer-powered">Powered by <span className="dd-badge">Datadog</span> — Because even space needs observability.</p>
      </footer>
    </div>
  )
}
