if ($args.Count -eq 0) {
    Start-Process "$PSScriptRoot\ChatSys.exe"
} else {
    $env:ELECTRON_RUN_AS_NODE = 1
    # For installed version, ChatSys.exe handles --cli
    if (Test-Path "$PSScriptRoot\ChatSys.exe") {
        & "$PSScriptRoot\ChatSys.exe" --cli @args
    } else {
        # Fallback for development mode
        & "electron" "$PSScriptRoot\src\credsync\cli.js" @args
    }
}
