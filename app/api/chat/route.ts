import { getContext, buildContextString } from '@/lib/context'
import { detectIntent } from '@/lib/intent'  
import { buildSystemPrompt } from '@/lib/prompt'
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { NextRequest, NextResponse } from 'next/server'

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
    
    // 1. Fetch the live context block
    const ctx = await getContext(profile)
    const contextString = buildContextString(ctx)
    
    // 2. Detect the intent (is this about food, transit, safety?)
    const intent = detectIntent(message, history ?? [])
    
    // 3. Build the hyper-personalized system prompt
    const systemPrompt = buildSystemPrompt(ctx, profile, intent, contextString)

    // 4. Stream the response using OpenAI gpt-4o-mini
    const result = await streamText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      messages: [
        ...(history ?? []).slice(-6),
        { role: 'user', content: message }
      ],
      temperature: 0.3,
      maxOutputTokens: 200, // Keep responses tight
    })

    return result.toTextStreamResponse({
      headers: {
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