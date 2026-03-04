[Setup]
AppName=ChatSys
AppVersion=2.1.3
AppVerName=ChatSys 2.1.3
AppPublisher=ChatSys Team
AppPublisherURL=https://github.com/AjayVerma/ChatSys
DefaultDirName={pf}\ChatSys
DefaultGroupName=ChatSys
DisableProgramGroupPage=yes
OutputBaseFilename=ChatSys-x64-v2.1.3
DisableWelcomePage=yes
WizardStyle=modern
CloseApplications=yes
AppMutex=ChatSysAppMutex
PrivilegesRequired=lowest
LicenseFile=LICENSE.txt
OutputDir=..\Output\windows\x64
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\..\dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\ChatSys (64-bit)"; Filename: "{app}\ChatSys.exe"
Name: "{autodesktop}\ChatSys"; Filename: "{app}\ChatSys.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\ChatSys.exe"; Description: "{cm:LaunchProgram,ChatSys}"; Flags: nowait postinstall skipifsilent
