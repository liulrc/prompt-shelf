Unicode True
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
Name "词匣"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\CiXia"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails show
ShowUninstDetails show
VIProductVersion "1.1.0.0"
VIAddVersionKey /LANG=2052 "ProductName" "词匣"
VIAddVersionKey /LANG=2052 "FileDescription" "词匣 Windows x64 安装程序"
VIAddVersionKey /LANG=2052 "FileVersion" "1.1.0"
VIAddVersionKey /LANG=2052 "ProductVersion" "1.1.0"
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
        MessageBox MB_OK|MB_ICONEXCLAMATION "请从系统托盘退出词匣后重试。" /SD IDOK
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
    !insertmacro RequireClosed
FunctionEnd
Function un.onInit
    !insertmacro RequireClosed
FunctionEnd
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
            Abort
        ${EndIf}
    ${EndIf}
    SetRegView 64
    SetOutPath "$INSTDIR"
    File /r "${STAGE}/*"
    WriteUninstaller "$INSTDIR\Uninstall.exe"
    CreateDirectory "$SMPROGRAMS\词匣"
    CreateShortcut "$SMPROGRAMS\词匣\词匣.lnk" "$INSTDIR\CiXia.exe"
    WriteRegStr HKCU "${UNREG}" "DisplayName" "词匣"
    WriteRegStr HKCU "${UNREG}" "DisplayVersion" "1.1.0"
    WriteRegStr HKCU "${UNREG}" "DisplayIcon" "$INSTDIR\CiXia.exe"
    WriteRegStr HKCU "${UNREG}" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "${UNREG}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
    WriteRegDWORD HKCU "${UNREG}" "NoModify" 1
    WriteRegDWORD HKCU "${UNREG}" "NoRepair" 1
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
