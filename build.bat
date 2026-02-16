@echo off
echo ============================================
echo   Build Hub Desktop - Build Script
echo ============================================
echo.

REM Step 1: Install Python dependencies
echo [1/4] Installing Python dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install Python dependencies
    pause
    exit /b 1
)

REM Step 2: Install frontend dependencies
echo [2/4] Installing frontend dependencies...
cd frontend
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install frontend dependencies
    cd ..
    pause
    exit /b 1
)

REM Step 3: Build frontend
echo [3/4] Building frontend...
call npx vite build
if errorlevel 1 (
    echo ERROR: Failed to build frontend
    cd ..
    pause
    exit /b 1
)
cd ..

REM Step 4: Build exe with PyInstaller
echo [4/4] Building executable...
pyinstaller buildhub.spec --noconfirm
if errorlevel 1 (
    echo ERROR: Failed to build executable
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Build complete!
echo   Executable: dist\BuildHub.exe
echo ============================================
echo.
pause
