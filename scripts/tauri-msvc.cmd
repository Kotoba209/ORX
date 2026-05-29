@echo off
setlocal

set "VS_VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2017\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
set "RUST_MSVC_BIN=C:\Program Files\Rust stable MSVC 1.95\bin"
set "MSVC_LINK_BIN=C:\Program Files (x86)\Microsoft Visual Studio\2017\BuildTools\VC\Tools\MSVC\14.16.27023\bin\Hostx64\x64"

if not exist "%VS_VCVARS%" goto missing_vcvars
if not exist "%RUST_MSVC_BIN%\cargo.exe" goto missing_cargo
if not exist "%MSVC_LINK_BIN%\link.exe" goto missing_link

call "%VS_VCVARS%" >nul
set "PATH=%RUST_MSVC_BIN%;%MSVC_LINK_BIN%;%PATH%"
set "CARGO=%RUST_MSVC_BIN%\cargo.exe"
set "RUSTC=%RUST_MSVC_BIN%\rustc.exe"
set "CARGO_BUILD_TARGET=x86_64-pc-windows-msvc"
set "CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER=%MSVC_LINK_BIN%\link.exe"
set "CARGO_TARGET_DIR=%~dp0..\src-tauri\target-msvc"
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

if "%~1"=="check" (
  "%RUST_MSVC_BIN%\cargo.exe" check --manifest-path "%~dp0..\src-tauri\Cargo.toml" --target x86_64-pc-windows-msvc -j 1
  exit /b %ERRORLEVEL%
)

if "%~1"=="test" (
  "%RUST_MSVC_BIN%\cargo.exe" test --manifest-path "%~dp0..\src-tauri\Cargo.toml" --target x86_64-pc-windows-msvc -j 1
  exit /b %ERRORLEVEL%
)

if "%~1"=="clean" (
  "%RUST_MSVC_BIN%\cargo.exe" clean --manifest-path "%~dp0..\src-tauri\Cargo.toml"
  exit /b %ERRORLEVEL%
)

if "%~1"=="dev" (
  "%~dp0dev-msvc-direct.cmd"
  exit /b %ERRORLEVEL%
)

echo Usage:
echo   scripts\tauri-msvc.cmd check
echo   scripts\tauri-msvc.cmd test
echo   scripts\tauri-msvc.cmd clean
echo   scripts\tauri-msvc.cmd dev
exit /b 1

:missing_vcvars
echo Missing Visual Studio vcvars64.bat: %VS_VCVARS%
exit /b 1

:missing_cargo
echo Missing MSVC cargo.exe: %RUST_MSVC_BIN%\cargo.exe
exit /b 1

:missing_link
echo Missing MSVC link.exe: %MSVC_LINK_BIN%\link.exe
exit /b 1
