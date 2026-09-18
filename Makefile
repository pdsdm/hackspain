# PARA EL EQUIPO: `make check` es el único comando que un agente (o tú) debe pasar antes de dar algo por terminado.
# Detecta qué hay en backend/ y frontend/. Cuando elijáis stack el viernes, ajustad los comandos
# y copiadlos también a la sección "Comandos" de backend/AGENTS.md y frontend/AGENTS.md.

.PHONY: check backend-check frontend-check

check: backend-check frontend-check
	@echo "✅ make check OK"

backend-check:
	@if [ -f backend/requirements.txt ] || [ -f backend/pyproject.toml ]; then \
		echo "→ backend (Python)"; \
		cd backend && { [ -d .venv ] && . .venv/bin/activate; true; } && \
		if command -v ruff >/dev/null; then ruff check .; fi && \
		{ python3 -m pytest -q || [ $$? -eq 5 ]; }; \
	elif [ -f backend/package.json ]; then \
		echo "→ backend (Node)"; \
		cd backend && npm run lint && npm test && npm run build; \
	else \
		echo "→ backend vacío, nada que comprobar"; \
	fi

frontend-check:
	@if [ -f frontend/package.json ]; then \
		echo "→ frontend"; \
		cd frontend && npm run lint && npm run build; \
	else \
		echo "→ frontend vacío, nada que comprobar"; \
	fi
