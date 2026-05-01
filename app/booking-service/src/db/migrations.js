'use strict'

const pool = require('./client')
const logger = require('../logger')

const DESTINATIONS_SEED = [
  {
    id: 'iss',
    name: 'ISS Day Trip',
    tagline: 'Budget space. Bring your own snacks.',
    price_usd: 9999,
    duration_days: 0.25,
    emoji: '🛸',
    duration_label: '6 hours',
    available_classes: ['economy', 'business', 'first_class'],
  },
  {
    id: 'moon',
    name: 'Moon (Luna Economy)',
    tagline: "Been there, done that. Now it's your turn.",
    price_usd: 49999,
    duration_days: 3,
    emoji: '🌙',
    duration_label: '3 days',
    available_classes: ['economy', 'business', 'first_class'],
  },
  {
    id: 'mars',
    name: 'Mars (Red Getaway)',
    tagline: 'Escape Earth forever. Or just for a holiday.',
    price_usd: 2500000,
    duration_days: 210,
    emoji: '🔴',
    duration_label: '7 months',
    available_classes: ['economy', 'business', 'first_class'],
  },
  {
    id: 'jupiter',
    name: 'Jupiter Flyby',
    tagline: 'The gas giant. Not what you think.',
    price_usd: 50000000,
    duration_days: 730,
    emoji: '♃',
    duration_label: '2 years',
    available_classes: ['business', 'first_class'],
  },
  {
    id: 'saturn',
    name: 'Saturn Ring Rider',
    tagline: 'The Instagram photo that breaks the internet.',
    price_usd: 75000000,
    duration_days: 1095,
    emoji: '🪐',
    duration_label: '3 years',
    available_classes: ['first_class'],
  },
  {
    id: 'venus',
    name: 'Venus Flyby (Hot Deal)',
    tagline: '465°C surface. Our AC is under warranty.',
    price_usd: 1200000,
    duration_days: 150,
    emoji: '🌋',
    duration_label: '5 months',
    available_classes: ['economy', 'business', 'first_class'],
  },
  {
    id: 'mercury',
    name: 'Mercury Sprint',
    tagline: 'Closest to the Sun. Sunscreen not provided.',
    price_usd: 800000,
    duration_days: 106,
    emoji: '☿',
    duration_label: '3.5 months',
    available_classes: ['economy', 'business', 'first_class'],
  },
  {
    id: 'europa',
    name: 'Europa Ocean Dive',
    tagline: 'Alien ocean under the ice. What lives there? Good question.',
    price_usd: 120000000,
    duration_days: 730,
    emoji: '🧊',
    duration_label: '2 years',
    available_classes: ['first_class'],
  },
  {
    id: 'titan',
    name: 'Titan Methane Lakes',
    tagline: "Saturn's moon has lakes. They're not water. Bring a hazmat suit.",
    price_usd: 95000000,
    duration_days: 1095,
    emoji: '🟠',
    duration_label: '3 years',
    available_classes: ['first_class'],
  },
  {
    id: 'neptune',
    name: 'Neptune Deep Freeze',
    tagline: 'Winds at 2,100 km/h. Great hair day guaranteed.',
    price_usd: 500000000,
    duration_days: 4380,
    emoji: '🔵',
    duration_label: '12 years',
    available_classes: ['first_class'],
  },
  {
    id: 'pluto',
    name: 'Pluto (Still a Planet to Us)',
    tagline: "Demoted but not forgotten. It's got heart — literally.",
    price_usd: 900000000,
    duration_days: 5110,
    emoji: '🩶',
    duration_label: '14 years',
    available_classes: ['first_class'],
  },
  {
    id: 'asteroid_belt',
    name: 'Asteroid Belt Safari',
    tagline: 'Dodge rocks at 25 km/s. A great team-building experience.',
    price_usd: 30000000,
    duration_days: 548,
    emoji: '🪨',
    duration_label: '18 months',
    available_classes: ['business', 'first_class'],
  },
  {
    id: 'proxima',
    name: 'Proxima Centauri b',
    tagline: 'Only 4.24 light-years away. Pack light.',
    price_usd: 999999999999,
    duration_days: 999999,
    emoji: '⭐',
    duration_label: '~75,000 years',
    available_classes: ['first_class'],
  },
]

async function runMigrations() {
  const client = await pool.connect()
  try {
    logger.info('Running database migrations...')

    // Create destinations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS destinations (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        tagline TEXT,
        price_usd NUMERIC(15, 2) NOT NULL,
        duration_days NUMERIC(10, 2),
        duration_label VARCHAR(50),
        emoji VARCHAR(10),
        available_classes JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // Create bookings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        destination_id VARCHAR(50) NOT NULL REFERENCES destinations(id),
        passenger_name VARCHAR(200) NOT NULL,
        passenger_email VARCHAR(300) NOT NULL,
        rocket_class VARCHAR(50) NOT NULL,
        pilot_name VARCHAR(100) NOT NULL,
        departure_date DATE NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        total_price_usd NUMERIC(15, 2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // Create payments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID NOT NULL REFERENCES bookings(id),
        amount_usd NUMERIC(15, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        transaction_id VARCHAR(100),
        card_last_four VARCHAR(4),
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    logger.info('Tables created successfully')

    // Seed destinations
    for (const dest of DESTINATIONS_SEED) {
      await client.query(
        `INSERT INTO destinations (id, name, tagline, price_usd, duration_days, duration_label, emoji, available_classes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           tagline = EXCLUDED.tagline,
           price_usd = EXCLUDED.price_usd,
           duration_days = EXCLUDED.duration_days,
           duration_label = EXCLUDED.duration_label,
           emoji = EXCLUDED.emoji,
           available_classes = EXCLUDED.available_classes`,
        [
          dest.id,
          dest.name,
          dest.tagline,
          dest.price_usd,
          dest.duration_days,
          dest.duration_label,
          dest.emoji,
          JSON.stringify(dest.available_classes),
        ]
      )
    }

    logger.info('Destinations seeded successfully', { count: DESTINATIONS_SEED.length })
  } catch (err) {
    logger.error('Migration failed', { error: err.message, stack: err.stack })
    throw err
  } finally {
    client.release()
  }
}

module.exports = { runMigrations }
