[Setup]
AppName=ChatSys (32-bit)
AppVersion=1.0.0
DefaultDirName={autopf}\ChatSys
DefaultGroupName=ChatSys
OutputBaseFilename=ChatSys_x86_Setup
PrivilegesRequired=lowest
OutputDir=..\..\dist\windows\x86
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesAllowed=x86

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\..\dist\win-ia32-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\ChatSys (32-bit)"; Filename: "{app}\ChatSys.exe"
Name: "{autodesktop}\ChatSys"; Filename: "{app}\ChatSys.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\ChatSys.exe"; Description: "{cm:LaunchProgram,ChatSys}"; Flags: nowait postinstall skipifsilent
