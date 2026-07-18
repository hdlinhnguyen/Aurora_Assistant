#!/bin/bash
echo "=== BAT DAU KHOI CHAY HE THONG AURORA ==="
# 1. Start Docker Database
docker compose -f backend/docker/docker-compose.yml -p aurora up -d

# Wait for DB
sleep 2

# 2. Start Go Backend
cd backend && go run ./cmd/server &
GO_PID=$!

# 3. Start Next.js Frontend
cd ../frontend && npm run dev &
NEXT_PID=$!

# 4. Start Python FastAPI
cd ../learning-path/src && ../../.venv/bin/python -m uvicorn learning_path.api:app --port 8000 &
PY_PID=$!

echo "=========================================="
echo "HE THONG DA SAN SANG KHOI CHAY!"
echo "Trang Web: http://localhost:3000"
echo "Go Backend: http://localhost:8082/api/health"
echo "Python API: http://localhost:8000/docs"
echo "Nhan Ctrl+C de dung tat ca cac services"
echo "=========================================="

trap "kill $GO_PID $NEXT_PID $PY_PID; docker compose -f backend/docker/docker-compose.yml -p aurora stop; exit" SIGINT SIGTERM

wait
