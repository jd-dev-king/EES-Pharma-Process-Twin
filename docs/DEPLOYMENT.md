# Deployment

## Public architecture

- Frontend: GitHub Pages
- API: Railway FastAPI service
- Database: Railway PostgreSQL

## Production URLs

- Frontend: `https://jd-dev-king.github.io/EES-Pharma-Process-Twin/`
- API: `https://pharma-process-api-production.up.railway.app`
- Health: `https://pharma-process-api-production.up.railway.app/api/health`

## GitHub repository variable

Create this repository-level Actions variable:

```text
VITE_API_BASE_URL=https://pharma-process-api-production.up.railway.app
```

The Pages workflow validates that this variable exists and injects it during the Vite build.

## Railway variables

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
ENVIRONMENT=production
ALLOWED_ORIGINS=https://jd-dev-king.github.io,https://ees-jdl.com,https://www.ees-jdl.com,https://portfolio.jeremiahlupton.com
```

## Railway service configuration

```text
Root Directory: backend
Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
Healthcheck Path: /api/health
```

## CORS verification

```bash
curl -i -X OPTIONS \
  -H "Origin: https://jd-dev-king.github.io" \
  -H "Access-Control-Request-Method: GET" \
  https://pharma-process-api-production.up.railway.app/api/health
```
