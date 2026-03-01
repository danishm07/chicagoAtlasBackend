import Groq from 'groq-sdk'
import { NextRequest, NextResponse } from 'next/server'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

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
    const formData = await req.formData()
    const audioFile = formData.get('audio') as File
    
    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3-turbo',
      language: 'en',
      response_format: 'json'
    })

    return NextResponse.json(
      { transcript: transcription.text },
      { headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (error: any) {
    console.error('[TRANSCRIBE]', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  }
}
