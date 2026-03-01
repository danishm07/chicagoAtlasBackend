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
