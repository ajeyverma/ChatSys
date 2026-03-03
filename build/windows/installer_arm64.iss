[Setup]
AppName=ChatSys (ARM64)
AppVersion=1.0.0
DefaultDirName={autopf}\ChatSys
DefaultGroupName=ChatSys
OutputBaseFilename=ChatSys_arm64_Setup
PrivilegesRequired=lowest
OutputDir=..\..\dist\windows\arm64
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesAllowed=arm64

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\..\dist\win-arm64-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\ChatSys (ARM64)"; Filename: "{app}\ChatSys.exe"
Name: "{autodesktop}\ChatSys"; Filename: "{app}\ChatSys.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\ChatSys.exe"; Description: "{cm:LaunchProgram,ChatSys}"; Flags: nowait postinstall skipifsilent
