param (
    [string]$path,
    [string]$action, # "pin" or "unpin"
    [string]$iconPath
)

$shell = New-Object -ComObject shell.application

function Set-FolderCustomization {
    param($folderPath, $label, $icon)
    if (-not (Test-Path $folderPath)) { return }
    
    $iniPath = Join-Path $folderPath "desktop.ini"
    
    # Remove existing attributes to overwrite
    if (Test-Path $iniPath) {
        Attrib -r -s -h $iniPath
    }

    $content = @"
[.ShellClassInfo]
IconResource=$icon,0
LocalizedResourceName=$label
"@
    Set-Content -Path $iniPath -Value $content -Encoding UTF8
    
    # Set attributes
    Attrib +r $folderPath # Folder must be read-only for desktop.ini to work
    Attrib +s +h $iniPath # desktop.ini must be system + hidden
}

if ($action -eq "pin") {
    if (Test-Path $path) {
        # Apply labels and icons
        Set-FolderCustomization -folderPath $path -label "ChatSys Drive" -icon $iconPath

        # Pin to Quick Access
        $folder = $shell.Namespace($path)
        $item = $folder.Self
        $item.InvokeVerb("pintohome")
        
        # Map drive S:
        if (-not (Test-Path "S:")) {
            subst S: "$path"
        }
    }
} elseif ($action -eq "unpin") {
    if (Test-Path "S:") {
        subst S: /D
    }
    if (Test-Path $path) {
        $iniPath = Join-Path $path "desktop.ini"
        if (Test-Path $iniPath) {
            # Attempt to safely unset desktop.ini modifications
            Attrib -r -s -h $iniPath
            Remove-Item -Path $iniPath -Force -ErrorAction SilentlyContinue
        }
    }
}
