@echo off
cd /d "%~dp0"
set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" -m pip install -q -r requirements.txt
if errorlevel 1 goto fin
echo Abre http://localhost:3000
"%PY%" -u app.py
:fin
pause
