@echo off
cd /d "%~dp0"
title BSI Pruefungsvorbereitung

echo.
echo  BSI Pruefungsvorbereitung wird gestartet...
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  FEHLER: Node.js ist nicht installiert.
    echo.
    echo  Bitte Node.js von https://nodejs.org herunterladen
    echo  und installieren, danach diese Datei erneut starten.
    echo.
    pause
    exit /b 1
)

echo  Hinweis: Dieses Fenster nicht schliessen waehrend der Nutzung.
echo.

timeout /t 1 /nobreak >nul
start "" "http://localhost:12121"
node server.js

pause
