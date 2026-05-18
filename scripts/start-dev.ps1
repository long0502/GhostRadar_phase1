# Stop any Docker API container to avoid port conflicts with local dev server
Write-Host "Stopping Docker API container (if running)..."
docker stop ghost_api 2>$null
docker rm ghost_api 2>$null

Write-Host "Starting database..."
docker compose up -d db

Write-Host "Starting API server (local, hot-reload)..."
Start-Process powershell -ArgumentList "cd apps/api; npm install; npm run dev"

Write-Host "Starting Web UI..."
Start-Process powershell -ArgumentList "cd web; npm install; npm run dev"

Write-Host "Starting Admin Dashboard..."
Start-Process powershell -ArgumentList "cd apps/admin; npm install; npx next dev -p 4000"

Write-Host ""
Write-Host "Development environment launching..."
Write-Host "  API: http://localhost:8088 (local tsx watch)"
Write-Host "  WEB: http://localhost:3000"
Write-Host "  ADMIN: http://localhost:4000"
Write-Host ""
Write-Host "NOTE: Code changes are auto-applied via hot-reload (tsx watch)."
