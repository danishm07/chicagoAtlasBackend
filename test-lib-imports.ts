// Simple test to verify lib imports work
import { getContext, Profile } from './lib/context'
import { detectIntent } from './lib/intent'
import { buildSystemPrompt } from './lib/prompt'

const testProfile: Profile = {
  name: 'Test User',
  personas: ['student'],
  university: 'depaul',
  interests: ['food'],
  currentZone: 'loop'
}

async function testLibImports() {
  console.log('Testing lib imports...')
  
  try {
    // Test intent detection
    const intent = detectIntent('What food is nearby?', [])
    console.log('✓ Intent detection works:', intent)
    
    // Test context building (this will make API calls)
    console.log('Testing context building...')
    const ctx = await getContext(testProfile)
    console.log('✓ Context building works')
    
    // Test system prompt building
    const prompt = buildSystemPrompt(ctx, testProfile, intent, 'test context')
    console.log('✓ System prompt building works')
    
    console.log('\n🎉 All lib imports working correctly!')
    
  } catch (error) {
    console.error('❌ Error testing lib imports:', error)
  }
}

testLibImports()
