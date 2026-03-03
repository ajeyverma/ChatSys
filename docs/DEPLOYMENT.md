# ChatSys Deployment & Build Guide

Since ChatSys targets Windows, macOS, Linux, Android, and iOS, the compilation process maps drastically different toolchains using distinct `build/` subdirectories.

## Building for Windows (`.exe` Installers)
Requirements: Node.js, `electron-builder` and `Inno Setup 6`.

1. Compile the unpacked raw Electron binary for your target architecture:
   - **For 64-bit (x64)**: `npm run build:x64`
   - **For 32-bit (x86)**: `npm run build:x86`
   - **For ARM64**: `npm run build:arm64`
2. Open the specific architecture setup script containing your desired parameters located at `build\windows\`.
3. Compile the corresponding script using Inno Setup compiler (`ISCC.exe`):
   - `ISCC.exe build\windows\installer_x64.iss`
   - `ISCC.exe build\windows\installer_x86.iss`
   - `ISCC.exe build\windows\installer_arm64.iss`
4. Resulting installer is piped directly to `dist\windows\(arch)\ChatSys_(arch)_Setup.exe`.

## Building for Android / iOS
Requirements: Flutter SDK, Android Studio, Xcode.

1. Navigate to the mobile frontend repository: 
   ```bash
   cd chatsys_mobile
   ```
2. For an Android APK:
   ```bash
   flutter build apk --release
   ```
3. Move the binary from `build/app/outputs/fluent/release/app-release.apk` to the global `dist/mobile/apk/` directory.

## Upcoming Platforms
- **macOS (`.dmg`)**: Configuration files will be generated under `build/mac/` relying on XCode signing.
- **Linux (`.deb`/`.rpm`)**: Configuration scripts for `fpm` and `appimagetool` will reside in `build/linux/`.
