[Setup]
AppName=ChatSys
AppVersion=2.6.0
AppVerName=ChatSys 2.6.0
AppPublisher=ChatSys Team
AppPublisherURL=https://github.com/AjayVerma/ChatSys
DefaultDirName={pf}\ChatSys
DefaultGroupName=ChatSys
DisableProgramGroupPage=yes
OutputBaseFilename=ChatSys-x86-v2.6.0
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
Source: "..\..\chatsys.cmd"; DestDir: "{app}"; Flags: ignoreversion

[Registry]
Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}"; Check: NeedsAddPath(ExpandConstant('{app}'))

[Icons]
Name: "{group}\ChatSys"; Filename: "{app}\ChatSys.exe"
Name: "{autodesktop}\ChatSys"; Filename: "{app}\ChatSys.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\ChatSys.exe"; Description: "{cm:LaunchProgram,ChatSys}"; Flags: nowait postinstall skipifsilent

[Code]
function NeedsAddPath(Param: string): boolean;
var
  OrigPath: string;
begin
  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath) then begin
    Result := True;
    exit;
  end;
  // look for the path with leading and trailing semicolon
  // Pos() returns 0 if not found
  Result := Pos(';' + Param + ';', ';' + OrigPath + ';') = 0;
end;
