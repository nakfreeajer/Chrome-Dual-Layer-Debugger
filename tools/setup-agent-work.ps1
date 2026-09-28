$ErrorActionPreference = 'Stop'

$root = Join-Path (Get-Location) '.agent-work'

$dirs = @(
  'current',
  'discovery\sessions',
  'discovery\research',
  'discovery\decisions',
  'discovery\open-questions',
  'ideas\open',
  'ideas\accepted',
  'ideas\rejected',
  'ideas\implemented',
  'milestones',
  'transcripts\architect',
  'transcripts\executor',
  'reports\architect',
  'reports\executor',
  'artifacts',
  'bridge\outbox',
  'bridge\readback',
  'cache',
  'temp',
  'private'
)

foreach ($dir in $dirs) {
  $path = Join-Path $root $dir
  New-Item -ItemType Directory -Force -Path $path | Out-Null
}

Write-Host "Created local ignored AMO workspace at $root"
Write-Host 'Relay is manual: no orchestrator, watcher, doorbell, or automatic bridge process is installed.'
