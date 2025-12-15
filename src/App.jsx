import React, { useMemo, useRef, useState } from 'react'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Box from '@mui/material/Box'
import * as XLSX from 'xlsx'
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'

const modules = import.meta.glob('./data/*.json', { as: 'json', eager: true })

export default function App() {
  const entries = useMemo(() => {
    return Object.entries(modules).map(([path, data]) => {
      const normalized = data?.default ?? data
      return { path, data: normalized }
    })
  }, [])

  // Combine all rows from every file into a single array and stringify nested values
  const combinedRows = useMemo(() => {
    return entries.flatMap(({ path, data }) => {
      const rows = data?.rows ?? []
      const filename = path.replace(/.*\//, '')
      return (Array.isArray(rows) ? rows : []).map(raw => {
        const row = { __source: filename }
        Object.entries(raw || {}).forEach(([k, v]) => {
          if (v === undefined || v === null) {
            row[k] = v
          } else if (typeof v === 'object') {
            try {
              row[k] = JSON.stringify(v)
            } catch (e) {
              row[k] = String(v)
            }
          } else {
            row[k] = v
          }
        })
        return row
      })
    })
  }, [entries])

  // derive a compact set of display rows with the requested fields
  const displayRows = useMemo(() => {
    const extractName = s => {
      if (!s) return ''
      const m = String(s).match(/>([^<]+)</)
      if (m && m[1]) return m[1].trim()
      // fallback: strip tags
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

  // helper used by contact export too
  const extractFirstName = (s) => {
    if (!s) return ''
    const m = String(s).match(/>([^<]+)</)
    if (m && m[1]) return m[1].trim()
    return String(s).replace(/<[^>]*>/g, '').trim()
  }

  const displayHeaders = ['fullName', 'centerName', 'parentEmail', 'primaryPhone', 'parentName', 'address']

  const columnDefs = useMemo(
    () => [
      { field: 'fullName', headerName: 'Student Full Name', sortable: true, filter: true, resizable: true, flex: 1, minWidth: 130 },
      { field: 'centerName', headerName: 'Center', sortable: true, filter: true, resizable: true, flex: 1, minWidth: 140 },
      { field: 'parentEmail', headerName: 'Parent Email', sortable: true, filter: true, resizable: true, flex: 1, minWidth: 140 },
      { field: 'primaryPhone', headerName: 'Phone', sortable: true, filter: true, resizable: true, flex: 1, minWidth: 120 },
      { field: 'parentName', headerName: 'Parent Name', sortable: true, filter: true, resizable: true, flex: 1, minWidth: 160 },
      { field: 'address', headerName: 'Address', sortable: true, filter: true, resizable: true, flex: 2, minWidth: 220 }
    ],
    []
  )

  const gridApiRef = useRef(null)
  const columnApiRef = useRef(null)
  const [globalSearch, setGlobalSearch] = useState('')

  function handleDownloadExcel() {
    const api = gridApiRef.current
    const colApi = columnApiRef.current

    // if grid API isn't ready, fallback to exporting all displayRows
    if (!api || !colApi) {
      if (!displayRows.length) return
      const ws = XLSX.utils.json_to_sheet(displayRows, { header: displayHeaders })
      ws['!cols'] = displayHeaders.map(h => ({ wch: Math.max(12, String(h).length + 6) }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Combined')
      XLSX.writeFile(wb, 'combined-center-rows.xlsx', { bookType: 'xlsx', cellStyles: true })
      return
    }

    // get visible columns in current order
    const visibleCols = colApi.getAllDisplayedColumns() || []
    if (!visibleCols.length) return
    const keys = visibleCols.map(c => c.getColDef().field)
    const headerLabels = visibleCols.map(c => c.getColDef().headerName || c.getColDef().field)

    // collect displayed rows (after filtering/sorting)
    const rowsArray = []
    api.forEachNodeAfterFilterAndSort(node => {
      if (!node || !node.data) return
      const row = keys.map(k => {
        const v = node.data?.[k]
        return v === undefined || v === null ? '' : v
      })
      rowsArray.push(row)
    })

    // build sheet from array-of-arrays so header labels can be used
    const aoa = [headerLabels, ...rowsArray]
    const ws = XLSX.utils.aoa_to_sheet(aoa)

    // compute column widths based on displayed content
    const cols = keys.map((_, colIndex) => {
      let maxLen = String(headerLabels[colIndex] || '').length
      for (let r = 0; r < rowsArray.length; r++) {
        const str = String(rowsArray[r][colIndex] || '')
        if (str.length > maxLen) maxLen = str.length
      }
      const padded = Math.min(Math.max(12, maxLen + 6), 120)
      return { wch: padded }
    })
    ws['!cols'] = cols

    // style header row cells
    headerLabels.forEach((_, i) => {
      const cellAddress = XLSX.utils.encode_cell({ c: i, r: 0 })
      const cell = ws[cellAddress]
      if (cell) {
        cell.s = cell.s || {}
        cell.s.font = Object.assign({}, cell.s.font, { name: 'Calibri', bold: true, sz: 14, color: { rgb: 'FF000000' } })
        cell.s.fill = { patternType: 'solid', fgColor: { rgb: 'FFD9E1F2' } }
        cell.s.alignment = { horizontal: 'center', vertical: 'center', wrapText: true }
      }
    })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Combined')
    wb.Workbook = wb.Workbook || {}
    wb.Workbook.Views = wb.Workbook.Views || []
    wb.Workbook.Views[0] = Object.assign({}, wb.Workbook.Views[0], { xSplit: 1, ySplit: 1, topLeftCell: 'B2', activeTab: 0 })
    XLSX.writeFile(wb, 'combined-center-rows.xlsx', { bookType: 'xlsx', cellStyles: true })
  }

  // Create and download a .vcf file containing vCard entries for all contacts
  function handleDownloadContacts() {
    if (!combinedRows || !combinedRows.length) return

    const vcardLines = []
    combinedRows.forEach(r => {
      const parentNameRaw = r.parentName || ''
      const parentEmail = r.parentEmail || ''
      const parentPhone = r.primaryPhone || ''
      const childFirst = extractFirstName(r.firstName)
      const center = r.name || ''

      // skip if no phone and no email
      if (!parentPhone && !parentEmail) return

      // display name should be: ParentName - Center (fallback to Center)
      const displayName = parentNameRaw ? `${parentNameRaw} - ${center}` : (center || '')

      vcardLines.push('BEGIN:VCARD')
      vcardLines.push('VERSION:3.0')
      // FN — full name
      vcardLines.push(`FN:${escapeVCard(displayName)}`)
      // split N by last/first if possible
      const [pFirst = '', pLast = ''] = String(parentNameRaw).split(' ').reduce((acc, cur, idx) => {
        if (idx === 0) acc[0] = cur
        else acc[1] = [acc[1], cur].filter(Boolean).join(' ')
        return acc
      }, ['', ''])
      vcardLines.push(`N:${escapeVCard(pLast)};${escapeVCard(pFirst)};;;`)
      if (parentPhone) vcardLines.push(`TEL;TYPE=CELL:${escapeVCard(parentPhone)}`)
      if (parentEmail) vcardLines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(parentEmail)}`)
      vcardLines.push('END:VCARD')
    })

    if (!vcardLines.length) return
    const blob = new Blob([vcardLines.join('\r\n')], { type: 'text/vcard;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bestbrains-contacts.vcf'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function escapeVCard(input) {
    if (input === undefined || input === null) return ''
    return String(input).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
  }

  return (
    <div className="container">
      <h1>All Centers Data</h1>

      {entries.length === 0 ? (
        <p>No JSON files found in project root.</p>
      ) : (
        <>
          <Box display="flex" alignItems="center" gap={2} marginBottom={2}>
            <Box display="flex" alignItems="center" gap={1}>
              <TextField
                size="small"
                label="Global Search"
                value={globalSearch}
                onChange={(e) => {
                  const v = e.target.value
                  setGlobalSearch(v)
                  if (gridApiRef.current) gridApiRef.current.setQuickFilter(v)
                }}
              />
              <Button size="small" onClick={() => { setGlobalSearch(''); if (gridApiRef.current) gridApiRef.current.setQuickFilter('') }}>Clear</Button>
            </Box>

            <Box marginLeft="auto" display="flex" alignItems="center" gap={2}>
              <Button variant="contained" onClick={handleDownloadExcel} disabled={combinedRows.length === 0}>
                Download Excel
              </Button>
              <Button variant="outlined" onClick={() => handleDownloadContacts()} disabled={combinedRows.length === 0}>
                Import All Contacts
              </Button>
              <Box component="span">{combinedRows.length} total rows</Box>
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
                  // allow the grid to render, then auto-size columns to header/content
                  setTimeout(() => {
                    try {
                      const allCols = params.columnApi.getAllColumns() || []
                      const colIds = allCols.map(c => c.getId())
                      if (colIds.length) {
                        params.columnApi.autoSizeColumns(colIds)
                        // do NOT call sizeColumnsToFit() so columns keep their auto-sized widths
                      }
                    } catch (e) {
                      // ignore sizing errors
                    }
                  }, 0)
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
