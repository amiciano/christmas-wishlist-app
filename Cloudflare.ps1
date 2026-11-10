$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot 'family-wishlist')
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } else { 'C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1105-1297-0_26.1105.1297.0_x64__3k8sg7r9htsxt\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodeExecutable)) { throw 'Install Node.js 22.13 or newer, then run this script again.' }
$env:PATH = (Split-Path -Parent $nodeExecutable) + ';' + $env:PATH
& $nodeExecutable --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js @args
exit $LASTEXITCODE
