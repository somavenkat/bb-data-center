import React, { useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import * as XLSX from 'xlsx'
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'

const ausModules = import.meta.glob('../data/aus/*.json', { as: 'json', eager: true })

function normalizeFileContent(item) {
  if (!item) return []
  const value = item.default ?? item
  if (Array.isArray(value)) return value
  if (Array.isArray(value.rows)) return value.rows
  if (Array.isArray(value.data)) return value.data
  // try to find array field
  const arr = Object.values(value).find(v => Array.isArray(v))
  return arr || []
}

export default function AustingTable() {
  const rows = useMemo(() => {
    return Object.values(ausModules).flatMap(m => normalizeFileContent(m))
  }, [])

  const combinedRows = rows

  const displayRows = useMemo(() => {
    const extractName = (s) => {
      if (!s) return ''
      const m = String(s).match(/>([^<]+)</)
      if (m && m[1]) return m[1].trim()
      return String(s).replace(/<[^>]*>/g, '').trim()
    }

    return (combinedRows || []).map(r => {
      const first = extractName(r.firstName)
      const last = r.lastName || ''
      const fullName = [first, last].filter(Boolean).join(' ').trim()
      const centerName = r.name || ''
      const parentEmail = r.parentEmail || ''
      const primaryPhone = r.primaryPhone || ''
      const parentName = r.parentName || ''
      const parts = []
      if (r.streetaddress) parts.push(r.streetaddress)
      if (r.aptno) parts.push(r.aptno)
      if (r.city) parts.push(r.city)
      const stateZip = [r.state, r.zipcode].filter(Boolean).join(' ')
      if (stateZip) parts.push(stateZip)
      const address = parts.join(', ')
      return { fullName, centerName, parentEmail, primaryPhone, parentName, address }
    })
  }, [combinedRows])

  const displayHeaders = ['fullName','centerName','parentEmail','primaryPhone','parentName','address']

  const [globalSearch, setGlobalSearch] = useState('')
  const gridApiRef = useRef(null)
  const columnApiRef = useRef(null)

  const defaultColDef = useMemo(() => ({ sortable: true, filter: true, resizable: true, minWidth: 100, flex: 1 }), [])

  const columnDefs = useMemo(() => [
    { field: 'fullName', headerName: 'Student Full Name', sortable: true, filter: true, resizable: true, flex: 1, minWidth: 130 },
    { field: 'primaryPhone', headerName: 'Phone', sortable: true, filter: true, resizable: true, flex: 1, minWidth: 120,
      cellRenderer: (params) => {
        const v = params.value || ''
        const tel = String(v).replace(/[^+\d]/g, '')
        return (<a href={`tel:${tel}`}>{v}</a>)
      }
    },
    { field: 'centerName', headerName: 'Center', sortable: true, filter: true, resizable: true, flex: 1, minWidth: 140 },
    { field: 'parentEmail', headerName: 'Parent Email', sortable: true, filter: true, resizable: true, flex: 1, minWidth: 140 },
    
    { field: 'parentName', headerName: 'Parent Name', sortable: true, filter: true, resizable: true, flex: 1, minWidth: 160 },
    { field: 'address', headerName: 'Address', sortable: true, filter: true, resizable: true, flex: 2, minWidth: 220 }
  ], [])

  function exportExcel() {
    if (!displayRows || !displayRows.length) return
    const headerLabels = displayHeaders
    const keys = displayHeaders
    const aoa = [headerLabels, ...displayRows.map(r => keys.map(k => r[k] ?? ''))]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const cols = keys.map((_, i) => ({ wch: Math.min(Math.max(12, String(headerLabels[i] || '').length + 6), 120) }))
    ws['!cols'] = cols
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Austing'); XLSX.writeFile(wb, 'austing-rows.xlsx')
  }

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: { xs: 'column', sm: 'row' }, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <TextField size="small" label="Global Search" value={globalSearch} sx={{ flex: 1, minWidth: 0 }} onChange={(e) => { const v = e.target.value; setGlobalSearch(v); if (gridApiRef.current) gridApiRef.current.setQuickFilter(v) }} />
          <Button size="small" onClick={() => { setGlobalSearch(''); if (gridApiRef.current) gridApiRef.current.setQuickFilter('') }}>Clear</Button>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%', mt: { xs: 1, sm: 0 }, justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
          <Button variant="contained" onClick={exportExcel} disabled={!rows.length}>Download Excel</Button>
          <Box sx={{ ml: { xs: 2, sm: 0, md: 2 } }} component="span">{combinedRows.length} total rows</Box>
        </Box>
      </Box>

      <div className="ag-theme-alpine" style={{ height: '70vh', width: '100%' }}>
        <AgGridReact
          rowData={displayRows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          headerHeight={56}
          onGridReady={(params) => { gridApiRef.current = params.api; columnApiRef.current = params.columnApi; setTimeout(() => { try { const allCols = params.columnApi.getAllColumns() || []; const colIds = allCols.map(c => c.getId()); if (colIds.length) params.columnApi.autoSizeColumns(colIds) } catch (e) {} }, 0) }}
        />
      </div>
    </>
  )
}
