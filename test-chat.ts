import { config } from 'dotenv'
import { Groq } from 'groq-sdk'

config({ path: '.env.local' })

// ─── TYPES ───────────────────────────────────────────────

interface WeatherData {
  temp: string
  feelsLike: string
  condition: string
  wind: string
}

interface SafetyData {
  incidentCount: number
  incidents: Array<{ description: string; location: string; severity: 'low' | 'medium' | 'high' }>
  safetyScore: number
  recommendation: string
}

interface EventData {
  name: string
  venue: string
  time: string
  price: string
  distance: string
}

interface SpotData {
  name: string
  category: string
  price: string
  distance: string
  rating: number
  waitEstimate: string
}

interface AirData {
  aqi: number
  category: string
  recommendation: string
}

interface TransitData {
  alerts: Array<{ route: string; headline: string }>
  status: string
}

interface Context {
  weather: WeatherData
  safety: SafetyData
  events: EventData[]
  spots: SpotData[]
  air: AirData
  transit: TransitData
  timestamp: string
}

interface Profile {
  name: string
  personas: string[]
  university: string
  interests: string[]
  currentZone: string
}

interface CacheEntry {
  data: Context
  fetchedAt: number
}

// ─── FETCHERS ────────────────────────────────────────────

async function fetchWeather(): Promise<WeatherData> {
  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast?' +
      'latitude=41.8827&longitude=-87.6233' +
      '&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code' +
      '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America/Chicago'
    )
    if (!res.ok) throw new Error(`status ${res.status}`)
    const d = await res.json()
    const c = d.current
    const codeMap: Record<number, string> = {
      0: 'Clear sky', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Foggy', 48: 'Foggy', 51: 'Light drizzle', 53: 'Drizzle',
      61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
      71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
      80: 'Rain showers', 95: 'Thunderstorm'
    }
    console.log('[WEATHER] ✓ real data')
    return {
      temp: `${Math.round(c.temperature_2m)}°F`,
      feelsLike: `${Math.round(c.apparent_temperature)}°F`,
      condition: codeMap[c.weather_code] ?? 'Unknown',
      wind: `${Math.round(c.wind_speed_10m)} mph`
    }
  } catch (e) {
    console.log(`[WEATHER] ✗ mock — ${e}`)
    return { temp: '34°F', feelsLike: '27°F', condition: 'Overcast', wind: '11 mph' }
  }
}

async function fetchSafety(): Promise<SafetyData> {
  try {
    // Get recent crimes near the Loop, let API do the geo filtering
    const res = await fetch(
      'https://data.cityofchicago.org/resource/ijzp-q8t2.json' +
      `?$where=within_circle(location,41.8827,-87.6233,800)` +
      '&$order=date DESC' +
      '&$limit=50'
    )
    if (!res.ok) throw new Error(`status ${res.status}`)
    const raw = await res.json()

    // Filter to last 6 hours in code since API date filtering is problematic
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)
    const recent = raw.filter((crime: any) => {
      const crimeDate = new Date(crime.date)
      return crimeDate >= sixHoursAgo
    })

    const count = recent.length

    const safetyScore =
      count === 0 ? 95 :
      count <= 1  ? 88 :
      count <= 3  ? 75 :
      count <= 5  ? 60 :
      Math.max(35, 90 - count * 4)

    const recommendation =
      safetyScore >= 80 ? 'Safe to walk' :
      safetyScore >= 65 ? 'Exercise normal caution' :
      'Stay alert — elevated activity nearby'

    const incidents = recent.slice(0, 3).map((i: any) => ({
      description: i.primary_type ?? 'Reported incident',
      location: i.block ?? '',
      severity: (count <= 1 ? 'low' : count <= 3 ? 'medium' : 'high') as 'low' | 'medium' | 'high'
    }))

    console.log(`[SAFETY] ✓ real data — ${count} crimes in last 6 hours`)
    return { incidentCount: count, incidents, safetyScore, recommendation }
  } catch (e) {
    console.log(`[SAFETY] ✗ mock — ${e}`)
    return {
      incidentCount: 1,
      incidents: [{ description: 'Minor disturbance', location: '', severity: 'low' }],
      safetyScore: 88,
      recommendation: 'Safe to walk'
    }
  }
}

async function fetchEvents(): Promise<EventData[]> {
  try {
    const key = process.env.TICKETMASTER_API_KEY
    if (!key) throw new Error('no key')

    // Ticketmaster requires exactly this date format: 2026-02-28T00:00:00Z
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const start = `${dateStr}T00:00:00Z`
    const end   = `${dateStr}T23:59:59Z`

    const url =
      `https://app.ticketmaster.com/discovery/v2/events.json` +
      `?apikey=${key}` +
      `&latlong=41.8827,-87.6233` +
      `&radius=3&unit=miles` +
      `&startDateTime=${start}` +
      `&endDateTime=${end}` +
      `&size=5` +
      `&sort=distance,asc`

    const res = await fetch(url)
    if (!res.ok) throw new Error(`status ${res.status}`)
    const d = await res.json()
    const evts = d._embedded?.events ?? []

    if (evts.length === 0) {
      console.log('[EVENTS] ✓ real data — 0 events today (no mock injected)')
      return []
    }

    const processed = evts.map((e: any) => {
      const venue = e._embedded?.venues?.[0]
      const minPrice = e.priceRanges?.[0]?.min
      const timeStr = e.dates?.start?.localTime
        ? e.dates.start.localTime.slice(0, 5)
        : null
      let timeLabel = 'Tonight'
      if (timeStr) {
        const [h, m] = timeStr.split(':').map(Number)
        const ampm = h >= 12 ? 'PM' : 'AM'
        timeLabel = `${h > 12 ? h - 12 : h || 12}:${pad(m)} ${ampm}`
      }
      return {
        name: e.name,
        venue: venue?.name ?? 'Chicago venue',
        time: timeLabel,
        price: minPrice ? `From $${Math.round(minPrice)}` : 'See site',
        distance: venue?.distance ? `${Number(venue.distance).toFixed(1)} mi` : 'Nearby'
      }
    })

    console.log(`[EVENTS] ✓ real data — ${processed.length} events`)
    return processed
  } catch (e) {
    console.log(`[EVENTS] ✗ mock — ${e}`)
    // Minimal mock — no DePaul game injected
    return [
      { name: 'Chicago Cultural Center', venue: 'Cultural Center',
        time: 'Open now', price: 'Free', distance: '0.2 mi' }
    ]
  }
}

async function fetchSpots(): Promise<SpotData[]> {
  try {
    const key = process.env.YELP_API_KEY
    if (!key) throw new Error('no key')

    const res = await fetch(
      'https://api.yelp.com/v3/businesses/search' +
      '?latitude=41.8827&longitude=-87.6233' +
      '&radius=800&categories=restaurants,cafes,bars' +
      '&limit=10&sort_by=distance&open_now=true',
      { headers: { Authorization: `Bearer ${key}` } }
    )
    if (!res.ok) throw new Error(`status ${res.status}`)
    const d = await res.json()
    const biz = d.businesses ?? []

    const h = new Date().getHours()
    const isPeak = (h >= 12 && h <= 14) || (h >= 18 && h <= 21)

    const spots: SpotData[] = biz.map((b: any) => {
      const rating = b.rating ?? 4
      const wait =
        !isPeak ? 'No wait' :
        rating > 4.5 ? '20-30 min' :
        rating > 4.0 ? '10-15 min' :
        '5 min'
      return {
        name: b.name,
        category: b.categories?.[0]?.title ?? 'Restaurant',
        price: b.price ?? '$',
        distance: `${(b.distance / 1609.34).toFixed(1)} mi`,
        rating,
        waitEstimate: wait
      }
    })

    console.log(`[SPOTS] ✓ real data — ${spots.length} open spots`)
    return spots
  } catch (e) {
    console.log(`[SPOTS] ✗ mock — ${e}`)
    return [
      { name: 'Intelligentsia Coffee', category: 'Coffee', price: '$',
        distance: '0.1 mi', rating: 4.5, waitEstimate: 'No wait' },
      { name: 'Wow Bao', category: 'Asian', price: '$',
        distance: '0.1 mi', rating: 4.0, waitEstimate: 'No wait' },
      { name: 'Eleven City Diner', category: 'American', price: '$$',
        distance: '0.2 mi', rating: 4.2, waitEstimate: '10 min' }
    ]
  }
}

async function fetchAir(): Promise<AirData> {
  try {
    const key = process.env.AIRNOW_API_KEY
    if (!key) throw new Error('no key')
    const res = await fetch(
      `https://www.airnowapi.org/aq/observation/latLong/current/` +
      `?format=application/json&latitude=41.8827&longitude=-87.6233` +
      `&distance=25&API_KEY=${key}`
    )
    if (!res.ok) throw new Error(`status ${res.status}`)
    const d = await res.json()
    if (!d.length) throw new Error('empty response')
    const aqi = d[0].AQI
    console.log(`[AIR] ✓ real data — AQI ${aqi}`)
    return {
      aqi,
      category: aqi <= 50 ? 'Good' : aqi <= 100 ? 'Moderate' : 'Unhealthy',
      recommendation:
        aqi <= 50  ? 'Fine for outdoor activity' :
        aqi <= 100 ? 'Acceptable for most people' :
        'Limit outdoor exposure'
    }
  } catch (e) {
    console.log(`[AIR] ✗ mock — ${e}`)
    return { aqi: 48, category: 'Good', recommendation: 'Fine for outdoor activity' }
  }
}

async function fetchTransit(): Promise<TransitData> {
  try {
    const key = process.env.CTA_API_KEY
    if (!key) throw new Error('no key')

    // CTA returns XML — must parse as text then extract data
    const res = await fetch(
      `https://www.transitchicago.com/api/1.0/alerts.aspx?outputType=JSON&apikey=${key}`
    )
    if (!res.ok) throw new Error(`status ${res.status}`)

    // Check content type — CTA sometimes ignores outputType param
    const contentType = res.headers.get('content-type') ?? ''
    let alerts: TransitData['alerts'] = []

    if (contentType.includes('json')) {
      const d = await res.json()
      const raw = d.CTAAlerts?.Alert ?? []
      alerts = raw
        .filter((a: any) => Number(a.SeverityScore) > 50)
        .slice(0, 3)
        .map((a: any) => ({
          route: a.ImpactedService?.Service?.ServiceName ?? 'CTA',
          headline: a.ShortDescription ?? a.Headline ?? 'Service alert'
        }))
    } else {
      // XML fallback — extract SeverityScore and Headline with regex
      const text = await res.text()
      const headlines = [...text.matchAll(/<ShortDescription>(.*?)<\/ShortDescription>/g)]
        .slice(0, 3)
        .map(m => ({ route: 'CTA', headline: m[1] }))
      alerts = headlines
    }

    console.log(`[CTA] ✓ real data — ${alerts.length} alerts`)
    return {
      alerts,
      status: alerts.length === 0
        ? 'All lines running normally'
        : `${alerts.length} active alert(s)`
    }
  } catch (e) {
    console.log(`[CTA] ✗ mock — ${e}`)
    return { alerts: [], status: 'All lines running normally' }
  }
}


// ─── CONTEXT ─────────────────────────────────────────────

let cache: CacheEntry | null = null
const TTL = 90_000

async function getContext(profile: Profile): Promise<Context> {
  const now = Date.now()
  if (cache && now - cache.fetchedAt < TTL) {
    const age = Math.round((now - cache.fetchedAt) / 1000)
    console.log(`[Cache] ✓ cached context (${age}s old)`)
    return cache.data
  }

  console.log('[Cache] fetching fresh data...')
  const [weather, safety, events, spots, air, transit] = await Promise.all([
    fetchWeather(), fetchSafety(), fetchEvents(),
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
    spots: filteredSpots,
    timestamp: new Date().toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  cache = { data: ctx, fetchedAt: now }
  return ctx
}

function buildContextString(ctx: Context): string {
  const { weather, safety, events, spots, air, transit, timestamp } = ctx

  // Only list medium/high incidents — not noise complaints
  const notableIncidents = safety.incidents.filter(i => i.severity !== 'low')

  return `=== LIVE LOOP DATA — ${timestamp} ===

WEATHER: ${weather.temp} (feels ${weather.feelsLike}) · ${weather.condition} · wind ${weather.wind}

SAFETY: ${safety.incidentCount} crimes reported in last 6 hours · score ${safety.safetyScore}/100
${notableIncidents.length > 0
  ? notableIncidents.map(i => `  - ${i.description}${i.location ? ` on ${i.location}` : ''}`).join('\n')
  : '  - No notable incidents'}
Recommendation: ${safety.recommendation}

EVENTS TODAY (${events.length}):
${events.length > 0
  ? events.map(e => `  - ${e.name} @ ${e.venue} · ${e.time} · ${e.price} · ${e.distance}`).join('\n')
  : '  - No ticketed events found today'}

OPEN SPOTS NEARBY (${spots.length}):
${spots.map(s => `  - ${s.name} · ${s.category} · ${s.price} · wait: ${s.waitEstimate} · ${s.distance} · ★${s.rating}`).join('\n')}

TRANSIT: ${transit.status}
${transit.alerts.map(a => `  - ${a.route}: ${a.headline}`).join('\n')}

AIR: AQI ${air.aqi} (${air.category}) — ${air.recommendation}

=== END ===`
}

// ─── SYSTEM PROMPT ───────────────────────────────────────

function buildSystemPrompt(
  ctx: Context, 
  profile: Profile, 
  intent: Intent,
  contextString: string
): string {
  return `You are Pulse AI — real-time city intelligence 
for Chicago's Loop. Talk like a local, not a chatbot.

${contextString}

USER: ${profile.name} · ${profile.personas.join(' + ')} · 
${profile.university} · cares about: ${profile.interests.join(', ')}

CURRENT FOCUS: ${getIntentInstructions(intent)}

ALWAYS:
- First sentence directly answers the question
- Never start with "I" or "Based on"  
- If recommending food: name · price · wait — all three
- If safety: SAFE or AVOID first, one sentence context
- Max 3 bullets OR 2 short paragraphs, never both
- If data doesn't exist for the question, say so plainly
- NEVER invent events, venues, or details not in the provided data`
}

// ─── INTENT DETECTION ───────────────────────────────────────

type Intent = 
  | 'food'
  | 'events' 
  | 'safety'
  | 'transit'
  | 'crowds'
  | 'sports'
  | 'social'
  | 'general'

function detectIntent(
  message: string, 
  history: Array<{ role: string; content: string }>
): Intent {
  const msg = message.toLowerCase()
  
  // Safety keywords should always override inherited intent
  if (/safe|walk|danger|incident|crime|avoid|sketch/i.test(msg)) 
    return 'safety'
  
  // Check last assistant message for context carry-forward
  const lastAssistant = history
    .filter(h => h.role === 'assistant')
    .at(-1)?.content.toLowerCase() ?? ''

  if (/sport|game|match|score|team|play|depaul|fire fc|bulls|cubs|sox|hawks/i.test(msg)) 
    return 'sports'
  if (/social|bar|club|nightlife|party|drink|happy hour|lounge/i.test(msg)) 
    return 'social'
  if (/event|show|concert|performance|tonight|happening|free/i.test(msg)) 
    return 'events'
  if (/train|bus|cta|transit|delay|red line|blue line|green|orange|pink|brown/i.test(msg)) 
    return 'transit'
  if (/busy|crowd|packed|quiet|empty|people/i.test(msg)) 
    return 'crowds'
  if (/food|eat|hungry|coffee|lunch|dinner|breakfast|cheap|restaurant|cafe/i.test(msg)) 
    return 'food'

  // Follow-up intent — inherit from conversation context
  if (/that|those|there|it|they|more|else|instead|other/i.test(msg)) {
    if (/sport|game/i.test(lastAssistant)) return 'sports'
    if (/event|show|concert/i.test(lastAssistant)) return 'events'
    if (/food|restaurant|eat/i.test(lastAssistant)) return 'food'
  }

  return 'general'
}

function buildFocusedContext(ctx: Context, intent: Intent): string {
  const { weather, safety, events, spots, air, transit, timestamp } = ctx

  // Always include header and weather
  const base = `=== LIVE LOOP DATA — ${timestamp} ===
WEATHER: ${weather.temp} (feels ${weather.feelsLike}) · ${weather.condition}
`

  switch (intent) {
    case 'sports':
      const sportEvents = events.filter(e => 
        /sport|game|match|fc|fire|bulls|cubs|sox|hawks|depaul|marquette|basketball|soccer|hockey|baseball/i.test(e.name + e.venue)
      )
      return base + `
SPORTS EVENTS TODAY:
${sportEvents.length > 0 
  ? sportEvents.map(e => `  - ${e.name} @ ${e.venue} · ${e.time} · ${e.price} · ${e.distance}`).join('\n')
  : '  - No sports events found on Ticketmaster today near the Loop'}
ALL EVENTS TODAY (for reference):
${events.map(e => `  - ${e.name} @ ${e.venue} · ${e.time} · ${e.price}`).join('\n')}
`

    case 'social':
      const socialSpots = spots.filter(s =>
        /bar|brewery|lounge|club|tavern|pub|cocktail/i.test(s.category)
      )
      const socialEvents = events.filter(e =>
        /comedy|improv|show|live music|open mic|trivia/i.test(e.name)
      )
      return base + `
BARS & SOCIAL SPOTS (open now):
${socialSpots.length > 0
  ? socialSpots.map(s => `  - ${s.name} · ${s.category} · ${s.price} · wait: ${s.waitEstimate} · ${s.distance}`).join('\n')
  : '  - No bars/lounges found open right now'}
SOCIAL EVENTS TONIGHT:
${socialEvents.length > 0
  ? socialEvents.map(e => `  - ${e.name} @ ${e.venue} · ${e.time} · ${e.price}`).join('\n')
  : '  - No comedy/music events on Ticketmaster tonight'}
`

    case 'events':
      return base + `
ALL EVENTS TODAY (${events.length} total):
${events.length > 0
  ? events.map(e => `  - ${e.name} @ ${e.venue} · ${e.time} · ${e.price} · ${e.distance}`).join('\n')
  : '  - No ticketed events found today near the Loop'}
NOTE: Only ticketed events from Ticketmaster. Free events 
at Chicago Cultural Center, Millennium Park, and public 
spaces are not in this data but are typically available.
`

    case 'food':
      return base + `
OPEN SPOTS NEARBY (${spots.length} total):
${spots.map(s => `  - ${s.name} · ${s.category} · ${s.price} · wait: ${s.waitEstimate} · ${s.distance} · ★${s.rating}`).join('\n')}
`

    case 'safety':
      const notable = safety.incidents.filter(i => i.severity !== 'low')
      return base + `
SAFETY: ${safety.incidentCount} incidents last 6hrs · score ${safety.safetyScore}/100
${notable.length > 0
  ? notable.map((i: any) => `  - ${i.description}${i.location ? ` on ${i.location}` : ''}`).join('\n')
  : '  - No notable incidents'}
Recommendation: ${safety.recommendation}
`

    case 'transit':
      return base + `
TRANSIT: ${transit.status}
${transit.alerts.length > 0
  ? transit.alerts.map(a => `  - ${a.route}: ${a.headline}`).join('\n')
  : '  - All CTA lines running normally'}
`

    case 'crowds':
      return base + `
SAFETY/CROWD SIGNALS: ${safety.incidentCount} incidents · ${safety.recommendation}
EVENTS DRIVING CROWDS:
${events.map(e => `  - ${e.name} @ ${e.venue} · ${e.time} (could affect nearby streets)`).join('\n')}
WAIT TIMES AT SPOTS:
${spots.slice(0, 5).map(s => `  - ${s.name}: ${s.waitEstimate}`).join('\n')}
TRANSIT: ${transit.status}
`

    default: // general — give everything but trimmed
      return base + `
SAFETY: ${safety.safetyScore}/100 · ${safety.recommendation}
EVENTS TODAY: ${events.length > 0 
  ? events.slice(0, 3).map(e => `${e.name} (${e.time}, ${e.price})`).join(', ')
  : 'None found'}
OPEN SPOTS: ${spots.slice(0, 3).map(s => `${s.name} (${s.price}, ${s.waitEstimate})`).join(', ')}
TRANSIT: ${transit.status}
AIR: AQI ${air.aqi} — ${air.category}
`
  }
}

function getIntentInstructions(intent: Intent): string {
  switch (intent) {
    case 'sports':
      return `The user is asking about sports. 
If no sports events are in the data, say so directly. 
Don't substitute with non-sports events.
Mention if a game could affect crowd/transit nearby.`
    
    case 'social':
      return `The user wants social spots — bars, 
lounges, live music, comedy. 
Prioritize vibe and wait time over price.
If it's a weeknight vs weekend, factor that in.`
    
    case 'events':
      return `The user wants to know what's on tonight.
Distinguish between ticketed events (you have data) 
and free public events (you don't have full data — 
mention Chicago Cultural Center and Millennium Park 
as reliable free options you know about).`
    
    case 'food':
      return `Food question. Lead with the cheapest 
option first since this is a student. Always: 
name, price symbol, current wait, distance. 
Never recommend a spot without all four.`
    
    case 'safety':
      return `Safety question. SAFE or AVOID first.
Be specific about which streets/intersections 
if the data has that. Don't be vague.`

    case 'transit':
      return `Transit question. Check alerts first.
If no alerts, say lines are clean. Be specific 
about which lines serve the DePaul Loop area:
Red Line (Harrison), Blue Line (Clinton), 
Orange/Brown/Pink/Purple (Library/Adams/Wabash).`

    default:
      return `Give a general Loop status. 
One sentence each on: what's on, food options, 
safety, transit. Keep it tight.`
  }
}

// ─── GROQ CHAT ───────────────────────────────────────────

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

async function chat(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  profile: Profile
): Promise<string> {
  console.log('\n[Getting context...]')
  const ctx = await getContext(profile)
  
  const intent = detectIntent(message, history)
  console.log(`[Intent: ${intent}]`)
  const contextString = buildFocusedContext(ctx, intent)

  console.log('[Sending to Groq...]\n')
  process.stdout.write('Pulse AI: ')

  const messages = [
    { role: 'system' as const, content: buildSystemPrompt(ctx, profile, intent, contextString) },
    ...history.slice(-6),
    { role: 'user' as const, content: message }
  ]

  const start = Date.now()

  try {
    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 250,
      stream: true,
      messages
    })

    let full = ''
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? ''
      process.stdout.write(token)
      full += token
    }

    console.log(`\n\n[Response time: ${Date.now() - start}ms]`)
    return full
  } catch (e: any) {
    if (e?.status === 429) {
      console.log('\n⏳ Rate limited — retrying in 5s...')
      await new Promise(r => setTimeout(r, 5000))
      return chat(message, history, profile)
    }
    console.log('\n❌ Groq error:', e?.message)
    return 'Having trouble connecting right now.'
  }
}

// ─── TEST RUNNER ─────────────────────────────────────────

const PROFILE: Profile = {
  name: 'Danish',
  personas: ['student', 'local'],
  university: 'depaul',
  interests: ['food', 'events'],
  currentZone: 'depaul_loop'
}

const TESTS = [
  // Turn 1 — general
  "What's happening in the Loop tonight?",
  
  // Turn 2 — follow-up (should remember turn 1)
  "Any of those free?",
  
  // Turn 3 — specific intent
  "What about sporting events?",
  
  // Turn 4 — social intent
  "Where should I go for drinks after?",
  
  // Turn 5 — safety in context
  "Is it safe to walk back to the DePaul campus after?",
  
  // Turn 6 — transit
  "What CTA line gets me home fastest?"
]

async function main() {
  console.log('=== LOOP PULSE — API STATUS ===')
  const keys = ['GROQ_API_KEY', 'TICKETMASTER_API_KEY', 'YELP_API_KEY',
                'AIRNOW_API_KEY', 'CTA_API_KEY']
  keys.forEach(k => {
    console.log(`${k.padEnd(24)} ${process.env[k] ? '✓ set' : '✗ MISSING'}`)
  })
  console.log('===============================\n')

  const history: Array<{ role: 'user' | 'assistant'; content: string }> = []
  let totalTime = 0
  let totalLen = 0

  for (let i = 0; i < TESTS.length; i++) {
    console.log('\n' + '='.repeat(50))
    console.log('USER: ' + TESTS[i])
    console.log('='.repeat(50))

    const start = Date.now()
    const res = await chat(TESTS[i], history, PROFILE)
    totalTime += Date.now() - start
    totalLen += res.length

    // Append both sides after each turn
    history.push({ role: 'user', content: TESTS[i] })
    history.push({ role: 'assistant', content: res })
    
    // Keep last 6 messages only
    if (history.length > 6) history.splice(0, history.length - 6)

    if (i < TESTS.length - 1) {
      console.log('\n⏳ Waiting 2s...')
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  console.log('\n' + '='.repeat(50))
  console.log('=== SUMMARY ===')
  console.log(`Tests:         ${TESTS.length}`)
  console.log(`Avg time:      ${Math.round(totalTime / TESTS.length)}ms`)
  console.log(`Avg length:    ${Math.round(totalLen / TESTS.length)} chars`)
  console.log('='.repeat(50))
}

main().catch(console.error)