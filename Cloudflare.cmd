@echo off
setlocal
cd /d "%~dp0family-wishlist"
if errorlevel 1 exit /b 1
set "CLOUDFLARE_NODE_DIR=C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1105-1297-0_26.1105.1297.0_x64__3k8sg7r9htsxt\dependencies\node\bin"
set "PATH=%CLOUDFLARE_NODE_DIR%;%PATH%"
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js %*
exit /b %ERRORLEVEL%
