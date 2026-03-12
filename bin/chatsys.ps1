$firstArg = $args[0]
$appRoot = Resolve-Path "$PSScriptRoot\.."
$exeName = "ChatSys.exe"

if ($firstArg -eq "gui") {
    $env:ELECTRON_RUN_AS_NODE = $null
    if (Test-Path "$appRoot\$exeName") {
        Start-Process "$appRoot\$exeName"
    } else {
        Start-Process "$appRoot\node_modules\.bin\electron.ps1" "." -WorkingDirectory $appRoot
    }
} else {
    $env:ELECTRON_RUN_AS_NODE = 1
    if (Test-Path "$appRoot\$exeName") {
        & "$appRoot\$exeName" "$appRoot\resources\app.asar\src\credsync\cli.js" @args
    } else {
        & "$appRoot\node_modules\.bin\electron.ps1" "$appRoot\src\credsync\cli.js" @args
    }
}
