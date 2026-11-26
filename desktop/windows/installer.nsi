Unicode True
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
!include "FileFunc.nsh"
Var Upgrade
Var Background
Var InstallMutex
Var Stage
Var Restored
Name "词匣"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\CiXia"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails show
ShowUninstDetails show
VIProductVersion "1.4.0.0"
VIAddVersionKey /LANG=2052 "ProductName" "词匣"
VIAddVersionKey /LANG=2052 "FileDescription" "词匣 Windows x64 安装程序"
VIAddVersionKey /LANG=2052 "FileVersion" "1.4.0"
VIAddVersionKey /LANG=2052 "ProductVersion" "1.4.0"
VIAddVersionKey /LANG=2052 "LegalCopyright" "词匣"
!define MUI_ICON "${ICONFILE}"
!define MUI_UNICON "${ICONFILE}"
!define MUI_WELCOMEPAGE_TEXT "安装词匣 Windows x64 版到当前用户。若设备缺少 WebView2，安装程序将通过微软官方引导程序联网安装运行时。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\CiXia.exe"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
!define UNREG "Software\Microsoft\Windows\CurrentVersion\Uninstall\CiXiaDesktop"
!define EDGE "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

!macro RequireClosed
    FindWindow $0 "CiXiaNativeService"
    ${If} $0 != 0
        MessageBox MB_OK|MB_ICONEXCLAMATION "请打开词匣设置，点击「退出词匣」，或通过系统托盘退出后重试。" /SD IDOK
        Abort
    ${EndIf}
!macroend
Function .onInit
    ${IfNot} ${RunningX64}
        MessageBox MB_OK|MB_ICONSTOP "此安装包需要 64 位 Windows。" /SD IDOK
        Abort
    ${EndIf}
    ${IfNot} ${AtLeastWin10}
        MessageBox MB_OK|MB_ICONSTOP "此版本需要 Windows 10 或 Windows 11。" /SD IDOK
        Abort
    ${EndIf}
    SetRegView 64
    ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
    ${If} $0 < 17763
        MessageBox MB_OK|MB_ICONSTOP "此版本需要 Windows 10 1809 或更高版本。" /SD IDOK
        Abort
    ${EndIf}
    ${GetParameters} $0
    ClearErrors
    ${GetOptions} $0 "/CIXIAUPGRADE" $1
    ${IfNot} ${Errors}
        StrCpy $Upgrade "yes"
        ClearErrors
        ${GetOptions} $0 "/CIXIABACKGROUND" $1
        ${IfNot} ${Errors}
            StrCpy $Background "--background"
        ${EndIf}
    ${EndIf}
    System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Local\CiXiaDesktopInstalling") p .r2 ?e'
    Pop $3
    ${If} $2 == 0
    ${OrIf} $3 == 183
        MessageBox MB_OK|MB_ICONSTOP "另一个词匣安装程序正在运行，请稍后重试。" /SD IDOK
        Abort
    ${EndIf}
    StrCpy $InstallMutex $2
    ${If} $Upgrade == "yes"
        ClearErrors
        ${GetOptions} $0 "/WAITPID=" $1
        ${If} ${Errors}
            Abort
        ${EndIf}
        System::Call 'kernel32::OpenProcess(i 0x100000, i 0, i r1) p .r2'
        ${If} $2 != 0
            System::Call 'kernel32::WaitForSingleObject(p r2, i 30000) i .r3'
            System::Call 'kernel32::CloseHandle(p r2)'
            ${If} $3 != 0
                MessageBox MB_OK|MB_ICONSTOP "词匣尚未退出，请关闭窗口后再试。" /SD IDOK
                Abort
            ${EndIf}
        ${EndIf}
    ${EndIf}
    !insertmacro RequireClosed
FunctionEnd
Function un.onInit
    !insertmacro RequireClosed
FunctionEnd
Function FinishUpgrade
    ${If} $InstallMutex != 0
        System::Call 'kernel32::CloseHandle(p $InstallMutex)'
        StrCpy $InstallMutex 0
    ${EndIf}
    ${If} $Upgrade == "yes"
        SetOutPath "$INSTDIR"
        Exec '"$INSTDIR\CiXia.exe" $Background'
    ${EndIf}
FunctionEnd
Function FailedUpgrade
    ${If} $InstallMutex == 0
        Return
    ${EndIf}
    ${If} $Upgrade == "yes"
        CreateDirectory "$LOCALAPPDATA\CiXia\Data"
        FileOpen $0 "$LOCALAPPDATA\CiXia\Data\update-failed.flag" w
        FileClose $0
    ${EndIf}
    Call FinishUpgrade
FunctionEnd
Function .onInstFailed
    Call FailedUpgrade
FunctionEnd
!macro Backup part
    IfFileExists "$INSTDIR\${part}" 0 +4
        ClearErrors
        Rename "$INSTDIR\${part}" "$Stage\backup\${part}"
        IfErrors backupFailed
!macroend
!macro InstallPart part
    ClearErrors
    Rename "$Stage\payload\${part}" "$INSTDIR\${part}"
    IfErrors installFailed
!macroend
!macro Restore part
    IfFileExists "$Stage\backup\${part}" 0 +5
        ClearErrors
        Rename "$Stage\backup\${part}" "$INSTDIR\${part}"
        IfErrors 0 +2
            StrCpy $Restored "no"
!macroend
Section
    SetShellVarContext current
    SetRegView 32
    ReadRegStr $0 HKLM "${EDGE}" "pv"
    ${If} $0 == ""
    ${OrIf} $0 == "0.0.0.0"
        ReadRegStr $0 HKCU "${EDGE}" "pv"
    ${EndIf}
    ${If} $0 == ""
    ${OrIf} $0 == "0.0.0.0"
        InitPluginsDir
        SetOutPath "$PLUGINSDIR"
        File "/oname=WebView2Setup.exe" "${BOOTSTRAP}"
        DetailPrint "正在安装 Microsoft Edge WebView2 Runtime…"
        ClearErrors
        ExecWait '"$PLUGINSDIR\WebView2Setup.exe" /silent /install' $1
        ${If} ${Errors}
        ${OrIf} $1 != 0
            MessageBox MB_OK|MB_ICONSTOP "WebView2 安装失败。请联网安装微软 WebView2 Evergreen Runtime，再重新运行本安装包。" /SD IDOK
            Call FailedUpgrade
            Abort
        ${EndIf}
    ${EndIf}
    SetRegView 64
    ; Stage and back up on the installation volume so renames stay on one filesystem.
    CreateDirectory "$INSTDIR"
    ClearErrors
    GetTempFileName $Stage "$INSTDIR"
    IfErrors stageFailed
    Delete "$Stage"
    SetOutPath "$Stage\payload"
    IfErrors stageFailed
    File /r "${STAGE}/*"
    IfErrors stageFailed
    WriteUninstaller "$Stage\payload\Uninstall.exe"
    IfErrors stageFailed
    CreateDirectory "$Stage\backup"
    IfErrors stageFailed
    SetOutPath "$INSTDIR"
    !insertmacro Backup "CiXia.exe"
    !insertmacro Backup "WebView2Loader.dll"
    !insertmacro Backup "www"
    !insertmacro Backup "licenses"
    !insertmacro Backup "Uninstall.exe"
    !insertmacro InstallPart "CiXia.exe"
    !insertmacro InstallPart "WebView2Loader.dll"
    !insertmacro InstallPart "www"
    !insertmacro InstallPart "licenses"
    !insertmacro InstallPart "Uninstall.exe"
    RMDir /r "$Stage"
    CreateDirectory "$SMPROGRAMS\词匣"
    CreateShortcut "$SMPROGRAMS\词匣\词匣.lnk" "$INSTDIR\CiXia.exe"
    WriteRegStr HKCU "${UNREG}" "DisplayName" "词匣"
    WriteRegStr HKCU "${UNREG}" "DisplayVersion" "1.4.0"
    WriteRegStr HKCU "${UNREG}" "DisplayIcon" "$INSTDIR\CiXia.exe"
    WriteRegStr HKCU "${UNREG}" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "${UNREG}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
    WriteRegDWORD HKCU "${UNREG}" "NoModify" 1
    WriteRegDWORD HKCU "${UNREG}" "NoRepair" 1
    Call FinishUpgrade
    Goto finished
installFailed:
    Delete "$INSTDIR\CiXia.exe"
    Delete "$INSTDIR\WebView2Loader.dll"
    RMDir /r "$INSTDIR\www"
    RMDir /r "$INSTDIR\licenses"
    Delete "$INSTDIR\Uninstall.exe"
backupFailed:
    StrCpy $Restored "yes"
    !insertmacro Restore "CiXia.exe"
    !insertmacro Restore "WebView2Loader.dll"
    !insertmacro Restore "www"
    !insertmacro Restore "licenses"
    !insertmacro Restore "Uninstall.exe"
    ${If} $Restored == "yes"
        RMDir /r "$Stage"
    ${Else}
        MessageBox MB_OK|MB_ICONSTOP "部分程序文件正在被占用。备份保存在 $Stage\backup。" /SD IDOK
    ${EndIf}
    Call FailedUpgrade
    Abort "未能完成更新。请关闭占用安装目录的程序后重试。"
stageFailed:
    SetOutPath "$INSTDIR"
    ${If} $Stage != ""
        RMDir /r "$Stage"
    ${EndIf}
    Call FailedUpgrade
    Abort "准备安装文件失败，请检查剩余磁盘空间。"
finished:
SectionEnd
Section "Uninstall"
    SetRegView 64
    SetShellVarContext current
    Delete "$SMPROGRAMS\词匣\词匣.lnk"
    RMDir "$SMPROGRAMS\词匣"
    DeleteRegKey HKCU "${UNREG}"
    Delete "$INSTDIR\CiXia.exe"
    Delete "$INSTDIR\WebView2Loader.dll"
    Delete "$INSTDIR\Uninstall.exe"
    RMDir /r "$INSTDIR\www"
    RMDir /r "$INSTDIR\licenses"
    RMDir "$INSTDIR"
SectionEnd
