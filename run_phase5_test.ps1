$Report = "phase5_test_report.txt"
Remove-Item $Report -ErrorAction Ignore

function Append($text) {
    Add-Content -Path $Report -Value $text
}

Append "---- After Reset ----"
docker exec ghost_db psql -U ghostradar -d ghostradar -c "update ai_quota_policy set daily_limit = 2 where scope='ip';" | Out-File -Append $Report
docker exec ghost_db psql -U ghostradar -d ghostradar -c "update ai_quota_policy set daily_limit = 4 where scope='global';" | Out-File -Append $Report
docker exec ghost_db psql -U ghostradar -d ghostradar -c "delete from ai_usage_daily where usage_date = (now() at time zone 'utc')::date;" | Out-File -Append $Report

Append "---- Scan A1 ----"
try {
    $r = Invoke-WebRequest -Uri "http://localhost:8088/scan?lat=10.7711&lon=107.6911&radiusKm=5" -Method POST
    $r.StatusCode | Out-File -Append $Report
    $r.Content | Out-File -Append $Report
} catch {
    $_.Exception.Response.StatusCode.value__ | Out-File -Append $Report
}

Append "---- Scan A2 ----"
try {
    $r = Invoke-WebRequest -Uri "http://localhost:8088/scan?lat=10.7722&lon=107.6922&radiusKm=5" -Method POST
    $r.StatusCode | Out-File -Append $Report
    $r.Content | Out-File -Append $Report
} catch {
    $_.Exception.Response.StatusCode.value__ | Out-File -Append $Report
}

Append "---- Scan A3 ----"
try {
    $r = Invoke-WebRequest -Uri "http://localhost:8088/scan?lat=10.7733&lon=107.6933&radiusKm=5" -Method POST
    $r.StatusCode | Out-File -Append $Report
    $r.Content | Out-File -Append $Report
} catch {
    $_.Exception.Response.StatusCode.value__ | Out-File -Append $Report
}

Append "---- Usage After Scans ----"
docker exec ghost_db psql -U ghostradar -d ghostradar -c "select scope, scope_key, ai_calls, scan_calls from ai_usage_daily where usage_date = (now() at time zone 'utc')::date order by scope, scope_key;" | Out-File -Append $Report

Append "---- Metrics ----"
try {
    $m = Invoke-WebRequest -Uri "http://localhost:8088/internal/metrics" -Method GET
    $m.Content | Out-File -Append $Report
} catch {
    $_ | Out-File -Append $Report
}

Write-Host "Report generated"