import React, { useMemo, useRef, useState } from 'react'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Box from '@mui/material/Box'
import * as XLSX from 'xlsx'
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'

const modules = import.meta.glob('../data/*.json', { as: 'json', eager: true })

export default function LeanderTable() {
  const entries = useMemo(() => {
    return Object.entries(modules).map(([path, data]) => {
      const normalized = data?.default ?? data
      return { path, data: normalized }
    })
  }, [])

  const combinedRows = useMemo(() => {
    return entries.flatMap(({ path, data }) => {
      const rows = data?.rows ?? []
      const filename = path.replace(/.*\//, '')
      return (Array.isArray(rows) ? rows : []).map(raw => {
        const row = { __source: filename }
        Object.entries(raw || {}).forEach(([k, v]) => {
          if (v === undefined || v === null) row[k] = v
          else if (typeof v === 'object') {
            try { row[k] = JSON.stringify(v) } catch (e) { row[k] = String(v) }
          } else row[k] = v
        })
        return row
      })
    })
  }, [entries])

  const displayRows = useMemo(() => {
    const extractName = s => {
      if (!s) return ''
      const m = String(s).match(/>([^<]+)</)
      if (m && m[1]) return m[1].trim()
      return String(s).replace(/<[^>]*>/g, '').trim()
    }
    return combinedRows.map(r => {
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

  const columnDefs = useMemo(() => [
    { field: 'parentName', headerName: 'Parent Name', sortable: true, filter: true, resizable: true, flex: 1, minWidth: 160 },
    { field: 'primaryPhone', headerName: 'Phone', sortable: true, filter: true, resizable: true, flex: 1, minWidth: 120,
      cellRenderer: (params) => {
        const v = params.value || ''
        const tel = String(v).replace(/[^+\d]/g, '')
        return (<a href={`tel:${tel}`}>{v}</a>)
      }
    },
    { field: 'parentEmail', headerName: 'Parent Email', sortable: true, filter: true, resizable: true, flex: 1, minWidth: 140 },
    { field: 'centerName', headerName: 'Center', sortable: true, filter: true, resizable: true, flex: 1, minWidth: 140 },
    
    { field: 'fullName', headerName: 'Student Full Name', sortable: true, filter: true, resizable: true, flex: 1, minWidth: 130 },
    { field: 'address', headerName: 'Address', sortable: true, filter: true, resizable: true, flex: 2, minWidth: 220 }
  ], [])

  const gridApiRef = useRef(null)
  const columnApiRef = useRef(null)
  const [globalSearch, setGlobalSearch] = useState('')

  function handleDownloadExcel() {
    const api = gridApiRef.current
    const colApi = columnApiRef.current
    if (!api || !colApi) {
      if (!displayRows.length) return
      const ws = XLSX.utils.json_to_sheet(displayRows, { header: displayHeaders })
      ws['!cols'] = displayHeaders.map(h => ({ wch: Math.max(12, String(h).length + 6) }))
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Combined'); XLSX.writeFile(wb, 'combined-center-rows.xlsx', { bookType: 'xlsx', cellStyles: true })
      return
    }
    const visibleCols = columnApiRef.current.getAllDisplayedColumns() || []
    if (!visibleCols.length) return
    const keys = visibleCols.map(c => c.getColDef().field)
    const headerLabels = visibleCols.map(c => c.getColDef().headerName || c.getColDef().field)
    const rowsArray = []
    api.forEachNodeAfterFilterAndSort(node => { if (!node || !node.data) return; const row = keys.map(k => { const v = node.data?.[k]; return v === undefined || v === null ? '' : v }); rowsArray.push(row) })
    const aoa = [headerLabels, ...rowsArray]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const cols = keys.map((_, colIndex) => { let maxLen = String(headerLabels[colIndex] || '').length; for (let r = 0; r < rowsArray.length; r++) { const str = String(rowsArray[r][colIndex] || ''); if (str.length > maxLen) maxLen = str.length } const padded = Math.min(Math.max(12, maxLen + 6), 120); return { wch: padded } })
    ws['!cols'] = cols
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Combined'); XLSX.writeFile(wb, 'combined-center-rows.xlsx', { bookType: 'xlsx', cellStyles: true })
  }

  function handleDownloadContacts() {
    if (!combinedRows || !combinedRows.length) return
    const vcardLines = []
    combinedRows.forEach(r => {
      const parentNameRaw = r.parentName || ''
      const parentEmail = r.parentEmail || ''
      const parentPhone = r.primaryPhone || ''
      const childFirst = ''
      const center = r.name || ''
      if (!parentPhone && !parentEmail) return
      const displayName = parentNameRaw ? `${parentNameRaw} - ${center}` : (center || '')
      vcardLines.push('BEGIN:VCARD'); vcardLines.push('VERSION:3.0'); vcardLines.push(`FN:${displayName}`)
      const [pFirst = '', pLast = ''] = String(parentNameRaw).split(' ').reduce((acc, cur, idx) => { if (idx === 0) acc[0] = cur; else acc[1] = [acc[1], cur].filter(Boolean).join(' '); return acc }, ['', ''])
      vcardLines.push(`N:${pLast};${pFirst};;;`)
      if (parentPhone) vcardLines.push(`TEL;TYPE=CELL:${parentPhone}`)
      if (parentEmail) vcardLines.push(`EMAIL;TYPE=INTERNET:${parentEmail}`)
      vcardLines.push('END:VCARD')
    })
    if (!vcardLines.length) return
    const blob = new Blob([vcardLines.join('\r\n')], { type: 'text/vcard;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'bestbrains-contacts.vcf'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: { xs: 'column', sm: 'row' }, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <TextField size="small" label="Global Search" value={globalSearch} sx={{ flex: 1, minWidth: 0 }} onChange={(e) => { const v = e.target.value; setGlobalSearch(v); if (gridApiRef.current) gridApiRef.current.setQuickFilter(v) }} />
          <Button size="small" onClick={() => { setGlobalSearch(''); if (gridApiRef.current) gridApiRef.current.setQuickFilter('') }}>Clear</Button>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%', mt: { xs: 1, sm: 0 }, justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
          <Button variant="contained" onClick={handleDownloadExcel} disabled={combinedRows.length === 0}>Download Excel</Button>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', mt: { xs: 1, sm: 0 }, justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
          <Button variant="outlined" onClick={() => handleDownloadContacts()} disabled={combinedRows.length === 0}>Import Contacts</Button>
          <Box sx={{ ml: { xs: 2, sm: 0, md: 2 } }} component="span">{combinedRows.length} total rows</Box>
        </Box>
      </Box>

      {combinedRows.length === 0 ? (
        <p>No rows found in the JSON files.</p>
      ) : (
        <div className="ag-theme-alpine" style={{ height: '70vh', width: '100%' }}>
          <AgGridReact
            rowData={displayRows}
            columnDefs={columnDefs}
            defaultColDef={{ sortable: true, filter: true, resizable: true, wrapHeaderText: true, autoHeaderHeight: true, minWidth: 100 }}
            headerHeight={56}
            onGridReady={(params) => {
              gridApiRef.current = params.api
              columnApiRef.current = params.columnApi
              setTimeout(() => {
                try {
                  const allCols = params.columnApi.getAllColumns() || []
                  const colIds = allCols.map(c => c.getId())
                  if (colIds.length) params.columnApi.autoSizeColumns(colIds)
                } catch (e) {}
              }, 0)
            }}
          />
        </div>
      )}
    </>
  )
}
