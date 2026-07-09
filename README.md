# Recruit Insights V8 Stable

This is the fixed Node/React + FastAPI version.

## Why V7 showed a white screen

V7 used Vite 7 / React 19 and Plotly CDN. On some machines or browsers this can show a blank page due to Node/browser compatibility or CDN/runtime issues.

## What changed in V8

- Downgraded to stable frontend stack:
  - Vite 5.4.11
  - React 18.2.0
  - React DOM 18.2.0
  - @vitejs/plugin-react 4.3.4
- Removed Plotly CDN dependency.
- Replaced charts with lightweight native React/CSS charts.
- Added visible backend error message instead of blank page.
- Kept clean sidebar, Back navigation, drilldowns, candidate profile, and improved cards.
- Build tested successfully.

## Backend

```powershell
cd "C:\Users\manishankar.bandaru\Desktop\hiring_dashboard_react_fastapi_v8_stable\backend"
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Check:

```text
http://127.0.0.1:8000/docs
```

## Frontend

```powershell
cd "C:\Users\manishankar.bandaru\Desktop\hiring_dashboard_react_fastapi_v8_stable\frontend"
npm config set strict-ssl false
npm install --no-audit --no-fund
npm run dev
```

Open:

```text
http://localhost:5173
```

## If page is still blank

Open browser Developer Tools > Console. But V8 should now show a backend error message if the API is not running.
