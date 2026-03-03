[Setup]
AppName=ChatSys
AppVersion=2.0.1
AppVerName=ChatSys 2.0.1
AppPublisher=ChatSys Team
AppPublisherURL=https://github.com/AjayVerma/ChatSys
DefaultDirName={pf}\ChatSys
DefaultGroupName=ChatSys
DisableProgramGroupPage=yes
OutputBaseFilename=ChatSys-x86-v2.0.1
DisableWelcomePage=yes
WizardStyle=modern
CloseApplications=yes
AppMutex=ChatSysAppMutex
PrivilegesRequired=lowest
LicenseFile=LICENSE.txt
OutputDir=..\Output\windows\x86
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
