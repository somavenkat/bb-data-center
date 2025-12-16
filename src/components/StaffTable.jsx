import React, { useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import * as XLSX from 'xlsx'
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'

const staffModules = import.meta.glob('../data/staff/*.json', { as: 'json', eager: true })

function normalizeFileContent(item) {
  if (!item) return []
  const value = item.default ?? item
  if (Array.isArray(value)) return value
  if (Array.isArray(value.rows)) return value.rows
  if (Array.isArray(value.data)) return value.data
  const arr = Object.values(value).find(v => Array.isArray(v))
  return arr || []
}

export default function StaffTable() {
  const rows = useMemo(() => Object.values(staffModules).flatMap(m => normalizeFileContent(m)), [])

  const displayRows = useMemo(() => {
    return (rows || []).map(r => {
      const name = r.teacherName || ''
      const phone = r.phone || ''
      const email = r.email || ''
      const subjects = r.subject || r.subjects || ''
      const Location = r.locationName || r.location || ''
      return { name, phone, email, subjects, Location }
    })
  }, [rows])

  const displayHeaders = ['name','phone','email','subjects','Location']

  const [globalSearch, setGlobalSearch] = useState('')
  const gridApiRef = useRef(null)
  const columnApiRef = useRef(null)

  const defaultColDef = useMemo(() => ({ sortable: true, filter: true, resizable: true, minWidth: 100, flex: 1 }), [])

  const columnDefs = useMemo(() => [
    { field: 'name', headerName: 'Name', flex: 1, minWidth: 160 },
    { field: 'phone', headerName: 'Phone', flex: 1, minWidth: 140,
      cellRenderer: (params) => {
        const v = params.value || ''
        const tel = String(v).replace(/[^+\d]/g, '')
        return (<a href={`tel:${tel}`}>{v}</a>)
      }
    },
    { field: 'email', headerName: 'Email', flex: 1, minWidth: 180 },
    { field: 'subjects', headerName: 'Subjects', flex: 1, minWidth: 160 },
    { field: 'Location', headerName: 'Location', flex: 1, minWidth: 140 }
  ], [])

  function exportExcel() {
    if (!displayRows || !displayRows.length) return
    const headerLabels = displayHeaders
    const keys = displayHeaders
    const aoa = [headerLabels, ...displayRows.map(r => keys.map(k => r[k] ?? ''))]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const cols = keys.map((_, i) => ({ wch: Math.min(Math.max(12, String(headerLabels[i] || '').length + 6), 120) }))
    ws['!cols'] = cols
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Staff'); XLSX.writeFile(wb, 'staff-rows.xlsx')
  }

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: { xs: 'column', sm: 'row' }, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <TextField size="small" label="Global Search" value={globalSearch} sx={{ flex: 1, minWidth: 0 }} onChange={(e) => { const v = e.target.value; setGlobalSearch(v); if (gridApiRef.current) gridApiRef.current.setQuickFilter(v) }} />
          <Button size="small" onClick={() => { setGlobalSearch(''); if (gridApiRef.current) gridApiRef.current.setQuickFilter('') }}>Clear</Button>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%', mt: { xs: 1, sm: 0 }, justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
          <Button variant="contained" onClick={exportExcel} disabled={!displayRows.length}>Download Excel</Button>
          <Box sx={{ ml: { xs: 2, sm: 0, md: 2 } }} component="span">{displayRows.length} total rows</Box>
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
