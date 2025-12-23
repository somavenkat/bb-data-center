import React, { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import LeanderTable from './components/LeanderTable'
import AustingTable from './components/AustingTable'
import StaffTable from './components/StaffTable'
import LocationsTable from './components/LocationsTable2'

export default function App() {
  const [authenticated, setAuthenticated] = useState(() => !!localStorage.getItem('bb_auth'))
  const [passwordInput, setPasswordInput] = useState('')
  const [loginError, setLoginError] = useState('')
  const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD || ''
  const [tabIndex, setTabIndex] = useState(0)
  function handleLogin(e) {
    if (e && e.preventDefault) e.preventDefault()
    if (!APP_PASSWORD) { setLoginError('No password configured in environment'); return }
    if (passwordInput === APP_PASSWORD) { localStorage.setItem('bb_auth', '1'); setAuthenticated(true); setLoginError('') }
    else setLoginError('Incorrect password')
  }

  function handleLogout() {
    localStorage.removeItem('bb_auth')
    setAuthenticated(false)
    setPasswordInput('')
  }

  function handleDownloadExcel() {
    const api = gridApiRef.current;
    const colApi = columnApiRef.current;

    // if grid API isn't ready, fallback to exporting all displayRows
    if (!api || !colApi) {
      if (!displayRows.length) return;
      const ws = XLSX.utils.json_to_sheet(displayRows, {
        header: displayHeaders,
      });
      ws["!cols"] = displayHeaders.map((h) => ({
        wch: Math.max(12, String(h).length + 6),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Combined");
      XLSX.writeFile(wb, "combined-center-rows.xlsx", {
        bookType: "xlsx",
        cellStyles: true,
      });
      return;
    }

    // get visible columns in current order
    const visibleCols = colApi.getAllDisplayedColumns() || [];
    if (!visibleCols.length) return;
    const keys = visibleCols.map((c) => c.getColDef().field);
    const headerLabels = visibleCols.map(
      (c) => c.getColDef().headerName || c.getColDef().field
    );

    // collect displayed rows (after filtering/sorting)
    const rowsArray = [];
    api.forEachNodeAfterFilterAndSort((node) => {
      if (!node || !node.data) return;
      const row = keys.map((k) => {
        const v = node.data?.[k];
        return v === undefined || v === null ? "" : v;
      });
      rowsArray.push(row);
    });

    // build sheet from array-of-arrays so header labels can be used
    const aoa = [headerLabels, ...rowsArray];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // compute column widths based on displayed content
    const cols = keys.map((_, colIndex) => {
      let maxLen = String(headerLabels[colIndex] || "").length;
      for (let r = 0; r < rowsArray.length; r++) {
        const str = String(rowsArray[r][colIndex] || "");
        if (str.length > maxLen) maxLen = str.length;
      }
      const padded = Math.min(Math.max(12, maxLen + 6), 120);
      return { wch: padded };
    });
    ws["!cols"] = cols;

    // style header row cells
    headerLabels.forEach((_, i) => {
      const cellAddress = XLSX.utils.encode_cell({ c: i, r: 0 });
      const cell = ws[cellAddress];
      if (cell) {
        cell.s = cell.s || {};
        cell.s.font = Object.assign({}, cell.s.font, {
          name: "Calibri",
          bold: true,
          sz: 14,
          color: { rgb: "FF000000" },
        });
        cell.s.fill = { patternType: "solid", fgColor: { rgb: "FFD9E1F2" } };
        cell.s.alignment = {
          horizontal: "center",
          vertical: "center",
          wrapText: true,
        };
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Combined");
    wb.Workbook = wb.Workbook || {};
    wb.Workbook.Views = wb.Workbook.Views || [];
    wb.Workbook.Views[0] = Object.assign({}, wb.Workbook.Views[0], {
      xSplit: 1,
      ySplit: 1,
      topLeftCell: "B2",
      activeTab: 0,
    });
    XLSX.writeFile(wb, "combined-center-rows.xlsx", {
      bookType: "xlsx",
      cellStyles: true,
    });
  }

  // Create and download a .vcf file containing vCard entries for all contacts
  function handleDownloadContacts() {
    if (!combinedRows || !combinedRows.length) return;

    const vcardLines = [];
    combinedRows.forEach((r) => {
      const parentNameRaw = r.parentName || "";
      const parentEmail = r.parentEmail || "";
      const parentPhone = r.primaryPhone || "";
      const childFirst = extractFirstName(r.firstName);
      const center = r.name || "";

      // skip if no phone and no email
      if (!parentPhone && !parentEmail) return;

      // display name should be: ParentName - Center (fallback to Center)
      const displayName = parentNameRaw
        ? `${parentNameRaw} - ${center}`
        : center || "";

      vcardLines.push("BEGIN:VCARD");
      vcardLines.push("VERSION:3.0");
      // FN — full name
      vcardLines.push(`FN:${escapeVCard(displayName)}`);
      // split N by last/first if possible
      const [pFirst = "", pLast = ""] = String(parentNameRaw)
        .split(" ")
        .reduce(
          (acc, cur, idx) => {
            if (idx === 0) acc[0] = cur;
            else acc[1] = [acc[1], cur].filter(Boolean).join(" ");
            return acc;
          },
          ["", ""]
        );
      vcardLines.push(`N:${escapeVCard(pLast)};${escapeVCard(pFirst)};;;`);
      if (parentPhone)
        vcardLines.push(`TEL;TYPE=CELL:${escapeVCard(parentPhone)}`);
      if (parentEmail)
        vcardLines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(parentEmail)}`);
      vcardLines.push("END:VCARD");
    });

    if (!vcardLines.length) return;
    const blob = new Blob([vcardLines.join("\r\n")], {
      type: "text/vcard;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bestbrains-contacts.vcf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function escapeVCard(input) {
    if (input === undefined || input === null) return "";
    return String(input)
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  }

  if (!authenticated) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box sx={{ width: 'min(92%,420px)', p: 3, boxShadow: 2, borderRadius: 1 }}>
          <h2>Enter password to continue</h2>
          <Box component="form" onSubmit={handleLogin} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label="Password" type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} size="small" autoFocus />
            {loginError ? <Box sx={{ color: 'error.main' }}>{loginError}</Box> : null}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="contained" type="submit">Login</Button>
            </Box>
          </Box>
        </Box>
      </div>
    )
  }

  return (
    <Box sx={{ width: '100%', p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <h1 style={{ margin: 0 }}>All Centers Data</h1>
        <Button color="inherit" onClick={handleLogout}>Logout</Button>
      </Box>

      <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} centered>
        <Tab label="Austin" />
        <Tab label="Leander" />
        <Tab label="Staff" />
        <Tab label="Locations" />
      </Tabs>

      <Box sx={{ mt: 2 }}>
        {tabIndex === 0 && <AustingTable />}
        {tabIndex === 1 && <LeanderTable />}
        {tabIndex === 2 && <StaffTable />}
        {tabIndex === 3 && <LocationsTable />}
      </Box>
    </Box>
  )
}
