# EES Pharma Process Twin

**Part 2 of the Enterprise Execution Suite**

A full-stack pharmaceutical manufacturing execution and digital-twin platform spanning office scheduling, warehouse logistics, bulk receiving, weighing, mixing, QA, packaging, shipping, CIP, reliability, electronic batch records, automation, historian analytics, workforce training, and immersive plant visualization.

## Live deployment

- Application: `https://jd-dev-king.github.io/EES-Pharma-Process-Twin/`
- API health: `https://pharma-process-api-production.up.railway.app/api/health`
- Repository: `https://github.com/jd-dev-king/EES-Pharma-Process-Twin`

## Architecture

```text
GitHub Pages React frontend
        ↓
Railway FastAPI service
        ↓
Railway PostgreSQL
```

The frontend reads `VITE_API_BASE_URL` during the GitHub Actions build. The backend reads `DATABASE_URL` and `ALLOWED_ORIGINS` from Railway service variables.

## Local development

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm ci
npm run dev
```

## Production build

```bash
cd frontend
VITE_API_BASE_URL=https://pharma-process-api-production.up.railway.app npm run build
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Installation](docs/INSTALLATION.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Demo guide](docs/DEMO-GUIDE.md)
- [Testing](docs/TESTING.md)
- [Validation](docs/VALIDATION.md)
- [Security](docs/SECURITY.md)
- [Release checklist](docs/RELEASE-CHECKLIST.md)
- [Public release](docs/PUBLIC-RELEASE.md)

## Repository hygiene

The `.gitignore` excludes virtual environments, dependency folders, local databases, environment secrets, generated builds, caches, logs, media, and IDE metadata. Do not use `git add -f` for ignored runtime files.

## License

MIT License. See [LICENSE](LICENSE).
