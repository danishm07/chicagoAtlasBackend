import { Profile } from './context'

const PROFILE_STORAGE_KEY = 'loop-pulse-profile'

export class ProfileStorage {
  // Save profile to localStorage
  static saveProfile(profile: Profile): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
      } catch (error) {
        console.error('Failed to save profile to localStorage:', error)
      }
    }
  }

  // Get profile from localStorage
  static getProfile(): Profile | null {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(PROFILE_STORAGE_KEY)
        return stored ? JSON.parse(stored) : null
      } catch (error) {
        console.error('Failed to load profile from localStorage:', error)
        return null
      }
    }
    return null
  }

  // Update profile with validation via API
  static async updateProfile(profile: Partial<Profile>): Promise<Profile> {
    const currentProfile = this.getProfile() || {
      name: '',
      personas: ['local'],
      university: '',
      interests: [],
      currentZone: 'The Loop'
    }

    const updatedProfile = { ...currentProfile, ...profile }

    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profile: updatedProfile,
          action: 'update'
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update profile')
      }

      const { profile: validatedProfile } = await response.json()
      this.saveProfile(validatedProfile)
      return validatedProfile
    } catch (error) {
      console.error('Failed to update profile via API:', error)
      // Fallback to local validation
      const validatedProfile = this.validatePersonas(updatedProfile)
      this.saveProfile(validatedProfile)
      return validatedProfile
    }
  }

  // Save new profile with validation via API
  static async saveNewProfile(profile: Profile): Promise<Profile> {
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profile,
          action: 'save'
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save profile')
      }

      const { profile: validatedProfile } = await response.json()
      this.saveProfile(validatedProfile)
      return validatedProfile
    } catch (error) {
      console.error('Failed to save profile via API:', error)
      // Fallback to local validation
      const validatedProfile = this.validatePersonas(profile)
      this.saveProfile(validatedProfile)
      return validatedProfile
    }
  }

  // Local persona validation (fallback)
  static validatePersonas(profile: Profile): Profile {
    const personas = profile.personas || []
    const normalizedPersonas = personas.map(p => p.toLowerCase().trim())

    // Visitor Rule: If "Visitor" is selected, clear all other personas
    if (normalizedPersonas.includes('visitor')) {
      return { ...profile, personas: ['visitor'] }
    }

    // Student Rule: If "University Student" is selected, allow only one additional from "Commuter" or "Local"
    if (normalizedPersonas.includes('student') || normalizedPersonas.includes('university student')) {
      const studentIndex = normalizedPersonas.findIndex(p => p === 'student' || p === 'university student')
      const otherPersonas = normalizedPersonas.filter((p, index) => 
        index !== studentIndex && (p === 'commuter' || p === 'local')
      )

      if (otherPersonas.length > 1) {
        // Keep only the first additional persona
        return { 
          ...profile, 
          personas: [normalizedPersonas[studentIndex], otherPersonas[0]].map(this.normalizePersona) 
        }
      }

      const finalPersonas = normalizedPersonas.length > 1 
        ? [normalizedPersonas[studentIndex], otherPersonas[0] || normalizedPersonas.find(p => p !== 'student' && p !== 'university student')!]
        : [normalizedPersonas[studentIndex]]

      return { ...profile, personas: finalPersonas.map(this.normalizePersona) }
    }

    // Default Rule: Cap selection at 2 total
    return { 
      ...profile, 
      personas: normalizedPersonas.slice(0, 2).map(this.normalizePersona) 
    }
  }

  // Normalize persona names
  private static normalizePersona(persona: string): string {
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

  // Clear stored profile
  static clearProfile(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(PROFILE_STORAGE_KEY)
    }
  }
}
