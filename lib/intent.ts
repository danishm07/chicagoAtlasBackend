import { Context } from './context.js'
import { fetchPerplexity } from './fetchers.js'

export type Intent = 
  | 'food'
  | 'events' 
  | 'safety'
  | 'transit'
  | 'crowds'
  | 'sports'
  | 'social'
  | 'discovery'
  | 'corridor'
  | 'refine'
  | 'planning'
  | 'general'

export function detectIntent(
  message: string, 
  history: Array<{ role: string; content: string }>
): Intent {
  const msg = message.toLowerCase()
  
  // Planning/date/outing intent
  if (/date|outing|plan(ning)?|taking .+ out|impres|romantic|bring someone|first date|anniversary|special night|what should i wear|what to wear|what do i (wear|bring)/i.test(msg))
    return 'planning'
  
  // Check for refinement/rejection of previous suggestions
  if (/none of (those|that|them)|don't like|not (feeling|into)|something (else|different|more)|more specific|other options|anything else|(not|don't) (want|like) (that|those)/i.test(msg))
    return 'refine'

  // Check for corridor/routing intent
  if (/on my way|heading to|going to|between .{1,30} and|route to|walking to|from .{1,30} to|before i get to|stop(ping)? (by|at) on the way|on the way to|pass(ing)? through/i.test(msg))
    return 'corridor'

  // Check for discovery intent  
  if (/niche|hidden|local|secret|underrated|not (well )?known|off the beaten|(local )?gem|authentic|what (locals|people) (go|like)|would a local|less (touristy|crowded)|not (a chain|chains)|independent|small (place|spot|cafe|bar)/i.test(msg))
    return 'discovery'
  
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

export function extractDestination(
  message: string
): string | null {
  // Patterns: "to X", "heading to X", "on my way to X"
  // "from X to Y" — extract Y
  const patterns = [
    /(?:heading|going|walking|on my way) to (.+?)(?:\.|,|$|in \d)/i,
    /from .+? to (.+?)(?:\.|,|$)/i,
    /(?:before i get to|stop.+?on the way to) (.+?)(?:\.|,|$)/i,
    /to the (.+?)(?:\.|,|$| campus| area| neighborhood)/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match?.[1]) {
      return match[1].trim()
    }
  }
  return null
}

export async function buildFocusedContext(
  ctx: Context,
  intent: Intent,
  message: string = ''
): Promise<string> {
  const { weather, safety, events, spots, air, transit, timestamp } = ctx

  // Always include header and weather
  const base = `=== LIVE LOOP DATA — ${timestamp} ===
WEATHER: ${weather.temp} (feels ${weather.feelsLike}) · ${weather.condition}
`

  switch (intent) {
    case 'discovery': {
      const hour = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit'
      })

      // Run Yelp spots and Perplexity in parallel
      const [yelpSpots, perplexityData] = await Promise.all([
        Promise.resolve(spots.slice(0, 3)),
        fetchPerplexity(message, {
          neighborhood: 'Chicago Loop',
          time: hour
        })
      ])

      return base + `
YELP SPOTS (open now, live wait times):
${yelpSpots.map(s =>
  `  - ${s.name} · ${s.category} · ${s.price} ` +
  `· wait: ${s.waitEstimate} · ${s.distance}` 
).join('\n')}

DISCOVERY SPOTS (local knowledge, web-sourced):
${perplexityData || '  - No additional discovery data'}

PRESENTATION RULES:
Lead with the most relevant Yelp spot (practical, 
confirmed open, has wait time). Then offer 1-2 
discovery options as "another option might be..." 
or "if you want something with more character...".
Max 5 recommendations total. Never repeat a place 
mentioned earlier in this conversation.
`
    }

    case 'corridor': {
      const destination = extractDestination(message)
      const hour = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit'
      })

      let corridorNeighborhoods: string[] = ['the Loop']
      let destName = destination ?? 'your destination'

      if (destination) {
        // Geocode destination and generate corridor
        const { geocodeDestination } = 
          await import('./fetchers.js')
        const { generateCorridor } = 
          await import('./utils.js')

        const geoResult = await geocodeDestination(destination)
        if (geoResult) {
          destName = geoResult.neighborhood
          corridorNeighborhoods = generateCorridor(
            { lat: 41.8827, lng: -87.6233 }, // origin: Loop
            { lat: geoResult.lat, lng: geoResult.lng }
          )
        }
      }

      const perplexityData = await fetchPerplexity(
        message,
        {
          neighborhood: 'Chicago Loop',
          time: hour,
          corridor: corridorNeighborhoods
        }
      )

      return base + `
DESTINATION: ${destName}
CORRIDOR: ${corridorNeighborhoods.join(' → ')}

SPOTS NEAR ORIGIN (Yelp, open now):
${spots.slice(0, 2).map(s =>
  `  - ${s.name} · ${s.price} · wait: ${s.waitEstimate}` 
).join('\n')}

SPOTS ALONG ROUTE (web-sourced):
${perplexityData || '  - No corridor data found'}

PRESENTATION RULES:
Tell the user what neighborhoods they'll pass through.
Lead with 1 practical Yelp spot near them now.
Then offer 2-3 spots from the corridor discovery data.
Frame as "on your way through [neighborhood]".
Max 5 total. If a place is niche, say why it's 
worth the stop in one sentence.
`
    }

    case 'refine': {
      return base + `
The user was not satisfied with previous recommendations.
Ask them exactly ONE clarifying question to narrow down
what they're looking for. Choose the most useful question
from these options based on conversation context:
  - "What are you in the mood for — sit down, 
    quick grab, or more of a vibe spot?"
  - "Budget — are we talking under ten dollars, 
    or okay spending a bit more?"
  - "Any cuisine or drink preference, 
    or just something with character?"
  - "How much time do you have — quick stop 
    or somewhere to hang for a bit?"

Ask only ONE question. Do not make recommendations 
yet. Wait for their answer then re-query with 
that specificity added.
`
    }

    case 'planning': {
      const hour = new Date().toLocaleTimeString(
        'en-US', { hour: '2-digit', minute: '2-digit' }
      )
      const destination = extractDestination(message)

      // Run Yelp + Perplexity in parallel
      const [yelpSpots, perplexityData] = await Promise.all([
        Promise.resolve(spots.slice(0, 4)),
        fetchPerplexity(message, {
          neighborhood: destination ?? 'North Loop Chicago',
          time: hour,
          type: 'cafe restaurant bar date-appropriate'
        })
      ])

      return base + `
PLANNING CONTEXT — synthesize ALL data sources below
into a single coherent recommendation covering:
spot, attire, route stops, and logistics.

WEATHER RIGHT NOW:
  Temp: ${ctx.weather.temp}
  Feels like: ${ctx.weather.feelsLike}
  Condition: ${ctx.weather.condition}
  Wind: ${ctx.weather.wind}

ATTIRE GUIDANCE RULES:
  Under 20°F feels like → "wear a real coat, 
    not just a jacket — something you can 
    actually look good in while being warm"
  20-35°F → "heavy coat, layers work"
  35-50°F → "coat or heavy jacket"  
  Above 50°F → "light jacket is fine"
  Wind above 15mph → always mention wind chill
  Rain/snow → mention footwear

AIR QUALITY: AQI ${ctx.air.aqi} — ${ctx.air.category}
  Good/Moderate → outdoor options viable
  Poor → steer toward indoor spots only

SAFETY CONTEXT:
  ${ctx.safety.incidents} incidents near area
  ${ctx.safety.recommendation}

EVENTS NEARBY TONIGHT:
${ctx.events.slice(0, 3).map(e =>
  `  - ${e.name} at ${e.venue} · ${e.time}` 
).join('\n') || '  None tonight'}
  Use events as: potential second stop suggestions,
  crowd context for the area, or things to avoid

TRANSIT:
  Status: ${ctx.transit}
  Use for: getting there recommendation + getting
  home late at night guidance

YELP SPOTS (open, real wait times):
${yelpSpots.map(s =>
  `  - ${s.name} · ${s.category} · ${s.price} ` +
  `· ${s.waitEstimate} · ${s.distance}` 
).join('\n')}

DISCOVERY SPOTS (local, niche, date-appropriate):
${perplexityData}

RESPONSE STRUCTURE FOR PLANNING QUERIES:
Answer in this order, conversationally not as a list:
1. The spot recommendation with why it fits 
   (ambiance + data + practical)
2. What to wear — specific to today's conditions,
   one sentence, practical and real
3. One or two stops along the way if corridor applies
4. One logistics note (transit, parking, crowd warning)
5. Optional: one event nearby that could extend the night

TONE FOR DATE/PLANNING QUERIES:
Speak like the friend who's been to these places.
Not a concierge, not a list. Opinionated.
"That place is perfect for a first date because 
 it's quiet enough to actually talk" is better
than "Cafe X has good ambiance."
Never use the word "ambiance" or "vibe" — show it.
`
    }

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

export function getIntentInstructions(intent: Intent): string {
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
