import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Chicago neighborhood bounding boxes for corridor mapping
const CHICAGO_NEIGHBORHOODS: Array<{
  name: string
  lat: number
  lng: number
}> = [
  { name: 'the Loop', lat: 41.8827, lng: -87.6233 },
  { name: 'River North', lat: 41.8936, lng: -87.6347 },
  { name: 'Streeterville', lat: 41.8928, lng: -87.6189 },
  { name: 'Old Town', lat: 41.9100, lng: -87.6360 },
  { name: 'Lincoln Park', lat: 41.9241, lng: -87.6508 },
  { name: 'Wicker Park', lat: 41.9084, lng: -87.6800 },
  { name: 'West Loop', lat: 41.8827, lng: -87.6467 },
  { name: 'South Loop', lat: 41.8700, lng: -87.6233 },
  { name: 'Pilsen', lat: 41.8561, lng: -87.6562 },
  { name: 'Bucktown', lat: 41.9183, lng: -87.6733 },
  { name: 'Logan Square', lat: 41.9219, lng: -87.7084 },
  { name: 'Andersonville', lat: 41.9803, lng: -87.6686 },
  { name: 'Lakeview', lat: 41.9436, lng: -87.6500 },
  { name: 'Uptown', lat: 41.9656, lng: -87.6500 },
  { name: 'Hyde Park', lat: 41.7943, lng: -87.5907 },
]

function distanceBetween(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  // Simple Euclidean distance (fine for same-city routing)
  return Math.sqrt(
    Math.pow(lat2 - lat1, 2) + Math.pow(lng2 - lng1, 2)
  )
}

export function generateCorridor(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): string[] {
  // Find neighborhoods that fall roughly between 
  // origin and destination
  const originNeighborhood = CHICAGO_NEIGHBORHOODS
    .reduce((closest, n) => {
      const d = distanceBetween(
        origin.lat, origin.lng, n.lat, n.lng
      )
      const cd = distanceBetween(
        origin.lat, origin.lng, 
        closest.lat, closest.lng
      )
      return d < cd ? n : closest
    })

  const destNeighborhood = CHICAGO_NEIGHBORHOODS
    .reduce((closest, n) => {
      const d = distanceBetween(
        destination.lat, destination.lng, n.lat, n.lng
      )
      const cd = distanceBetween(
        destination.lat, destination.lng,
        closest.lat, closest.lng
      )
      return d < cd ? n : closest
    })

  // Find intermediate neighborhoods along the corridor
  const intermediate = CHICAGO_NEIGHBORHOODS.filter(n => {
    // Must be between origin and destination lat/lng bounds
    const minLat = Math.min(origin.lat, destination.lat)
    const maxLat = Math.max(origin.lat, destination.lat)
    const minLng = Math.min(origin.lng, destination.lng)
    const maxLng = Math.max(origin.lng, destination.lng)

    const latPad = 0.01
    const lngPad = 0.01

    return (
      n.lat >= minLat - latPad &&
      n.lat <= maxLat + latPad &&
      n.lng >= minLng - lngPad &&
      n.lng <= maxLng + lngPad &&
      n.name !== originNeighborhood.name &&
      n.name !== destNeighborhood.name
    )
  })

  return [
    originNeighborhood.name,
    ...intermediate.map(n => n.name),
    destNeighborhood.name
  ]
}
