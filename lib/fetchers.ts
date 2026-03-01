// ─── TYPES ───────────────────────────────────────────────

export interface WeatherData {
  temp: string
  feelsLike: string
  condition: string
  wind: string
}

export interface SafetyData {
  incidentCount: number
  incidents: Array<{ description: string; location: string; severity: 'low' | 'medium' | 'high' }>
  safetyScore: number
  recommendation: string
}

export interface EventData {
  name: string
  venue: string
  time: string
  price: string
  distance: string
  rawTime?: string
}

export interface SpotData {
  name: string
  category: string
  price: string
  distance: string
  rating: number
  waitEstimate: string
}

export interface AirData {
  aqi: number
  category: string
  recommendation: string
}

export interface TransitData {
  alerts: Array<{ route: string; headline: string }>
  status: string
}

export interface GeoResult {
  lat: number
  lng: number
  neighborhood: string
  fullAddress: string
}

export interface EventbriteData {
  name: string
  venue: string
  time: string
  price: string
  distance: string
  category: string
}

// ─── FETCHERS ────────────────────────────────────────────

export async function fetchWeather(): Promise<WeatherData> {
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

export async function fetchSafety(): Promise<SafetyData> {
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

export async function fetchEvents(): Promise<EventData[]> {
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
      const rawTime = e.dates?.start?.dateTime
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
        distance: venue?.distance ? `${Number(venue.distance).toFixed(1)} mi` : 'Nearby',
        rawTime
      }
    })

    // Filter out stale events (older than 30 minutes ago)
    const currentTime = new Date()
    const upcoming = processed.filter((e: any) => {
      if (!e.rawTime) return true
      return new Date(e.rawTime).getTime() > currentTime.getTime() - 30 * 60 * 1000
    })

    console.log(`[EVENTS] ✓ real data — ${upcoming.length} upcoming events (filtered from ${processed.length} total)`)
    return upcoming
  } catch (e) {
    console.log(`[EVENTS] ✗ mock — ${e}`)
    // Minimal mock — no DePaul game injected
    return [
      { name: 'Chicago Cultural Center', venue: 'Cultural Center',
        time: 'Open now', price: 'Free', distance: '0.2 mi' }
    ]
  }
}

export async function fetchSpots(): Promise<SpotData[]> {
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

export async function fetchAir(): Promise<AirData> {
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

export async function fetchTransit(): Promise<TransitData> {
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

export async function fetchPerplexity(
  query: string,
  context: {
    neighborhood: string
    time: string
    type?: string
    corridor?: string[]
  }
): Promise<string> {
  const key = process.env.PERPLEXITY_API_KEY
  if (!key) {
    console.log('[PERPLEXITY] ✗ no key')
    return ''
  }

  try {
    // Build the prompt based on whether this is 
    // a corridor query or a neighborhood query
    const locationContext = context.corridor?.length
      ? `along the route through ${context.corridor.join(', ')} in Chicago` 
      : `near ${context.neighborhood} in Chicago` 

    const typeContext = context.type
      ? `specifically ${context.type}` 
      : 'restaurants, cafes, bars, or interesting spots'

    const prompt =
      `Find 3 lesser-known, locally-loved ${typeContext} ` +
      `${locationContext}. ` +
      `Current time: ${context.time}. ` +
      `Rules: currently open only, no national chains, ` +
      `not the obvious tourist spots, places a Chicago ` +
      `local would actually recommend. ` +
      `For each place include: name, the cross street ` +
      `or neighborhood, one sentence on what makes it ` +
      `worth visiting, and rough price range. ` +
      `Be specific — real place names only.` 

    const res = await fetch(
      'https://api.perplexity.ai/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 400,
          temperature: 0.2
        })
      }
    )

    if (!res.ok) throw new Error(`status ${res.status}`)
    const d = await res.json()
    const result = d.choices?.[0]?.message?.content ?? ''
    console.log('[PERPLEXITY] ✓ discovery data')
    return result
  } catch(e: any) {
    console.log(`[PERPLEXITY] ✗ ${e.message}`)
    return ''
  }
}

export async function geocodeDestination(
  destination: string
): Promise<GeoResult | null> {
  const key = process.env.AZURE_MAPS_KEY
  if (!key) return null

  try {
    const query = encodeURIComponent(
      `${destination}, Chicago, IL` 
    )
    const res = await fetch(
      `https://atlas.microsoft.com/search/address/json` +
      `?api-version=1.0&query=${query}` +
      `&subscription-key=${key}` +
      `&countrySet=US&limit=1` 
    )
    if (!res.ok) throw new Error(`status ${res.status}`)
    const d = await res.json()
    const result = d.results?.[0]
    if (!result) return null

    const pos = result.position
    const addr = result.address

    // Extract neighborhood — try municipality subdivision
    // then neighborhood, then freeform address
    const neighborhood =
      addr.municipalitySubdivision?.split(',')?.[0] ??
      addr.neighbourhood ??
      addr.freeformAddress ??
      destination

    console.log(`[GEOCODE] ✓ ${destination} → ${neighborhood}`)
    return {
      lat: pos.lat,
      lng: pos.lon,
      neighborhood,
      fullAddress: addr.freeformAddress
    }
  } catch(e: any) {
    console.log(`[GEOCODE] ✗ ${e.message}`)
    return null
  }
}

export async function fetchEventbrite(): Promise<EventbriteData[]> {
  const key = process.env.EVENTBRITE_API_KEY
  if (!key) {
    console.log('[EVENTBRITE] ✗ no key')
    return []
  }

  try {
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    
    const res = await fetch(
      `https://www.eventbriteapi.com/v3/events/search/` +
      `?location.address=Chicago%20Loop` +
      `&start_date.range_start=${today}T00:00:00Z` +
      `&start_date.range_end=${tomorrow}T23:59:59Z` +
      `&expand=venue` +
      `&sort_by=date` +
      `&price=free` +
      `&limit=5`,
      {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!res.ok) throw new Error(`status ${res.status}`)
    const d = await res.json()
    const events = d.events ?? []

    const processed = events.map((e: any) => {
      const venue = e.venue
      const startTime = e.start?.local
      const timeStr = startTime ? new Date(startTime).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }) : 'Time TBD'

      // Calculate rough distance from Loop center
      const venueLat = venue?.latitude ?? 41.8827
      const venueLng = venue?.longitude ?? -87.6233
      const distance = Math.sqrt(
        Math.pow(venueLat - 41.8827, 2) + 
        Math.pow(venueLng - -87.6233, 2)
      ) * 69 // Rough miles conversion

      return {
        name: e.name?.text ?? 'Event',
        venue: venue?.name ?? 'Chicago venue',
        time: timeStr,
        price: e.is_free ? 'Free' : e.ticket_availability?.minimum_ticket_price?.major_value 
          ? `$${e.ticket_availability.minimum_ticket_price.major_value}` 
          : 'See site',
        distance: `${distance.toFixed(1)} mi`,
        category: e.category?.name ?? 'Event'
      }
    })

    console.log(`[EVENTBRITE] ✓ real data — ${processed.length} free events`)
    return processed
  } catch(e: any) {
    console.log(`[EVENTBRITE] ✗ ${e.message}`)
    return []
  }
}
