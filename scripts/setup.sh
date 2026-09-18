#!/usr/bin/env bash
set -e

echo "🏴‍☠️ Setup del proyecto..."

# --- Backend ---
if [ -f "backend/requirements.txt" ]; then
  echo "→ Backend Python detectado"
  cd backend
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  cd ..
elif [ -f "backend/package.json" ]; then
  echo "→ Backend Node detectado"
  cd backend
  npm install
  cd ..
else
  echo "→ Backend vacío todavía, nada que instalar"
fi

# --- Frontend ---
if [ -f "frontend/package.json" ]; then
  echo "→ Frontend detectado"
  cd frontend
  npm install
  cd ..
else
  echo "→ Frontend vacío todavía, nada que instalar"
fi

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "→ .env creado a partir de .env.example. Rellena las API keys."
fi

echo "✅ Setup completo"
