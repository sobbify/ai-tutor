<#
  ELSA / AI Tutor - Docker smoke test for Windows (Docker Desktop).

  Right-click > "Run with PowerShell", or in PowerShell:
      powershell -ExecutionPolicy Bypass -File scripts\docker-check.ps1

  It builds the production image, starts PostgreSQL + the app on http://localhost:8000,
  checks it works, and writes everything to docker-check.log next to this project.
  Keys and passwords are never written to the log.
  Stop it afterwards with:  docker compose down      (your data volume is kept)
#>
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$log = Join-Path $root 'docker-check.log'
Set-Content -Path $log -Value "ELSA docker check  $(Get-Date -Format s)" -Encoding UTF8

function Say([string]$msg) { Write-Host $msg; Add-Content -Path $log -Value $msg -Encoding UTF8 }
function Redact([string]$text) {
  $text = $text -replace 'AQ\.[A-Za-z0-9_\-]{10,}', 'AQ.***' -replace 'AIza[0-9A-Za-z_\-]{20,}', 'AIza***'
  return ($text -replace '(POSTGRES_PASSWORD|GEMINI_API_KEYS|HOST_API_KEY|ENTRY_LINK_SECRET|ADMIN_BOOTSTRAP_PASSWORD)=\S+', '$1=***')
}
function Run([string]$title, [string]$cmd) {
  Say ""; Say "== $title =="; Say "> $cmd"
  $out = cmd /c "$cmd 2>&1"
  $code = $LASTEXITCODE
  foreach ($line in $out) { Add-Content -Path $log -Value (Redact "$line") -Encoding UTF8 }
  $out | Select-Object -Last 8 | ForEach-Object { Write-Host (Redact "$_") }
  Say "(exit $code)"
  return $code
}
function NewSecret([int]$n) { -join ((48..57) + (65..90) + (97..122) | Get-Random -Count $n | ForEach-Object { [char]$_ }) }

# 1. Docker present and running?
if ((Run 'docker version' 'docker version --format "client {{.Client.Version}} / server {{.Server.Version}}"') -ne 0) {
  Say 'Docker Desktop is not running. Start it, wait for "Engine running", then run this again.'; exit 1
}

# 2. Settings for the stack (.env next to docker-compose.yml). Created once; never overwritten.
$envFile = Join-Path $root '.env'
if (-not (Test-Path $envFile)) {
  $key = ''
  $backendEnv = Join-Path $root 'backend\.env'
  if (Test-Path $backendEnv) {
    $line = Select-String -Path $backendEnv -Pattern '^\s*GEMINI_API_KEYS\s*=' | Select-Object -First 1
    if ($line) { $key = ($line.Line -split '=', 2)[1].Trim() -replace '\s+#.*$', '' }
  }
  $evaluator = if ($key) { 'gemini' } else { 'rules' }
  @(
    "POSTGRES_PASSWORD=$(NewSecret 28)",
    "GEMINI_API_KEYS=$key",
    "EVALUATOR=$evaluator",
    "HOST_API_KEY=$(NewSecret 40)",
    "ENTRY_LINK_SECRET=$(NewSecret 48)",
    'COOKIE_SECURE=true',
    'SCHOOL_TIMEZONE=Asia/Kolkata'
  ) | Set-Content -Path $envFile -Encoding ASCII
  Say ""; Say "Created .env (evaluator: $evaluator; Gemini key copied from backend\.env: $([bool]$key))"
} else {
  Say ""; Say 'Using the existing .env'
  # Older .env files predate signed links: add a secret once (production refuses to start without it).
  if (-not (Select-String -Path $envFile -Pattern '^\s*ENTRY_LINK_SECRET\s*=\s*\S' -Quiet)) {
    Add-Content -Path $envFile -Value "ENTRY_LINK_SECRET=$(NewSecret 48)" -Encoding ASCII
    Say 'Added ENTRY_LINK_SECRET to .env'
  }
}

# 3. Build and start.
if ((Run 'build image' 'docker compose build --progress=plain') -ne 0) { Say 'BUILD FAILED - see docker-check.log'; exit 1 }
if ((Run 'start stack' 'docker compose up -d') -ne 0) { Say 'START FAILED - see docker-check.log'; exit 1 }

# 4. Wait until the app is ready (migrations + content seeding run on first start).
Say ""; Say '== waiting for http://localhost:8000/api/ready =='
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 'http://localhost:8000/api/ready').StatusCode -eq 200) { $ready = $true; break } } catch { }
  Start-Sleep -Seconds 2
}
Say "ready: $ready (after about $([int]($i * 2)) s)"

# 5. Smoke test: health, enter as a test teacher, read a moment.
if ($ready) {
  try {
    $h = Invoke-RestMethod -TimeoutSec 5 'http://localhost:8000/api/health'
    Say "health: $(($h | ConvertTo-Json -Compress))"
    # The session cookie is Secure (as in production); browsers accept it on localhost but
    # PowerShell won't send it over http, so pass it along by hand.
    # Entry links are signed in production: ask the app for a fresh one.
    $link = (docker compose exec -T app python -m ai_tutor make-link docker-smoke-test "Docker Test" | Select-Object -Last 1).Trim()
    $req = [System.Net.HttpWebRequest]::Create($link)
    $req.AllowAutoRedirect = $false
    $resp = $req.GetResponse()
    $cookie = ($resp.Headers['Set-Cookie'] -split ';')[0]
    $resp.Close()
    Say "entry: HTTP $([int]$resp.StatusCode), session cookie set: $([bool]$cookie)"
    $auth = @{ Cookie = $cookie }
    $me = Invoke-RestMethod -Headers $auth 'http://localhost:8000/api/me'
    Say "signed in as: $($me.name)"
    $m = Invoke-RestMethod -Headers $auth 'http://localhost:8000/api/tutor/moments/morning-greeting'
    Say "moment: $($m.title) - $($m.turns.Count) lines, moods: $((($m.turns | ForEach-Object { $_.mood }) -join ','))"
    $page = Invoke-WebRequest -UseBasicParsing -Headers $auth 'http://localhost:8000/'
    Say "app page: HTTP $($page.StatusCode), CSP header/meta present: $($page.Content -match 'Content-Security-Policy')"
    Say 'SMOKE TEST PASSED'
  } catch { Say "SMOKE TEST FAILED: $($_.Exception.Message)" }
}

Run 'containers' 'docker compose ps' | Out-Null
Run 'app log (last 60 lines)' 'docker compose logs app --tail 60' | Out-Null
Say ""
Say 'Try it: docker compose exec app python -m ai_tutor make-link test-teacher Priya   then open that link in Chrome (it works for 5 minutes).'
Say 'Admin console: docker compose exec app python -m ai_tutor create-admin <username>  then  http://localhost:8000/admin'
Say 'Stop:  docker compose down'
