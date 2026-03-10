Write-Host "Starting database..."
docker compose up -d db

Write-Host "Starting API server..."
Start-Process powershell -ArgumentList "cd apps/api; npm install; npm run dev"

Write-Host "Starting Web UI..."
Start-Process powershell -ArgumentList "cd web; npm install; npm run dev"

Write-Host "Development environment launching..."
Write-Host "API: http://localhost:8088"
Write-Host "WEB: http://localhost:3000"
