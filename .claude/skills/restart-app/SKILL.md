---
name: restart-app
description: Force restart the local dev server (Next.js on port 4000). Use when asked to restart, force restart, or bounce the app, or when the dev server is stale, hung, or holding port 4000.
---

# Force restart the app

Run these three steps. Do not read other files first.

**1. Kill everything on port 4000 and any stray Next process for this repo:**

```powershell
$ids = @()
Get-NetTCPConnection -LocalPort 4000 -State Listen -EA 0 | % { $ids += $_.OwningProcess }
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? { $_.CommandLine -match 'rental-property|next' } | % { $ids += $_.ProcessId }
$ids | Sort-Object -Unique | % { taskkill /F /T /PID $_ 2>$null }
```

"could not be terminated / not supported" on an already-killed child PID is expected noise — ignore it.

**2. Start it detached** (Bash tool, `run_in_background: true`):

```bash
cd "c:/Repos/rental-property" && npm run dev
```

**3. Verify — do not report success without this:**

```powershell
$d=(Get-Date).AddSeconds(60)
do { Start-Sleep -Milliseconds 1500; $up = Get-NetTCPConnection -LocalPort 4000 -State Listen -EA 0 } while (-not $up -and (Get-Date) -lt $d)
if ($up) { (Invoke-WebRequest http://localhost:4000 -UseBasicParsing -TimeoutSec 30).StatusCode } else { "NOT LISTENING" }
```

Expect `200`. Anything else: read the background task's output file for the failure.

## Notes

- Port 4000 is fixed (`next dev -p 4000` in [apps/web/package.json](apps/web/package.json)); `AUTH_URL` in `.env.local` depends on it, so never restart on a different port.
- Env changes (`.env.local`) need this full restart; source changes do not — Next hot-reloads them.
- Schema changes need `npm run db:migrate` before step 2.
