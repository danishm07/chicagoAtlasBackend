import { getContext, buildContextString } from '@/lib/context'
import { fetchPerplexity } from '@/lib/fetchers'
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
    
    // 1. Fetch standard live context
    const ctx = await getContext(profile)
    let contextString = buildContextString(ctx)

    // 2. SMART PERPLEXITY TRIGGER
    // If the user is asking for places, discovery, or recommendations, trigger Sonar
    const q = message.toLowerCase()
    const needsDiscovery = q.includes('recs') || q.includes('cafe') || q.includes('coffee') || 
                           q.includes('food') || q.includes('find') || q.includes('where') || 
                           q.includes('lowkey') || q.includes('niche') || q.includes('stop at')

    if (needsDiscovery) {
      console.log("[ROUTER] Discovery intent detected. Firing Perplexity...")
      // We pass the actual user message to Perplexity so it searches exactly what they want
      const pxData = await fetchPerplexity(message, { 
        neighborhood: profile?.currentZone ?? 'Chicago Loop', 
        time: ctx.timestamp 
      })
      if (pxData) {
        contextString += `\n\n=== DEEP DISCOVERY DATA (PERPLEXITY) ===\nUse this data specifically for recommendations:\n${pxData}\n=== END DEEP DISCOVERY ===`
      }
    }

    // 3. Build the Vibe Prompt
    const systemPrompt = buildSystemPrompt(ctx, profile, null as any, contextString)

    // 4. Stream with Groq (Llama 3.3 70b)
    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.4, // Bumped up slightly for better personality
      max_tokens: 350,  // Give Harold room to talk
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
    console.error("[CHAT ROUTE ERROR]", error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  }
}