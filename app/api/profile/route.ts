import { NextRequest, NextResponse } from 'next/server'
import { Profile } from '@/lib/context'

// In-memory storage for demo purposes
// In production, you'd use a database
let profiles: Map<string, Profile> = new Map()

function validatePersonas(personas: string[]): string[] {
  const normalizedPersonas = personas.map(p => p.toLowerCase().trim())
  
  // Visitor Rule: If "Visitor" is selected, clear all other personas
  if (normalizedPersonas.includes('visitor')) {
    return ['visitor']
  }
  
  // Student Rule: If "University Student" is selected, allow only one additional from "Commuter" or "Local"
  if (normalizedPersonas.includes('student') || normalizedPersonas.includes('university student')) {
    const studentIndex = normalizedPersonas.findIndex(p => p === 'student' || p === 'university student')
    const otherPersonas = normalizedPersonas.filter((p, index) => 
      index !== studentIndex && (p === 'commuter' || p === 'local')
    )
    
    if (otherPersonas.length > 1) {
      // Keep only the first additional persona
      return [normalizedPersonas[studentIndex], otherPersonas[0]]
    }
    
    return normalizedPersonas.length > 1 
      ? [normalizedPersonas[studentIndex], otherPersonas[0] || normalizedPersonas.find(p => p !== 'student' && p !== 'university student')!]
      : [normalizedPersonas[studentIndex]]
  }
  
  // Default Rule: Cap selection at 2 total
  return normalizedPersonas.slice(0, 2)
}

function normalizePersona(persona: string): string {
  const normalized = persona.toLowerCase().trim()
  switch (normalized) {
    case 'university student':
    case 'student':
      return 'student'
    case 'visitor':
      return 'visitor'
    case 'commuter':
      return 'commuter'
    case 'local':
      return 'local'
    default:
      return normalized
  }
}

export async function POST(req: NextRequest) {
  try {
    const { profile, action } = await req.json()
    
    if (!profile) {
      return NextResponse.json(
        { error: 'Profile data is required' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }
    
    const profileId = profile.name || 'default'
    
    if (action === 'save') {
      // Save new profile with validation
      const validatedPersonas = profile.personas ? validatePersonas(profile.personas) : []
      const normalizedPersonas = validatedPersonas.map(normalizePersona)
      
      const newProfile: Profile = {
        ...profile,
        personas: normalizedPersonas
      }
      
      profiles.set(profileId, newProfile)
      
      return NextResponse.json(
        { profile: newProfile, message: 'Profile saved successfully' },
        { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }
    
    if (action === 'update') {
      // Update existing profile with validation
      const existingProfile = profiles.get(profileId)
      if (!existingProfile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } }
        )
      }
      
      const validatedPersonas = profile.personas ? validatePersonas(profile.personas) : []
      const normalizedPersonas = validatedPersonas.map(normalizePersona)
      
      const updatedProfile: Profile = {
        ...existingProfile,
        ...profile,
        personas: normalizedPersonas
      }
      
      profiles.set(profileId, updatedProfile)
      
      return NextResponse.json(
        { profile: updatedProfile, message: 'Profile updated successfully' },
        { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }
    
    return NextResponse.json(
      { error: 'Invalid action. Use "save" or "update"' },
      { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
    
  } catch (error: any) {
    console.error("[PROFILE ROUTE ERROR]", error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const profileId = searchParams.get('id') || 'default'
    
    const profile = profiles.get(profileId)
    
    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }
    
    return NextResponse.json(
      { profile },
      { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
    
  } catch (error: any) {
    console.error("[PROFILE GET ERROR]", error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}
