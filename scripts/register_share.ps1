# Register ChatSys as a Windows Context Menu Option ("Share with ChatSys")
# This will add a right-click menu item to all files

$ExePath = "$PSScriptRoot\..\dist\win-unpacked\ChatSys.exe" # Typical path for electron-builder --dir
if (-not (Test-Path $ExePath)) {
    # If not in dist, try current directory exe
    $ExePath = "$PSScriptRoot\..\ChatSys.exe"
}
if (-not (Test-Path $ExePath)) {
    Write-Warning "Could not find ChatSys.exe. Please ensure you have built the app first."
    exit
}

$ExePath = [System.IO.Path]::GetFullPath($ExePath)
$Command = "`"$ExePath`" `"%1`""

# Register for all files
$RegPath = "HKCU:\Software\Classes\*\shell\ChatSys"
if (-not (Test-Path $RegPath)) { New-Item -Path $RegPath -Force }
Set-ItemProperty -Path $RegPath -Name "(Default)" -Value "Share with ChatSys"
Set-ItemProperty -Path $RegPath -Name "Icon" -Value "$ExePath"

$CmdPath = "$RegPath\command"
if (-not (Test-Path $CmdPath)) { New-Item -Path $CmdPath -Force }
Set-ItemProperty -Path $CmdPath -Name "(Default)" -Value $Command

# Also add to "Send To" menu
$SendToDir = [System.Environment]::GetFolderPath("SendTo")
$ShortcutPath = "$SendToDir\ChatSys.lnk"
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $ExePath
$Shortcut.Save()

Write-Host "✅ ChatSys has been registered in the context menu ('Share with ChatSys')."
Write-Host "✅ ChatSys has been added to the 'Send to' menu."
Write-Host "You can now right-click any file to share it via ChatSys."
