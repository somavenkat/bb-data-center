import React, { useMemo, useState, useRef, useEffect } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import CircularProgress from '@mui/material/CircularProgress'
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default marker icons in Leaflet
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Red marker icon for main location (CDN PNG)
const redMarkerIcon = L.icon({
  iconRetinaUrl:
    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  iconUrl:
    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  shadowAnchor: [12, 41],
})

// Main location (address is fixed; coordinates will be resolved via Geocoding API)
const MAIN_LOCATION = {
  name: 'Best Brains - Main',
  address: '610 Brashear Lane, Cedar Park, Texas',
}

// Locations will be loaded dynamically from JSON files in `src/data`.
// Use Vite's `import.meta.glob` to locate and load JSON modules at build/dev time.

// Haversine formula to calculate distance between two points
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3959 // miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export default function LocationsTable2({ dataFile, apiUrl } = {}) {
  const [radius, setRadius] = useState(5)
  const [locations, setLocations] = useState([])
  const [centerCoords, setCenterCoords] = useState(null) // { lat, lng }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([])
  const circleRef = useRef(null)
  const gridApiRef = useRef(null)

  // `dataFile` prop can be provided as filename (e.g. '665.json' or 'aus/436.json').
  // If not provided, the component will pick the first JSON it finds under `src/data`.
  // Using `import.meta.glob` to dynamically discover JSON modules.
  // Google Maps API key (from environment). DO NOT hardcode the key in source.
  const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  // Geocode the MAIN_LOCATION.address and then search Places nearby.
  async function fetchGeocode(address) {
    if (!GMAPS_KEY) throw new Error('VITE_GOOGLE_MAPS_API_KEY not set')
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GMAPS_KEY}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Geocode HTTP ${res.status}`)
    const data = await res.json()
    if (!data.results || data.results.length === 0) throw new Error('No geocode result')
    const loc = data.results[0].geometry.location
    return { lat: loc.lat, lng: loc.lng }
  }

  // Helper to pause for token activation (Places API next_page_token delay)
  const pause = ms => new Promise(r => setTimeout(r, ms))

  // Fetch Nearby Search results for a single keyword, handling pagination
  async function fetchNearbyAll(location, radiusMeters, keyword) {
    if (!GMAPS_KEY) throw new Error('VITE_GOOGLE_MAPS_API_KEY not set')
    const results = []
    let pageToken = null
    do {
      const params = new URLSearchParams({
        key: GMAPS_KEY,
        location: `${location.lat},${location.lng}`,
        radius: String(radiusMeters),
        keyword: keyword,
      })
      if (pageToken) params.set('pagetoken', pageToken)
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Places HTTP ${res.status}`)
      const data = await res.json()
      if (data.results && data.results.length) results.push(...data.results)
      pageToken = data.next_page_token || null
      if (pageToken) await pause(1500) // token becomes valid after short delay
    } while (pageToken)
    return results
  }

  // Fetch place details (to get formatted_address) with limited concurrency
  async function fetchPlaceDetailsBatch(placeIds, concurrency = 6) {
    if (!GMAPS_KEY) throw new Error('VITE_GOOGLE_MAPS_API_KEY not set')
    const out = []
    for (let i = 0; i < placeIds.length; i += concurrency) {
      const batch = placeIds.slice(i, i + concurrency)
      const promises = batch.map(async id => {
        const params = new URLSearchParams({ key: GMAPS_KEY, place_id: id, fields: 'name,formatted_address,geometry' })
        const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`
        try {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`Details HTTP ${res.status}`)
          const data = await res.json()
          if (data.result) return data.result
        } catch (e) {
          console.error('Place details failed', e)
        }
        return null
      })
      const results = await Promise.all(promises)
      out.push(...results.filter(Boolean))
    }
    return out
  }

  // Main loader: either use provided apiUrl, or use Google Maps Geocode+Places
  async function loadData(dataFile, apiUrl) {
    setError(null)
    setLoading(true)
    try {
      if (apiUrl) {
        // custom API provided by caller
        const res = await fetch(apiUrl)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const arr = Array.isArray(data) ? data : data.locations ?? data.results ?? []
        setLocations(arr)
        setLoading(false)
        return
      }

      // Use Google Maps Geocoding to resolve the center
      const center = await fetchGeocode(MAIN_LOCATION.address)
      setCenterCoords(center)

      // radius in meters
      const radiusMeters = Math.round(radius * 1609.34)

      // keywords to search for apartments/communities
      const keywords = ['apartment', 'apartment complex', 'apartments', 'community']
      const placeMap = new Map()

      for (const kw of keywords) {
        const nearby = await fetchNearbyAll(center, radiusMeters, kw)
        nearby.forEach(p => placeMap.set(p.place_id, p))
      }

      const placeIds = Array.from(placeMap.keys())
      if (placeIds.length === 0) {
        setLocations([])
        setLoading(false)
        return
      }

      const details = await fetchPlaceDetailsBatch(placeIds)

      // Map details to normalized locations
      const mapped = details.map(d => ({
        name: d.name,
        address: d.formatted_address || d.vicinity || '',
        lat: d.geometry?.location?.lat,
        lng: d.geometry?.location?.lng,
      }))

      setLocations(mapped)
    } catch (e) {
      console.error(e)
      setError(e.message || String(e))
      setLocations([])
    } finally {
      setLoading(false)
    }
  }

  // load data on mount or when `dataFile`/`apiUrl` changes
  useEffect(() => {
    loadData(dataFile, apiUrl)
  }, [dataFile, apiUrl])

  const filteredLocations = useMemo(() => {
    if (!centerCoords) return []
    return locations.map(loc => {
      const distance = haversineDistance(centerCoords.lat, centerCoords.lng, loc.lat, loc.lng)
      return { ...loc, distance: parseFloat(distance.toFixed(2)) }
    }).filter(l => l.distance <= radius)
  }, [radius, locations, centerCoords])

  const columnDefs = useMemo(() => [
    { field: 'name', headerName: 'Name', flex: 1, minWidth: 180 },
    { field: 'address', headerName: 'Full Address', flex: 1.4, minWidth: 220 },
    { field: 'distance', headerName: 'Distance (miles)', flex: 0.6, minWidth: 130 },
  ], [])

  // Initialize/update Leaflet map and markers
  useEffect(() => {
    if (!mapRef.current) return
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current).setView([30.5, -97.86], 12)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(mapInstanceRef.current)
    }

    const map = mapInstanceRef.current
    // center marker for main location (if resolved)
    if (centerCoords) {
      try {
        // remove any previous center marker stored at markersRef[0]
        if (markersRef.current[0]) { map.removeLayer(markersRef.current[0]) }
      } catch (e) {}
      const centerMarker = L.marker([centerCoords.lat, centerCoords.lng], { icon: redMarkerIcon, title: MAIN_LOCATION.name }).bindPopup(`<strong>${MAIN_LOCATION.name}</strong><br/>${MAIN_LOCATION.address}`).addTo(map)
      markersRef.current[0] = centerMarker
      try { map.setView([centerCoords.lat, centerCoords.lng], 12) } catch (e) {}
    }
    // clear old markers
    markersRef.current.forEach(m => { try { map.removeLayer(m) } catch (e) {} })
    markersRef.current = []
    if (circleRef.current) { try { map.removeLayer(circleRef.current) } catch (e) {} }

    if (centerCoords) {
      circleRef.current = L.circle([centerCoords.lat, centerCoords.lng], { radius: radius * 1609.34, color: 'blue', fill: true, fillColor: 'blue', fillOpacity: 0.08, weight: 2 }).addTo(map)

      filteredLocations.forEach(loc => {
        const m = L.marker([loc.lat, loc.lng], { title: loc.name }).bindPopup(`<strong>${loc.name}</strong><br/>${loc.address}<br/>Distance: ${loc.distance} miles`).addTo(map)
        markersRef.current.push(m)
      })
    }
  }, [radius, filteredLocations])

  // Keep ag-grid in sync
  useEffect(() => {
    if (gridApiRef.current && gridApiRef.current.setRowData) {
      try { gridApiRef.current.setRowData(filteredLocations) } catch (e) {}
    }
  }, [filteredLocations])

  // When radius or data source changes, reload using Google APIs (unless custom apiUrl provided)
  useEffect(() => {
    // only load after component mounts; loadData will handle apiUrl if provided
    loadData(dataFile, apiUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius, dataFile, apiUrl])

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 2 }}>
      <Box sx={{ flex: 1, minWidth: { xs: '100%', lg: '45%' } }}>
        <Box sx={{ mb: 2 }}>
            <TextField
              label="Search Radius (miles)"
              type="number"
              inputProps={{ min: 0, max: 50, step: 0.5 }}
              value={radius}
              onChange={e => setRadius(Number(e.target.value))}
              size="small"
              sx={{ width: '100%' }}
            />
          <Box sx={{ mt: 1, fontSize: '0.875rem', color: 'text.secondary' }}>Found {filteredLocations.length} location(s) within {radius} miles</Box>
        </Box>

        <Box ref={mapRef} sx={{ width: '100%', height: { xs: '300px', lg: '500px' }, borderRadius: '4px', border: '1px solid #ddd' }} />
      </Box>

      <Box sx={{ flex: 1, minWidth: { xs: '100%', lg: '45%' } }}>
        <Box sx={{ mb: 2 }}>
          {loading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={20} />
              <Box>Loading locations from Google Places...</Box>
            </Box>
          ) : error ? (
            <Box sx={{ color: 'error.main' }}>Error: {error}</Box>
          ) : filteredLocations.length === 0 ? (
            <Box>No results found within {radius} miles.</Box>
          ) : null}
        </Box>

        <div className="ag-theme-alpine" style={{ height: '500px', width: '100%', borderRadius: 4, border: '1px solid #ddd' }}>
          <AgGridReact
            rowData={filteredLocations}
            columnDefs={columnDefs}
            defaultColDef={{ sortable: true, filter: true, resizable: true }}
            pagination={true}
            paginationPageSize={10}
            rowHeight={45}
            headerHeight={40}
            onGridReady={params => {
              gridApiRef.current = params.api
              try { params.api.setRowData(filteredLocations) } catch (e) {}
            }}
          />
        </div>
      </Box>
    </Box>
  )
}
