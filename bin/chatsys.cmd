@echo off
setlocal
set "BIN_DIR=%~dp0"
pushd "%BIN_DIR%.."
set "APP_ROOT=%CD%"
popd
set "EXE_NAME=ChatSys.exe"

if "%~1"=="gui" (
    set "ELECTRON_RUN_AS_NODE="
    if exist "%APP_ROOT%\%EXE_NAME%" (
        start "" "%APP_ROOT%\%EXE_NAME%"
    ) else (
        start "" "%APP_ROOT%\node_modules\.bin\electron.cmd" .
    )
) else (
    set "ELECTRON_RUN_AS_NODE=1"
    if exist "%APP_ROOT%\%EXE_NAME%" (
        "%APP_ROOT%\%EXE_NAME%" "%APP_ROOT%\resources\app.asar\src\credsync\cli.js" %*
    ) else (
        CALL "%APP_ROOT%\node_modules\.bin\electron.cmd" "%APP_ROOT%\src\credsync\cli.js" %*
    )
)
endlocal
