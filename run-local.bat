@echo off

echo ========================================
echo       LOGISHIELD LOCAL STARTUP
echo ========================================
echo.

start "LogiShield Backend" cmd /k "cd /d C:\LogiShield && backend\.venv\Scripts\activate.bat && python -m uvicorn backend.main:app --reload"

timeout /t 3 /nobreak >nul

start "LogiShield Frontend" cmd /k "cd /d C:\LogiShield\frontend && npm run dev"

echo.
echo Backend:  http://127.0.0.1:8000
echo Frontend: http://localhost:3000
echo.
echo ========================================