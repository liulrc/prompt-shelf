$ErrorActionPreference = 'Stop'
if (-not $IsWindows -or $env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP) {
    throw 'Run on a disposable Windows GitHub Actions runner. The test exercises current-user installation and starts the desktop app.'
}
$work = Join-Path $env:RUNNER_TEMP ('CiXia upgrade ' + [guid]::NewGuid().ToString('n'))
$app = Join-Path $work 'App with spaces'
$data = Join-Path $env:LOCALAPPDATA 'CiXia/Data'
$reg = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CiXiaDesktop'
if ((Test-Path $data) -or (Test-Path $reg) -or (Get-Process CiXia -ErrorAction Ignore)) { throw 'Existing installation found in runner profile.' }
$old = (Resolve-Path 'dist/CiXia-1.3.0-Windows-x64-Setup.exe').Path
$new = (Resolve-Path 'dist/CiXia-1.4.0-Windows-x64-Setup.exe').Path
$bin = Join-Path $app 'CiXia.exe'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-address=127.0.0.1 --remote-debugging-port=9246'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class CiXiaWindowsTest {
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string name, string caption);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint process);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint message, IntPtr w, IntPtr l);
}
'@
function Finish-Process([Diagnostics.Process]$Process, [int]$seconds = 60) {
    if (-not $Process.WaitForExit($seconds * 1000)) { throw "Process timed out: $($Process.Id) $($Process.ProcessName)" }
    return $Process.ExitCode
}
function Get-AppService {
    for ($i = 0; $i -lt 100; $i++) {
        $h = [CiXiaWindowsTest]::FindWindow('CiXiaNativeService', $null)
        if ($h -ne [IntPtr]::Zero) {
            [uint32]$processId = 0
            [void][CiXiaWindowsTest]::GetWindowThreadProcessId($h, [ref]$processId)
            $p = Get-Process -Id $processId
            if ($p.Path -ne $bin) { throw 'Unexpected service executable path' }
            return $p
        }
        Start-Sleep -Milliseconds 250
    }
    throw 'Application service did not appear'
}
function Stop-AppService {
    $p = Get-AppService
    $h = [CiXiaWindowsTest]::FindWindow('CiXiaNativeService', $null)
    [void][CiXiaWindowsTest]::PostMessage($h, 0x10, [IntPtr]::Zero, [IntPtr]::Zero)
    if ((Finish-Process $p) -ne 0) { throw 'The application did not exit cleanly' }
}
function Confirm-Version([string]$version) {
    $registered = (Get-ItemProperty -Path $reg).DisplayVersion
    $file = (Get-Item $bin).VersionInfo.FileVersion
    if ($registered -ne $version -or $file -ne $version) { throw "Version mismatch: registry $registered, binary $file" }
}
function Start-Setup([string]$file, [string]$flags) {
    Start-Process -FilePath $file -PassThru -ArgumentList "/S $flags /D=$app"
}
New-Item -Type Directory -Path $work, $data | Out-Null
$marker = Join-Path $data 'upgrade-fixture.txt'
Set-Content -Path $marker -Value 'preserve-user-data' -NoNewline
$settings = Join-Path $data 'settings.json'
Set-Content -Path $settings -Value '{"monitoring":false,"showTrayIcon":true,"hotkeys":{"capture":"Ctrl+Alt+F9","shelf":"Ctrl+Alt+F10","pin":"Ctrl+Alt+F11","templates":"Ctrl+Alt+F12"}}' -NoNewline
$settingsHash = (Get-FileHash $settings).Hash
try {
    if ((Finish-Process (Start-Setup $old '') 180) -ne 0) { throw '1.3 install failed' }
    Confirm-Version '1.3.0'
    $oldHash = (Get-FileHash $bin).Hash
    $dll = Join-Path $app 'WebView2Loader.dll'
    $lock = [IO.File]::Open($dll, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        $short = Start-Process "$env:SystemRoot/System32/ping.exe" -ArgumentList '-n 2 127.0.0.1' -WindowStyle Hidden -PassThru
        $failed = Start-Setup $new "/CIXIAUPGRADE /CIXIABACKGROUND /WAITPID=$($short.Id)"
        if ((Finish-Process $failed) -eq 0) { throw 'File-locked installation unexpectedly succeeded' }
        Confirm-Version '1.3.0'
        if ((Get-FileHash $bin).Hash -ne $oldHash) { throw 'Executable did not roll back' }
    } finally { $lock.Dispose() }
    $oldProcess = Get-AppService
    Write-Host "File lock triggered rollback, restored the 1.3.0 binary and relaunched the old application ($($oldProcess.Id))."
    $next = Start-Setup $new "/CIXIAUPGRADE /CIXIABACKGROUND /WAITPID=$($oldProcess.Id)"
    Start-Sleep -Seconds 2
    if ($next.HasExited) { throw 'Installer did not wait for the application' }
    Stop-AppService
    if ((Finish-Process $next) -ne 0) { throw '1.4 upgrade failed' }
    Confirm-Version '1.4.0'
    $service = Get-AppService
    if ($service.Id -eq $oldProcess.Id) { throw 'Application was not relaunched' }
    if ((Get-Content $marker -Raw) -ne 'preserve-user-data' -or (Get-FileHash $settings).Hash -ne $settingsHash) {
        throw 'Upgrade altered saved user data or shortcut settings'
    }
    Write-Host "Completed 1.3.0 -> 1.4.0 install, waited for the application, relaunched process $($service.Id), preserved user settings."
    # Opening the running background instance uses the normal single-instance route.
    Start-Process -FilePath $bin
    node tests/windows/update-settings.mjs
    if ($LASTEXITCODE) { throw 'Settings WebView/Win32 bridge regression' }
} finally {
    if ([CiXiaWindowsTest]::FindWindow('CiXiaNativeService',$null) -ne [IntPtr]::Zero) { Stop-AppService }
}
