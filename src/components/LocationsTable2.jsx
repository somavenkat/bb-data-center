import React, { useMemo, useState, useRef, useEffect } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import * as XLSX from 'xlsx'
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

export default function LocationsTable2() {
  const [radius, setRadius] = useState(5)
  const [locations, setLocations] = useState([])
  const [centerCoords, setCenterCoords] = useState(null) // { lat, lng }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [globalSearch, setGlobalSearch] = useState('')
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([])
  const circleRef = useRef(null)
  const gridApiRef = useRef(null)

  // Google Maps API key (from environment). DO NOT hardcode the key in source.
  const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  // Load Google Maps JavaScript SDK (with Places library)
  function loadGoogleMapsScript() {
    if (typeof window === 'undefined') return Promise.reject(new Error('No window'))
    if (window.google && window.google.maps && window.google.maps.places) return Promise.resolve(window.google)
    if (!GMAPS_KEY) return Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY not set'))
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-google-maps]`)
      if (existing) {
        existing.addEventListener('load', () => resolve(window.google))
        existing.addEventListener('error', () => reject(new Error('Google Maps script failed to load')))
        return
      }
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places&v=weekly`
      script.async = true
      script.defer = true
      script.setAttribute('data-google-maps', 'true')
      script.onload = () => resolve(window.google)
      script.onerror = () => reject(new Error('Google Maps script failed to load'))
      document.head.appendChild(script)
    })
  }

  // Geocode via Maps JS API
  function fetchGeocode(address) {
    return new Promise(async (resolve, reject) => {
      try {
        await loadGoogleMapsScript()
        const geocoder = new window.google.maps.Geocoder()
        geocoder.geocode({ address }, (results, status) => {
          if (status !== window.google.maps.GeocoderStatus.OK || !results || results.length === 0) {
            return reject(new Error('Geocode failed: ' + status))
          }
          const loc = results[0].geometry.location
          resolve({ lat: loc.lat(), lng: loc.lng() })
        })
      } catch (e) {
        reject(e)
      }
    })
  }

  // Use PlacesService.nearbySearch with pagination handling
  function fetchNearbyAll(location, radiusMeters, keyword) {
    return new Promise(async (resolve, reject) => {
      try {
        await loadGoogleMapsScript()
        const service = new window.google.maps.places.PlacesService(document.createElement('div'))
        const allResults = []
        const request = {
          location: new window.google.maps.LatLng(location.lat, location.lng),
          radius: radiusMeters,
          keyword,
        }

        const handle = (results, status, pagination) => {
          if (status !== window.google.maps.places.PlacesServiceStatus.OK && status !== window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            return reject(new Error('Places nearbySearch failed: ' + status))
          }
          if (results && results.length) allResults.push(...results)
          if (pagination && pagination.hasNextPage) {
            // nextPage must be called after a short delay per Google documentation
            setTimeout(() => pagination.nextPage(), 1500)
          } else {
            resolve(allResults)
          }
        }

        service.nearbySearch(request, handle)
      } catch (e) {
        reject(e)
      }
    })
  }

  // Fetch place details via PlacesService.getDetails
  async function fetchPlaceDetailsBatch(placeIds, concurrency = 6) {
    await loadGoogleMapsScript()
    const service = new window.google.maps.places.PlacesService(document.createElement('div'))
    const out = []
    for (let i = 0; i < placeIds.length; i += concurrency) {
      const batch = placeIds.slice(i, i + concurrency)
      const promises = batch.map(id => new Promise(resolve => {
        service.getDetails({ placeId: id, fields: ['name', 'formatted_address', 'geometry', 'rating', 'user_ratings_total', 'website', 'formatted_phone_number'] }, (result, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && result) resolve(result)
          else {
            console.error('getDetails failed', id, status)
            resolve(null)
          }
        })
      }))
      const results = await Promise.all(promises)
      out.push(...results.filter(Boolean))
    }
    return out
  }

  // Main loader: either use provided apiUrl, or use Google Maps Geocode+Places
  async function loadData() {
    setError(null)
    setLoading(true)
    try {
      // Use Google Maps Geocoding to resolve the center
      const center = await fetchGeocode(MAIN_LOCATION.address)
      setCenterCoords(center)

      // radius in meters
      const radiusMeters = Math.round(radius * 1609.34)

      // keywords to search for apartments/communities
      const keywords = ['apartment', 'apartment complex', 'apartments', 'community']

      // Collect place_ids only from nearbySearch results, but keep minimal nearby info (vicinity)
      const nearbyInfo = new Map()
      for (const kw of keywords) {
        const nearby = await fetchNearbyAll(center, radiusMeters, kw)
        // nearby is an array of PlaceResult objects from nearbySearch
        nearby.forEach(p => {
          if (p && p.place_id) {
            if (!nearbyInfo.has(p.place_id)) nearbyInfo.set(p.place_id, { vicinity: p.vicinity, types: p.types })
          }
        })
      }

      const placeIds = Array.from(nearbyInfo.keys())
      if (placeIds.length === 0) {
        setLocations([])
        setLoading(false)
        return
      }

      // Fetch details for each place_id using PlacesService.getDetails
      const details = await fetchPlaceDetailsBatch(placeIds)

      // Merge nearbySearch info and details into final dataset
      const mapped = details.map(d => {
        const id = d.place_id
        const near = nearbyInfo.get(id) || {}
        const lat = d.geometry?.location?.lat?.() ?? d.geometry?.location?.lat ?? null
        const lng = d.geometry?.location?.lng?.() ?? d.geometry?.location?.lng ?? null
        return {
          place_id: id,
          name: d.name || '',
          address: d.formatted_address || near.vicinity || '',
          lat,
          lng,
          rating: d.rating ?? null,
          user_ratings_total: d.user_ratings_total ?? null,
          website: d.website ?? '',
          phone: d.formatted_phone_number ?? '',
        }
      })

      setLocations(mapped)
    } catch (e) {
      console.error(e)
      setError(e.message || String(e))
      setLocations([])
    } finally {
      setLoading(false)
    }
  }

  

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
    { field: 'rating', headerName: 'Rating', flex: 0.4, minWidth: 90 },
    { field: 'phone', headerName: 'Phone', flex: 0.6, minWidth: 120 },
    { field: 'website', headerName: 'Website', flex: 0.8, minWidth: 140 },
  ], [])

  const displayRows = useMemo(() => filteredLocations.map(r => ({ name: r.name, address: r.address, distance: r.distance, rating: r.rating ?? '', phone: r.phone ?? '', website: r.website ?? '' })), [filteredLocations])
  const displayHeaders = ['name','address','distance','rating','phone','website']

  function exportExcel() {
    if (!displayRows || !displayRows.length) return
    const headerLabels = displayHeaders
    const keys = displayHeaders
    const aoa = [headerLabels, ...displayRows.map(r => keys.map(k => r[k] ?? ''))]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const cols = keys.map((_, i) => ({ wch: Math.min(Math.max(12, String(headerLabels[i] || '').length + 6), 120) }))
    ws['!cols'] = cols
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'locations'); XLSX.writeFile(wb, 'locations.xlsx')
  }

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

  // When radius changes, reload using Google Maps JS SDK
  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius])

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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
              <TextField size="small" label="Global Search" value={globalSearch} sx={{ flex: 1, minWidth: 0 }} onChange={(e) => { const v = e.target.value; setGlobalSearch(v); if (gridApiRef.current) gridApiRef.current.setQuickFilter(v) }} />
              <Button size="small" onClick={() => { setGlobalSearch(''); if (gridApiRef.current) gridApiRef.current.setQuickFilter('') }}>Clear</Button>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: { xs: 1, sm: 0 }, justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
              <Button variant="contained" onClick={exportExcel} disabled={!displayRows.length}>Download Excel</Button>
              {loading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CircularProgress size={20} /><Box>Loading locations...</Box></Box>
              ) : error ? (
                <Box sx={{ color: 'error.main' }}>Error: {error}</Box>
              ) : filteredLocations.length === 0 ? (
                <Box>No results found within {radius} miles.</Box>
              ) : null}
            </Box>
          </Box>
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
