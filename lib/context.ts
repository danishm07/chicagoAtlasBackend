import { 
  WeatherData, 
  SafetyData, 
  EventData, 
  SpotData, 
  AirData, 
  TransitData,
  EventbriteData,
  fetchWeather,
  fetchSafety,
  fetchEvents,
  fetchSpots,
  fetchAir,
  fetchTransit,
  fetchEventbrite
} from './fetchers'

export interface Context {
  weather: WeatherData
  safety: SafetyData
  events: EventData[]
  eventbrite: EventbriteData[]
  spots: SpotData[]
  air: AirData
  transit: TransitData
  timestamp: string
}

export interface Profile {
  name: string
  personas: string[]
  university: string
  interests: string[]
  currentZone: string
}

export interface CacheEntry {
  data: Context
  fetchedAt: number
}

// ─── CONTEXT ─────────────────────────────────────────────

let cache: CacheEntry | null = null
const TTL = 90_000

export async function getContext(profile: Profile): Promise<Context> {
  const now = Date.now()
  if (cache && now - cache.fetchedAt < TTL) {
    const age = Math.round((now - cache.fetchedAt) / 1000)
    console.log(`[Cache] ✓ cached context (${age}s old)`)
    return cache.data
  }

  console.log('[Cache] fetching fresh data...')
  const [weather, safety, events, eventbrite, spots, air, transit] = await Promise.all([
    fetchWeather(), fetchSafety(), fetchEvents(), fetchEventbrite(),
    fetchSpots(), fetchAir(), fetchTransit()
  ])

  // Filter spots to budget-friendly for students
  const filteredSpots = spots
    .filter(s => profile.personas.includes('student')
      ? s.price === '$' || s.price === '$$'
      : true)
    .slice(0, 5)

  const ctx: Context = {
    weather, safety, air, transit,
    events: events,
    eventbrite: eventbrite,
    spots: filteredSpots,
    timestamp: new Date().toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  cache = { data: ctx, fetchedAt: now }
  return ctx
}

export function buildContextString(ctx: Context): string {
  const { weather, safety, events, eventbrite, spots, air, transit, timestamp } = ctx

  // Only list medium/high incidents — not noise complaints
  const notableIncidents = safety.incidents.filter(i => i.severity !== 'low')

  return `=== LIVE LOOP DATA — ${timestamp} ===

WEATHER: ${weather.temp} (feels ${weather.feelsLike}) · ${weather.condition} · wind ${weather.wind}

SAFETY: ${safety.incidentCount} crimes reported in last 6 hours · score ${safety.safetyScore}/100
${notableIncidents.length > 0
  ? notableIncidents.map(i => `  - ${i.description}${i.location ? ` on ${i.location}` : ''}`).join('\n')
  : '  - No notable incidents'}
Recommendation: ${safety.recommendation}

TICKETMASTER EVENTS (${events.length}):
${events.length > 0
  ? events.map(e => `  - ${e.name} @ ${e.venue} · ${e.time} · ${e.price} · ${e.distance}`).join('\n')
  : '  - No ticketed events found today'}

FREE EVENTS (${eventbrite.length}):
${eventbrite.length > 0
  ? eventbrite.map(e => `  - ${e.name} @ ${e.venue} · ${e.time} · ${e.distance}`).join('\n')
  : '  - No free events found today'}

OPEN SPOTS NEARBY (${spots.length}):
${spots.map(s => `  - ${s.name} · ${s.category} · ${s.price} · wait: ${s.waitEstimate} · ${s.distance} · ★${s.rating}`).join('\n')}

TRANSIT: ${transit.status}
${transit.alerts.map(a => `  - ${a.route}: ${a.headline}`).join('\n')}

AIR: AQI ${air.aqi} (${air.category}) — ${air.recommendation}

=== END ===`
}
