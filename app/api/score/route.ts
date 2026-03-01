import { getContext } from '@/lib/context'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const profile = {
      name: '', personas: ['local'], university: '',
      interests: [], currentZone: 'loop'
    }
    const ctx = await getContext(profile)
    
    const score = Math.round(
      ctx.safety.safetyScore * 0.35 +
      Math.min(ctx.events.length * 12, 36) +
      (ctx.air.aqi < 50 ? 29 : ctx.air.aqi < 100 ? 20 : 10)
    )

    return NextResponse.json({
      score,
      label: score >= 80 ? 'Great time to be out' :
             score >= 65 ? 'Decent out there' :
             score >= 50 ? 'A few things to watch' :
             'Worth knowing before you head out',
      weather: ctx.weather,
      safety: {
        score: ctx.safety.safetyScore,
        incidents: ctx.safety.incidentCount,
        recommendation: ctx.safety.recommendation
      },
      events: ctx.events.length,
      transit: ctx.transit.status,
      air: ctx.air,
      updatedAt: ctx.timestamp
    }, {
      headers: { 'Access-Control-Allow-Origin': '*' }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  }
}
