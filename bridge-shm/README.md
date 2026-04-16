# Bridge SHM: AI-Driven Structural Health Monitoring

Full-stack prototype for bridge Structural Health Monitoring (SHM) with synthetic sensing, unsupervised anomaly detection, crack analysis, vehicle load impact, health fusion, time-to-failure (TTF) prediction, and auto-generated inspection reports.

## Project Structure

```text
bridge-shm/
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   └── modules/
│       ├── simulator.py
│       ├── timeseries.py
│       ├── crack_detection.py
│       ├── vehicle.py
│       ├── fusion.py
│       ├── prediction.py
│       └── report.py
└── frontend/
    ├── package.json
    └── src/
        ├── App.jsx
        └── components/
            ├── BridgeMap.jsx
            ├── HealthGauge.jsx
            ├── SensorChart.jsx
            ├── VehicleCounter.jsx
            ├── CrackViewer.jsx
            ├── TTFPanel.jsx
            └── ReportPanel.jsx
```

## Features Implemented

1. Synthetic bridge sensor simulator for 4 spans (light, severe, healthy, moderate).
2. LSTM autoencoder anomaly detection (PyTorch) with thresholding from healthy windows.
3. Crack analysis with YOLO path if available and robust fallback to synthetic annotations.
4. Two-camera vehicle ReID and cumulative span damage scoring.
5. Fusion-based per-span health index with classification bands.
6. 30-day trend simulation and TTF prediction with 90% confidence interval.
7. Anthropic report generation (optional key) with rule-based fallback.
8. Flask REST API with startup pre-analysis cache.
9. Dark industrial React dashboard with interactive span selection.

## Backend Setup (Local)

From project root:

```powershell
cd backend
py -3.10 -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

Backend runs at `http://localhost:5000`.

## Frontend Setup (Local)

Open a second terminal from project root:

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

Frontend runs at `http://localhost:5173` and calls backend via `VITE_API_BASE`.

## One-Click Start (Windows)

From project root, you can launch both servers automatically:

```powershell
./start-all.ps1
```

Or double-click:

```text
start-all.cmd
```

Individual launchers are also available:

```powershell
./start-backend.ps1
./start-frontend.ps1
```

If PowerShell execution policy blocks script execution, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-all.ps1
```

## API Endpoints

- `GET /api/run-full-analysis` runs all phases and refreshes cached output.
- `GET /api/sensor/<span_id>` returns one-span sensor series + timeseries analysis.
- `GET /api/crack/<span_id>` returns crack metrics from current analysis state.
- `GET /api/crack-sim/<span_id>` generates a fresh simulated crack image + metrics for one span.
- `GET /api/crack-sim-all` generates fresh simulated crack outputs for all spans.
- `POST /api/analyze` ingests manual page data (single-span or batch AB-CD) into fusion.
- `POST /api/assistant/chat` asks the AI assistant questions grounded in live analysis data.
- `GET /api/vehicles` returns vehicle matches, counts, dwell, and damage.
- `GET /api/health` returns fused health scores.
- `GET /api/ttf` returns time-to-failure predictions.
- `GET /api/report` returns generated report.

## LLM Report (Optional)

If you want LLM-generated reports:

```powershell
cd backend
copy .env.example .env
set ANTHROPIC_API_KEY=your_key_here
.\.venv\Scripts\python.exe app.py
```

You can also use a free-tier OpenRouter key:

```powershell
set OPENROUTER_API_KEY=your_openrouter_key_here
set OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct:free
.\.venv\Scripts\python.exe app.py
```

Or use your Gemini key:

```powershell
set GEMINI_API_KEY=your_gemini_key_here
set GEMINI_MODEL=gemini-1.5-flash
.\.venv\Scripts\python.exe app.py
```

If no key is provided or API fails, rule-based report generation is used automatically.

The AI Assistant page uses the same keys and fallback behavior.

## Deploy Backend to Render (Free)

1. Push repository to GitHub.
2. Create a new **Web Service** in Render and connect the repo.
3. Configure service:
   - Root Directory: `backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn app:app`
   - Runtime: Python 3.10+
4. Add environment variable (optional): `ANTHROPIC_API_KEY`.
5. Deploy and copy Render backend URL.

## Deploy Frontend to Vercel (Free)

1. Import repository in Vercel.
2. Configure project:
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Add environment variable:
   - `VITE_API_BASE=https://<your-render-backend-url>`
4. Deploy.

## Notes

- The app uses only free/open-source tooling.
- No database is required for this prototype.
- Startup pre-run ensures dashboard loads with immediate data.
