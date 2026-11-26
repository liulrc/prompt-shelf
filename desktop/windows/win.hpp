#pragma once
#ifndef UNICODE
#define UNICODE
#endif
#define _UNICODE
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#define _WIN32_WINNT 0x0A00
#include <windows.h>
#include <windowsx.h>
#include <objidl.h>
#include <shlobj.h>
#include <shellapi.h>
#include <commdlg.h>
#include <wincrypt.h>
#include <gdiplus.h>
#include <filesystem>
#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <functional>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>
#include "json.hpp"

namespace fs = std::filesystem;
using Json = nlohmann::json;
using Bytes = std::vector<uint8_t>;
using std::string;
using std::wstring;

inline wstring wide(const string &s) {
    if (s.empty())
        return {};
    int n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, s.data(), (int)s.size(), nullptr, 0);
    if (!n)
        throw std::runtime_error("文字编码无效。");
    wstring w(n, 0);
    MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), w.data(), n);
    return w;
}
inline string utf(const wstring &w) {
    if (w.empty())
        return {};
    int n = WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), nullptr, 0, nullptr, nullptr);
    string s(n, 0);
    WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), s.data(), n, nullptr, nullptr);
    return s;
}
inline string to64(const Bytes &data) {
    if (data.empty())
        return {};
    DWORD n = 0;
    CryptBinaryToStringA(data.data(), (DWORD)data.size(), CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF,
                         nullptr, &n);
    string out(n, 0);
    if (!CryptBinaryToStringA(data.data(), (DWORD)data.size(), CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF,
                              out.data(), &n))
        throw std::runtime_error("编码失败。");
    out.resize(n);
    return out;
}
inline Bytes from64(const string &s) {
    DWORD n = 0;
    if (!CryptStringToBinaryA(s.data(), (DWORD)s.size(), CRYPT_STRING_BASE64, nullptr, &n, nullptr,
                              nullptr))
        throw std::runtime_error("文件数据无效。");
    Bytes b(n);
    if (!CryptStringToBinaryA(s.data(), (DWORD)s.size(), CRYPT_STRING_BASE64, b.data(), &n, nullptr,
                              nullptr))
        throw std::runtime_error("文件数据无效。");
    return b;
}
inline Bytes readBytes(const fs::path &path) {
    std::ifstream f(path, std::ios::binary | std::ios::ate);
    if (!f)
        throw std::runtime_error("无法打开文件。");
    auto n = f.tellg();
    if (n < 0 || (uint64_t)n > UINT32_MAX)
        throw std::runtime_error("文件过大，无法载入预览。");
    Bytes b((size_t)n);
    f.seekg(0);
    if (n && !f.read((char *)b.data(), n))
        throw std::runtime_error("文件读取失败。");
    return b;
}
inline void writeBytes(const fs::path &p, const Bytes &data) {
    std::ofstream f(p, std::ios::binary | std::ios::trunc);
    f.write((const char *)data.data(), data.size());
    f.close();
    if (!f)
        throw std::runtime_error("写入文件失败，请检查磁盘空间。");
}
inline void writeJson(const fs::path &p, const Json &j) {
    fs::path tmp = p;
    tmp += L".tmp";
    auto s = j.dump(-1, ' ', false, Json::error_handler_t::replace);
    {
        std::ofstream f(tmp, std::ios::binary | std::ios::trunc);
        f.write(s.data(), s.size());
        f.close();
        if (!f)
            throw std::runtime_error("保存本地记录失败。");
    }
    if (!MoveFileExW(tmp.c_str(), p.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH))
        throw std::runtime_error("更新本地记录失败。");
}
inline string genId() {
    GUID id{};
    if (FAILED(CoCreateGuid(&id)))
        throw std::runtime_error("无法创建唯一标识。");
    wchar_t s[40]{};
    StringFromGUID2(id, s, 40);
    wstring w(s);
    return utf(w.substr(1, w.size() - 2));
}
inline string nowIso() {
    SYSTEMTIME t;
    GetSystemTime(&t);
    char b[32];
    snprintf(b, sizeof(b), "%04u-%02u-%02uT%02u:%02u:%02u.%03uZ", t.wYear, t.wMonth, t.wDay, t.wHour,
             t.wMinute, t.wSecond, t.wMilliseconds);
    return b;
}
inline fs::path exeDir() {
    wchar_t b[32768];
    DWORD n = GetModuleFileNameW(nullptr, b, 32768);
    return fs::path(wstring(b, n)).parent_path();
}
inline fs::path localDir() {
    PWSTR p = nullptr;
    if (FAILED(SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, nullptr, &p)))
        throw std::runtime_error("无法定位本机数据目录。");
    fs::path dir = fs::path(p) / L"CiXia" / L"Data";
    CoTaskMemFree(p);
    fs::create_directories(dir);
    return dir;
}
inline string appName(HWND hwnd) {
    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    HANDLE p = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!p)
        return "系统剪贴板";
    wchar_t b[32768];
    DWORD n = 32768;
    bool ok = QueryFullProcessImageNameW(p, 0, b, &n);
    CloseHandle(p);
    return ok ? utf(fs::path(wstring(b, n)).stem().wstring()) : "系统剪贴板";
}
inline void require(bool ok, const char *message) {
    if (!ok)
        throw std::runtime_error(message);
}
struct Frame {
    int w = 0, h = 0;
    Bytes px;
};
inline const CLSID pngEncoder = {
    0x557cf406, 0x1a04, 0x11d3, {0x9a, 0x73, 0x00, 0x00, 0xf8, 0x1e, 0xf3, 0x2e}};
inline Bytes encodeImage(Gdiplus::Image &image) {
    IStream *s = nullptr;
    require(SUCCEEDED(CreateStreamOnHGlobal(nullptr, TRUE, &s)), "图片编码失败。");
    auto stream = std::unique_ptr<IStream, void (*)(IStream *)>(s, [](IStream *p) { p->Release(); });
    require(image.Save(s, &pngEncoder, nullptr) == Gdiplus::Ok, "图片编码失败。");
    STATSTG stats{};
    require(SUCCEEDED(s->Stat(&stats, STATFLAG_NONAME)) && !stats.cbSize.HighPart, "图片编码失败。");
    HGLOBAL h = nullptr;
    GetHGlobalFromStream(s, &h);
    const uint8_t *p = (uint8_t *)GlobalLock(h);
    require(p, "无法读取图片。");
    Bytes b(p, p + stats.cbSize.LowPart);
    GlobalUnlock(h);
    return b;
}
inline Bytes encodeFrame(Frame &f) {
    Gdiplus::Bitmap image(f.w, f.h, f.w * 4, PixelFormat32bppRGB, f.px.data());
    return encodeImage(image);
}
inline Frame frameOf(Gdiplus::Bitmap &image) {
    UINT w = image.GetWidth(), h = image.GetHeight();
    require(image.GetLastStatus() == Gdiplus::Ok && w && h && (uint64_t)w * h <= 120000000,
            "此图片格式无法预览，或像素尺寸过大。");
    Gdiplus::BitmapData bits;
    Gdiplus::Rect r(0, 0, w, h);
    require(image.LockBits(&r, Gdiplus::ImageLockModeRead, PixelFormat32bppARGB, &bits) == Gdiplus::Ok,
            "无法读取图片像素。");
    Frame frame{(int)w, (int)h, Bytes((size_t)w * h * 4)};
    for (size_t y = 0; y < h; y++)
        memcpy(&frame.px[y * w * 4], (uint8_t *)bits.Scan0 + (ptrdiff_t)y * bits.Stride, w * 4);
    image.UnlockBits(&bits);
    return frame;
}
inline Frame decodeImage(const fs::path &path) {
    Gdiplus::Bitmap image(path.c_str());
    return frameOf(image);
}
inline Frame decodePng(const Bytes &bytes) {
    require(!bytes.empty() && bytes.size() <= UINT_MAX, "PNG 内容为空或过大。");
    IStream *s = nullptr;
    require(SUCCEEDED(CreateStreamOnHGlobal(nullptr, TRUE, &s)), "无法读取 PNG。");
    auto owner = std::unique_ptr<IStream, void (*)(IStream *)>(s, [](IStream *p) { p->Release(); });
    ULONG written = 0;
    require(SUCCEEDED(s->Write(bytes.data(), (ULONG)bytes.size(), &written)) && written == bytes.size(),
            "无法读取 PNG。");
    LARGE_INTEGER zero{};
    require(SUCCEEDED(s->Seek(zero, STREAM_SEEK_SET, nullptr)), "无法读取 PNG。");
    Gdiplus::Bitmap image(s);
    return frameOf(image);
}
inline BITMAPINFO frameInfo(int w, int h) {
    BITMAPINFO b{};
    b.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    b.bmiHeader.biWidth = w;
    b.bmiHeader.biHeight = -h;
    b.bmiHeader.biPlanes = 1;
    b.bmiHeader.biBitCount = 32;
    b.bmiHeader.biCompression = BI_RGB;
    return b;
}
inline void drawFrame(HDC dc, const Frame &f, RECT target, RECT source) {
    auto b = frameInfo(f.w, f.h);
    SetStretchBltMode(dc, HALFTONE);
    StretchDIBits(dc, target.left, target.top, target.right - target.left, target.bottom - target.top,
                  source.left, f.h - source.bottom, source.right - source.left, source.bottom - source.top,
                  f.px.data(), &b, DIB_RGB_COLORS, SRCCOPY);
}
inline Frame captureRect(RECT r) {
    int w = r.right - r.left, h = r.bottom - r.top;
    require(w > 0 && h > 0 && (uint64_t)w * h <= 120000000, "屏幕选区尺寸无效。");
    Frame f{w, h, Bytes((size_t)w * h * 4)};
    HDC desk = GetDC(nullptr), mem = CreateCompatibleDC(desk);
    auto info = frameInfo(w, h);
    void *bits = nullptr;
    HBITMAP bitmap = CreateDIBSection(desk, &info, DIB_RGB_COLORS, &bits, nullptr, 0);
    HGDIOBJ old = bitmap ? SelectObject(mem, bitmap) : nullptr;
    bool ok = bitmap && BitBlt(mem, 0, 0, w, h, desk, r.left, r.top, SRCCOPY | CAPTUREBLT);
    if (ok) {
        GdiFlush();
        memcpy(f.px.data(), bits, f.px.size());
    }
    if (old)
        SelectObject(mem, old);
    if (bitmap)
        DeleteObject(bitmap);
    DeleteDC(mem);
    ReleaseDC(nullptr, desk);
    require(ok, "屏幕读取失败。");
    return f;
}
inline RECT wholeScreen() {
    int x = GetSystemMetrics(SM_XVIRTUALSCREEN), y = GetSystemMetrics(SM_YVIRTUALSCREEN);
    return {x, y, x + GetSystemMetrics(SM_CXVIRTUALSCREEN), y + GetSystemMetrics(SM_CYVIRTUALSCREEN)};
}
