[Setup]
AppName=ChatSys
AppVersion=1.0.0
DefaultDirName={autopf}\ChatSys
DefaultGroupName=ChatSys
OutputBaseFilename=ChatSys_Setup
PrivilegesRequired=lowest
OutputDir=dist\inno
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\ChatSys"; Filename: "{app}\ChatSys.exe"
Name: "{autodesktop}\ChatSys"; Filename: "{app}\ChatSys.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\ChatSys.exe"; Description: "{cm:LaunchProgram,ChatSys}"; Flags: nowait postinstall skipifsilent
