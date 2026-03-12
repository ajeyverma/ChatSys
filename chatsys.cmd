@echo off
if "%~1"=="" (
    start "" "%~dp0ChatSys.exe"
) else (
    "%~dp0ChatSys.exe" --cli %*
)
