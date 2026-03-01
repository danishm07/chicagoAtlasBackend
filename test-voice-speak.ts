
import { config } from 'dotenv'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { execSync, spawn } from 'child_process'
import { createInterface } from 'readline'
import Groq from 'groq-sdk'
import { getContext } from './lib/context.js'
import { detectIntent, buildFocusedContext } from './lib/intent.js'
import { buildSystemPrompt } from './lib/prompt.js'

config({ path: '.env.local' })

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID
  ?? 'iP95p4xoKVk53GoZ742B'

const PROFILE = {
  name: 'Danish',
  personas: ['student', 'local'],
  university: 'depaul',
  interests: ['food', 'events'],
  currentZone: 'loop'
}

const history: Array<{
  role: 'user' | 'assistant'
  content: string
}> = []

// ─── RECORD MIC ──────────────────────────────────────────
// Records until user presses Enter
// Returns path to recorded audio file

async function record(): Promise<string> {
  const filename = `/tmp/harold-input-${Date.now()}.wav`
  
  console.log('\n🎙️  Listening... (press Enter to stop)')
  
  // Start sox recording in background
  const rec = spawn('sox', [
    '-d',           // default audio input (mic)
    filename,       // output file
    'rate', '16000',// 16kHz — optimal for Whisper
    'channels', '1' // mono
  ], { stdio: 'ignore' })

  // Wait for Enter key
  await new Promise<void>(resolve => {
    const rl = createInterface({ 
      input: process.stdin, 
      output: process.stdout 
    })
    rl.question('', () => {
      rl.close()
      resolve()
    })
  })

  // Stop recording
  rec.kill('SIGTERM')
  
  // Small delay to ensure file is flushed
  await new Promise(r => setTimeout(r, 200))
  
  console.log('⏳ Transcribing...')
  return filename
}

// ─── TRANSCRIBE ──────────────────────────────────────────

async function transcribe(audioPath: string): Promise<string> {
  try {
    const { createReadStream } = await import('fs')
    
    const transcription = await groq.audio.transcriptions.create({
      file: createReadStream(audioPath) as any,
      model: 'whisper-large-v3-turbo',
      language: 'en',
      response_format: 'json'
    })

    // Clean up temp file
    try { unlinkSync(audioPath) } catch {}
    
    return transcription.text.trim()
  } catch(e: any) {
    console.log('[TRANSCRIBE] ✗', e.message)
    return ''
  }
}

// ─── SPEAK ───────────────────────────────────────────────

async function speak(text: string): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    console.log('[SPEAK] No key — skipping audio')
    return
  }

  try {
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
          text: text.slice(0, 500),
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.65,
            similarity_boost: 0.55,
            style: 0.0,
            use_speaker_boost: false
          }
        })
      }
    )

    if (!response.ok) throw new Error(await response.text())

    const buffer = await response.arrayBuffer()
    const tmpAudio = `/tmp/harold-out-${Date.now()}.mp3`
    writeFileSync(tmpAudio, Buffer.from(buffer))
    
    // Auto-play on Mac using afplay (built-in, no install needed)
    execSync(`afplay ${tmpAudio}`)
    
    // Clean up
    try { unlinkSync(tmpAudio) } catch {}
    
  } catch(e: any) {
    console.log('[SPEAK] ✗', e.message)
  }
}

// ─── HAROLD ──────────────────────────────────────────────

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
    max_tokens: 200,
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

  history.push({ role: 'user', content: userMessage })
  history.push({ role: 'assistant', content: full })
  if (history.length > 8) history.splice(0, history.length - 8)

  return full
}

// ─── MAIN ────────────────────────────────────────────────

async function main() {
  console.log('=== HAROLD — VOICE MODE ===')
  console.log('GROQ:       ', process.env.GROQ_API_KEY ? '✓' : '✗')
  console.log('ELEVENLABS: ', process.env.ELEVENLABS_API_KEY ? '✓' : '✗')
  console.log('PERPLEXITY: ', process.env.PERPLEXITY_API_KEY ? '✓' : '✗')
  console.log('SOX:        ', (() => { 
    try { execSync('which sox', { stdio: 'ignore' }); return '✓' } 
    catch { return '✗ run: brew install sox' } 
  })())
  console.log('===========================\n')

  // Check sox is installed
  try {
    execSync('which sox', { stdio: 'ignore' })
  } catch {
    console.log('❌ sox not found. Install with: brew install sox')
    console.log('Sox records your mic for voice input.')
    process.exit(1)
  }

  console.log('Harold will speak back through your speakers.')
  console.log('Hold a full conversation — he remembers context.')
  console.log('Say "quit" or type quit to end.\n')

  // Harold opens
  const opening = await harold(
    'Greet the user in one short sentence. ' +
    'Mention one real thing happening in Chicago right now.'
  )
  await speak(opening)

  // Voice loop
  const loop = async () => {
    const audioPath = await record()
    const transcript = await transcribe(audioPath)
    
    if (!transcript) {
      console.log('(Could not hear that — try again)')
      return loop()
    }
    
    console.log(`\nYou said: "${transcript}"`)
    
    if (/^(quit|exit|bye|stop)$/i.test(transcript.trim())) {
      const goodbye = await harold('Say a short goodbye.')
      await speak(goodbye)
      console.log('\nHarold: Stay safe out there.')
      process.exit(0)
    }

    const response = await harold(transcript)
    await speak(response)
    loop()
  }

  loop()
}

main().catch(console.error)

