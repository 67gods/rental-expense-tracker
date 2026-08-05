---
name: restart-app
description: Force restart the local dev server (Next.js on port 4000). Use when asked to restart, force restart, or bounce the app, or when the dev server is stale, hung, or holding port 4000.
---

# Force restart the app

Run these three steps. Do not read other files first.

**1. Kill everything on port 4000, any stray Next process for this repo, and the stale build output:**

```powershell
$ids = @()
Get-NetTCPConnection -LocalPort 4000 -State Listen -EA 0 | % { $ids += $_.OwningProcess }
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? { $_.CommandLine -match 'rental-property|next' } | % { $ids += $_.ProcessId }
$ids | Sort-Object -Unique | % { taskkill /F /T /PID $_ 2>$null }
Remove-Item -Recurse -Force C:\Repos\rental-property\apps\web\.next -EA 0
```

"could not be terminated / not supported" on an already-killed child PID is expected noise — ignore it.
Dropping `.next` is what makes this a *force* restart: killing a dev server mid-compile leaves half-written
chunks, and the next boot dies on `Cannot find module './NNNN.js'`. First page load after this is slow.

**2. Start it detached** — PowerShell, not a background Bash task:

```powershell
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev > $env:TEMP\rental-dev.log 2>&1" -WorkingDirectory "C:\Repos\rental-property" -WindowStyle Hidden
```

**3. Verify — do not report success without this:**

```powershell
$d=(Get-Date).AddSeconds(90)
do { Start-Sleep -Milliseconds 1500; $up = Get-NetTCPConnection -LocalPort 4000 -State Listen -EA 0 } while (-not $up -and (Get-Date) -lt $d)
if ($up) { foreach ($p in '/','/entries') { try { "$p " + (Invoke-WebRequest "http://localhost:4000$p" -UseBasicParsing -TimeoutSec 60).StatusCode } catch { "$p ERR $($_.Exception.Message)" } } } else { "NOT LISTENING" }
```

Expect `200` from both. Anything else: read `$env:TEMP\rental-dev.log` for the failure.
A single route is not enough — a stale `.next` serves `/` fine and 500s elsewhere.

## Notes

- Don't start the server as a background Bash task. The npm wrapper is torn down when the task ends
  and reports `exit code 1` — while the `next dev` descendant keeps serving, orphaned. The failure
  notification is then meaningless and the real process is untracked. `Start-Process` detaches on purpose.
- Port 4000 is fixed (`next dev -p 4000` in [apps/web/package.json](apps/web/package.json)); `AUTH_URL` in `.env.local` depends on it, so never restart on a different port.
- Env changes (`.env.local`) need this full restart; source changes do not — Next hot-reloads them.
- Schema changes need `npm run db:migrate` before step 2.
