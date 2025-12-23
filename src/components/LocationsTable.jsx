// File content replaced with a safe stub to avoid parsing errors in developer environment
import React from 'react'

export default function LocationsTable() {
  return null
}
import React, { useMemo, useState, useRef, useEffect } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
        <Box ref={mapRef} sx={{ width: '100%', height: { xs: '300px', lg: '500px' }, borderRadius: '4px', border: '1px solid #ddd' }} />
      </Box>

      <Box sx={{ flex: 1, minWidth: { xs: '100%', lg: '45%' } }}>
        <div className="ag-theme-alpine" style={{ height: '500px', width: '100%', borderRadius: 4, border: '1px solid #ddd' }}>
          <AgGridReact ref={gridApiRef} rowData={filteredLocations} columnDefs={columnDefs} defaultColDef={{ sortable: true, filter: true, resizable: true }} pagination={true} paginationPageSize={10} rowHeight={45} headerHeight={40} />
        </div>
      </Box>
    </Box>
  )
}
import React, { useMemo, useState, useRef, useEffect } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
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

// Red marker icon for main location
const redMarkerIcon = L.icon({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNSIgaGVpZ2h0PSI0MSIgdmlld0JveD0iMCAwIDI1IDQxIj48cGF0aCBkPSJNMTIuNSAwQzUuNTk2IDAgMCA1LjU5NiAwIDEyLjVjMCA2LjI1IDEyLjUgMjggMTIuNSAyOHMxMi41LTIxLjc1IDEyLjUtMjhDMjUgNS41OTYgMTkuNDA0IDAgMTIuNSAweiIgZmlsbD0iI0ZGNDQzRiIvPjwvc3ZnPg==',\n  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',\n  iconSize: [25, 41],\n  iconAnchor: [12, 41],\n  popupAnchor: [1, -34],\n  shadowSize: [41, 41],\n  shadowAnchor: [12, 41],\n})

// Main location
const MAIN_LOCATION = {
  name: 'Best Brains - Main',
  address: '610 Brashear Lane, Cedar Park, Texas',
  lat: 30.5095,
  lng: -97.8644,
}

// Complete list of communities/apartments within 5 miles of Cedar Park main location
// Coordinates: 30.5095, -97.8644
const SAMPLE_LOCATIONS = [
  {
    name: 'Westgate at Cedar Park',
    type: 'Apartment',
    address: '1011 San Leandro Dr, Cedar Park, TX 78613',
    lat: 30.5112,
    lng: -97.8720,
  },
  import React from 'react'

  export default function LocationsTable() {
    return null
  }
    lng: -97.8890,
