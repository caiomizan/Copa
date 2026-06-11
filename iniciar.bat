@echo off
title Copa 2026 - Bolao Local

where node >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo  ERRO: Node.js nao encontrado.
  echo  Instale em https://nodejs.org e tente novamente.
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0node_modules" (
  echo  Instalando dependencias...
  cd /d "%~dp0"
  npm install
)

echo.
echo  Iniciando Copa 2026 Bolao...
echo  Acesse: http://127.0.0.1:3026
echo.
node "%~dp0server.js"
pause
