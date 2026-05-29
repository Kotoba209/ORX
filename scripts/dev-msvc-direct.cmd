@echo off
setlocal

set "VS_VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2017\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
set "RUST_MSVC_BIN=C:\Program Files\Rust stable MSVC 1.95\bin"
set "MSVC_LINK_BIN=C:\Program Files (x86)\Microsoft Visual Studio\2017\BuildTools\VC\Tools\MSVC\14.16.27023\bin\Hostx64\x64"
set "PROJECT_ROOT=%~dp0.."
set "TAURI_ROOT=%PROJECT_ROOT%\src-tauri"
set "CARGO_TARGET_DIR=%TAURI_ROOT%\target-msvc"

if not exist "%VS_VCVARS%" goto missing_vcvars
if not exist "%RUST_MSVC_BIN%\cargo.exe" goto missing_cargo
if not exist "%MSVC_LINK_BIN%\link.exe" goto missing_link

call "%VS_VCVARS%" >nul
set "PATH=%RUST_MSVC_BIN%;%MSVC_LINK_BIN%;%PATH%"
set "CARGO=%RUST_MSVC_BIN%\cargo.exe"
set "RUSTC=%RUST_MSVC_BIN%\rustc.exe"
set "CARGO_BUILD_TARGET=x86_64-pc-windows-msvc"
set "CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER=%MSVC_LINK_BIN%\link.exe"
set "CARGO_TARGET_DIR=%CARGO_TARGET_DIR%"
set "CARGO_PROFILE_DEV_DEBUG=0"
set "CARGO_PROFILE_TEST_DEBUG=0"
set "CARGO_INCREMENTAL=0"
set "TMP=%CARGO_TARGET_DIR%\tmp"
set "TEMP=%CARGO_TARGET_DIR%\tmp"
set "RUSTFLAGS=-C debuginfo=0"

if not exist "%TMP%" mkdir "%TMP%"

echo rustc:
where rustc
echo cargo:
where cargo
echo link:
where link
echo target:
echo %CARGO_TARGET_DIR%

cd /d "%PROJECT_ROOT%"
start "ORX Vite" /B cmd /c "npm run dev"

powershell.exe -NoProfile -Command "$deadline=(Get-Date).AddSeconds(60); while((Get-Date) -lt $deadline){ try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5178' -TimeoutSec 1 | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"
if errorlevel 1 (
  echo Vite did not become ready on http://127.0.0.1:5178
  exit /b 1
)

echo Vite ready: http://127.0.0.1:5178
"%RUST_MSVC_BIN%\cargo.exe" run -j 1 --manifest-path "%TAURI_ROOT%\Cargo.toml" --no-default-features --target x86_64-pc-windows-msvc --color always --
exit /b %ERRORLEVEL%

:missing_vcvars
echo Missing Visual Studio vcvars64.bat: %VS_VCVARS%
exit /b 1

:missing_cargo
echo Missing MSVC cargo.exe: %RUST_MSVC_BIN%\cargo.exe
exit /b 1

:missing_link
echo Missing MSVC link.exe: %MSVC_LINK_BIN%\link.exe
exit /b 1
