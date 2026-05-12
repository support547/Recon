@echo off
title InvenSync ERP - Starting...
color 0A

:: Always run from this project folder (prevents loading an old/wrong server.js)
cd /d "%~dp0"

echo.
echo  ================================================
echo   InvenSync ERP - Local Setup
echo  ================================================
echo.

:: Check Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found!
    echo  Please install from: https://nodejs.org
    pause
    exit
)
echo  [OK] Node.js found

:: Install packages if needed
if not exist "node_modules" (
    echo.
    echo  [SETUP] Installing packages... (first time only, takes 1-2 mins)
    npm install
    echo  [OK] Packages installed
)

:: Check PostgreSQL
echo.
echo  [INFO] Checking PostgreSQL...
psql -U postgres -c "SELECT 1" >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ================================================
    echo   PostgreSQL Setup Required
    echo  ================================================
    echo.
    echo  1. Download PostgreSQL from:
    echo     https://www.postgresql.org/download/windows/
    echo.
    echo  2. Install with default settings
    echo     Remember your password!
    echo.
    echo  3. After install, run this file again
    echo.
    echo  OR: Edit server.js and set your DB password
    echo  ================================================
    pause
    exit
)

:: Create database
echo  [DB] Setting up database...
psql -U postgres -c "CREATE DATABASE invensync;" >nul 2>&1
psql -U postgres -d invensync -f setup.sql >nul 2>&1
echo  [OK] Database ready

:: Start server
echo.
echo  [TIP] If you changed server.js: close any old black Node window ^(Ctrl+C^) first,
echo        or you may see "Invalid table" on new report pages.
echo.
echo  ================================================
echo   Server starting on http://localhost:3001
echo   Open your browser and go to:
echo   http://localhost:3001
echo  ================================================
echo.
echo  Press Ctrl+C to stop the server
echo.

node server.js
pause
