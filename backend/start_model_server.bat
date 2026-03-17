@echo off
title SmartFocus ML Server (FastAPI)
echo ============================================
echo   SmartFocus ML Server — Powered by FastAPI
echo ============================================
echo.

REM Change to the directory where this bat file lives
cd /d "%~dp0"

REM Check if model files exist
if not exist "website_model.pkl" (
    echo ERROR: website_model.pkl not found!
    echo Place website_model.pkl and vectorizer.pkl in:
    echo %~dp0
    pause
    exit /b 1
)

if not exist "vectorizer.pkl" (
    echo ERROR: vectorizer.pkl not found!
    pause
    exit /b 1
)

echo Model files found. Starting high-performance server...
echo.
echo The extension "ML Active" badge will turn green once running.
echo Documentation available at: http://127.0.0.1:5000/docs
echo Press Ctrl+C to stop the server.
echo.

uvicorn model_server:app --host 127.0.0.1 --port 5000 --log-level info
pause
