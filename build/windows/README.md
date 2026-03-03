# Windows Installer Deployment Guide

This directory contains the Inno Setup configuration scripts required to compile professional `.exe` setup packages for the ChatSys Electron application natively on Windows.

## Folder Structure

- `installer_x64.iss`: Compiles the 64-bit Windows installer (Intel/AMD).
- `installer_x86.iss`: Compiles the 32-bit Windows installer (Legacy/x86).
- `installer_arm64.iss`: Compiles the ARM64 Windows installer (Snapdragon etc.).

## Compilation Workflow

Before compiling an `.iss` setup script, you must first generate the unpacked Electron binaries for the target architecture using Node.js.

### 1. Build the Raw Binaries (Node.js)

Run the appropriate command from the root of the project (`e:\ChatSys`) to compile the `.exe` and `.asar` payload:

- **64-bit (x64)**: `npm run build:x64`
- **32-bit (x86)**: `npm run build:x86`
- **ARM64**: `npm run build:arm64`

These commands will output the raw payload into the generic `dist/win-(arch)-unpacked` directories.

### 2. Compile the Setup Installer (Inno Setup)

Once the unpacked binaries exist, you wrap them into a professional Setup Installer wizard using the Inno Setup Compiler (`ISCC.exe`).

Run the associated script from the root of the project:

- **64-bit (x64)**: `"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" build\windows\installer_x64.iss`
- **32-bit (x86)**: `"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" build\windows\installer_x86.iss`
- **ARM64**: `"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" build\windows\installer_arm64.iss`

### Output Location

The finalized, redistributable installers will automatically be piped to the corresponding subdirectories underneath `dist\windows\`:
- `dist\windows\x64\ChatSys_x64_Setup.exe`
- `dist\windows\x86\ChatSys_x86_Setup.exe`
- `dist\windows\arm64\ChatSys_arm64_Setup.exe`
