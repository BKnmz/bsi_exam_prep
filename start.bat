@echo off
:: Set current directory to directory of the batch file
cd /d "%~dp0"
title BSI Pruefungsvorbereitung
echo ==================================================
echo   BSI PRUEFUNGSVORBEREITUNG STARTING...
echo ==================================================
echo.
echo   1. Starte lokalen Webserver (Offline-Modus)...
echo   2. Oeffne App im Standard-Browser...
echo.
echo   Hinweis: Schliesse dieses Fenster nicht waehrend der Nutzung.
echo ==================================================

:: Wait 1 second and launch default browser at localhost port
timeout /t 1 /nobreak >nul
start "" "http://localhost:12121"

:: Start the node server
node server.js

pause
