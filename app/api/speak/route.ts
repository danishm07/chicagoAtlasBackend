import { NextRequest, NextResponse } from 'next/server'

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID 
  ?? 'pNInz6obpgDQGcFmaJgB'

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json()
    
    if (!text) {
      return NextResponse.json(
        { error: 'No text provided' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Trim to 500 chars max — Harold keeps it concise
    const trimmed = text.slice(0, 500)

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '',
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text: trimmed,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true
          }
        })
      }
    )

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`ElevenLabs error: ${err}`)
    }

    // Stream audio directly back to client
    return new NextResponse(response.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  } catch (error: any) {
    console.error('[SPEAK]', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  }
}
