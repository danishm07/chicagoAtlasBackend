import { getContext } from '@/lib/context'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const filter = req.nextUrl.searchParams.get('filter') ?? 'all'
    const profile = {
      name: '', personas: ['local'], university: '',
      interests: [], currentZone: 'loop'
    }
    const ctx = await getContext(profile)

    const feedItems = [
      ...ctx.events.map((e, i) => ({
        id: `event-${i}`,
        type: 'event',
        title: e.name,
        description: `${e.venue} · ${e.time} · ${e.price}`,
        meta: e.distance,
        time: e.time,
        tag: 'Event'
      })),
      ...ctx.spots.slice(0, 5).map((s, i) => ({
        id: `spot-${i}`,
        type: 'food',
        title: s.name,
        description: `${s.category} · ${s.price} · ${s.waitEstimate} wait`,
        meta: s.distance,
        time: 'Open now',
        tag: 'Food'
      })),
      ...ctx.safety.incidents.map((inc, i) => ({
        id: `incident-${i}`,
        type: 'safety',
        title: inc.description,
        description: ctx.safety.recommendation,
        meta: 'Near you',
        time: 'Recent',
        tag: 'Safety'
      })),
      ...(ctx.transit.alerts.map((a, i) => ({
        id: `transit-${i}`,
        type: 'transit',
        title: a.route,
        description: a.headline,
        meta: 'CTA',
        time: 'Active',
        tag: 'Transit'
      })))
    ]

    const filtered = filter === 'all' 
      ? feedItems 
      : feedItems.filter(item => item.type === filter)

    return NextResponse.json(filtered, {
      headers: { 'Access-Control-Allow-Origin': '*' }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  }
}
