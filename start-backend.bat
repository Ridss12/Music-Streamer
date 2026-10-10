@echo off
echo Starting Music Streaming Backend...
cd %~dp0backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
