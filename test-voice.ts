import { config } from 'dotenv'
import { writeFileSync, existsSync } from 'fs'
import { createInterface } from 'readline'
import Groq from 'groq-sdk'

import { getContext } from './lib/context.js'
import { detectIntent, buildFocusedContext } from './lib/intent.js'
import { buildSystemPrompt } from './lib/prompt.js'

config({ path: '.env.local' })

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID 
  ?? 'pNInz6obpgDQGcFmaJgB'

const PROFILE = {
  name: 'Danish',
  personas: ['student', 'local'],
  university: 'depaul',
  interests: ['food', 'events'],
  currentZone: 'loop'
}

// Conversation history — persists across turns
const history: Array<{
  role: 'user' | 'assistant'
  content: string
}> = []

// ─── SPEAK ───────────────────────────────────────────────

async function speak(text: string): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    console.log('[SPEAK] No ElevenLabs key — skipping audio')
    return
  }

  try {
    const trimmed = text.slice(0, 500)
    
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
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

    if (!response.ok) throw new Error(await response.text())

    const buffer = await response.arrayBuffer()
    const filename = `harold-${Date.now()}.mp3`
    writeFileSync(filename, Buffer.from(buffer))
    
    console.log(`\n🔊 Audio saved: ${filename}`)
    console.log('Open that file to hear Harold\'s response.')
    
  } catch(e: any) {
    console.log('[SPEAK] ✗', e.message)
  }
}

// ─── HAROLD RESPONDS ─────────────────────────────────────

async function harold(userMessage: string): Promise<string> {
  process.stdout.write('\nHarold: ')
  
  const ctx = await getContext(PROFILE)
  const intent = detectIntent(userMessage, history)
  const contextString = await buildFocusedContext(ctx, intent, userMessage)
  const systemPrompt = buildSystemPrompt(
    ctx, PROFILE, intent, contextString
  )

  const stream = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.3,
    max_tokens: 250,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6),
      { role: 'user', content: userMessage }
    ]
  })

  let full = ''
  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? ''
    process.stdout.write(token)
    full += token
  }
  console.log('\n')

  // Add both sides to history
  history.push({ role: 'user', content: userMessage })
  history.push({ role: 'assistant', content: full })

  // Keep last 8 messages
  if (history.length > 8) history.splice(0, history.length - 8)

  return full
}

// ─── MAIN LOOP ────────────────────────────────────────────

async function main() {
  console.log('=== HAROLD VOICE CHAT TEST ===')
  console.log('GROQ:        ', process.env.GROQ_API_KEY ? '✓' : '✗')
  console.log('ELEVENLABS:  ', process.env.ELEVENLABS_API_KEY ? '✓' : '✗')
  console.log('==============================')
  console.log('\nMode options:')
  console.log('  text  — type messages, Harold responds in text + audio')
  console.log('  quit  — exit\n')
  console.log('This is a FULL conversation — Harold remembers context.')
  console.log('Try follow-ups like "any of those free?" or "is it safe?"\n')

  // Harold opens the conversation
  const opening = await harold(
    `Introduce yourself briefly and tell me 
     what you know about the Loop right now. 
     One sentence only.`
  )
  await speak(opening)

  // Interactive loop
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  })

  const ask = () => {
    rl.question('You: ', async (input) => {
      const msg = input.trim()
      
      if (!msg) { ask(); return }
      if (msg.toLowerCase() === 'quit') {
        console.log('\nHarold: Stay safe out there.')
        rl.close()
        return
      }

      const response = await harold(msg)
      await speak(response)
      ask() // next turn
    })
  }

  ask()
}

main().catch(console.error)