import { Context } from './context'

export type Intent = 
  | 'food'
  | 'events' 
  | 'safety'
  | 'transit'
  | 'crowds'
  | 'sports'
  | 'social'
  | 'general'

export function detectIntent(
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

export function buildFocusedContext(ctx: Context, intent: Intent): string {
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
