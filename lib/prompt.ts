import { Context, Profile } from './context'
import { Intent } from './intent'
import { getIntentInstructions } from './intent'

const SYSTEM_INSTRUCTIONS = `You are Pulse AI — real-time city intelligence 
for Chicago's Loop. Talk like a local, not a chatbot.

ALWAYS:
- First sentence directly answers the question
- Never start with "I" or "Based on"  
- If recommending food: name · price · wait — all three
- If safety: SAFE or AVOID first, one sentence context
- Max 3 bullets OR 2 short paragraphs, never both
- If data doesn't exist for the question, say so plainly
- NEVER invent events, venues, or details not in the provided data`

export function buildSystemPrompt(
  ctx: Context, 
  profile: Profile, 
  intent: Intent,
  contextString: string
): string {
  return `${SYSTEM_INSTRUCTIONS}

${contextString}

USER: ${profile.name} · ${profile.personas.join(' + ')} · 
${profile.university} · cares about: ${profile.interests.join(', ')}

CURRENT FOCUS: ${getIntentInstructions(intent)}`
}
