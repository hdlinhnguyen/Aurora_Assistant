# Script to run Aurora Assistant project (PostgreSQL, Go Backend, and Next.js Frontend)

Write-Host "=== BAT DAU KHOI CHAY HE THONG AURORA SOCRATIC TUTOR ===" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Gray

# 1. Start Docker Database
Write-Host "1. Dang bat Co so du lieu PostgreSQL..." -ForegroundColor Yellow
docker compose -f backend/docker/docker-compose.yml -p aurora up -d

# Wait a couple of seconds for DB initialization
Start-Sleep -Seconds 2

# 2. Start Go Backend in a new PowerShell window
Write-Host "2. Dang khoi chay May chu API Backend (Cong 8082)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'AURORA BACKEND RUNNING ON PORT 8082' -ForegroundColor Green; `$env:LEARNING_PATH_URL='http://127.0.0.1:8000'; cd backend; go run ./cmd/server"

# 3. Start Next.js Frontend in a new PowerShell window
Write-Host "3. Dang khoi chay Giao dien Website (Cong 3000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'AURORA FRONTEND RUNNING ON PORT 3000' -ForegroundColor Green; cd frontend; npm run dev"

# 4. Start Python FastAPI Assistant Server in a new PowerShell window
Write-Host "4. Dang khoi chay May chu Goi y & Lo trinh FastAPI (Cong 8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'AURORA PYTHON ASSISTANT RUNNING ON PORT 8000' -ForegroundColor Green; cd learning-path; cd src; ..\\.venv\\Scripts\\python -m uvicorn learning_path.api:app --port 8000"

Write-Host "==========================================" -ForegroundColor Gray
Write-Host "HE THONG DA SAN SANG KHOI CHAY!" -ForegroundColor Green
Write-Host "Trang Web Hoc Sinh/Giao Vien: http://localhost:3000" -ForegroundColor Cyan
Write-Host "API Backend Health Check (Go): http://localhost:8082/api/health" -ForegroundColor Cyan
Write-Host "API Python Assistant (FastAPI): http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Gray
