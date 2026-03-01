import { getContext } from '@/lib/context'
import { detectIntent, buildFocusedContext } from '@/lib/intent'  
import { buildSystemPrompt } from '@/lib/prompt'
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
    const { message, history, profile } = await req.json()
    
    const ctx = await getContext(profile)
    const intent = detectIntent(message, history ?? [])
    const contextString = await buildFocusedContext(ctx, intent, message)
    const systemPrompt = buildSystemPrompt(
      ctx, profile, intent, contextString
    )

    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 180,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...(history ?? []).slice(-6),
        { role: 'user', content: message }
      ]
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const token = chunk.choices[0]?.delta?.content ?? ''
          if (token) controller.enqueue(encoder.encode(token))
        }
        controller.close()
      }
    })

    return new NextResponse(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { 
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' }
      }
    )
  }
}
