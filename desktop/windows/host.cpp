#include "archive.hpp"
#include "panel.hpp"
#include "shelf.hpp"
#include <set>
#include <sstream>
#include <cwctype>

static const std::array<string, 4> actions = {"capture", "shelf", "pin", "templates"};
static const Json defaults = {
    {"hotkeys", {{"capture", "Alt+A"}, {"shelf", "Alt+Q"}, {"pin", "Alt+Z"}, {"templates", "Alt+X"}}},
    {"monitoring", true}};
static std::pair<UINT, UINT> chord(const string &value) {
    std::istringstream parts(value);
    string part;
    UINT mod = 0, key = 0;
    while (std::getline(parts, part, '+')) {
        if (part == "Ctrl")
            mod |= MOD_CONTROL;
        else if (part == "Alt")
            mod |= MOD_ALT;
        else if (part == "Shift")
            mod |= MOD_SHIFT;
        else if (key)
            throw std::runtime_error("快捷键只允许一个主键。");
        else if (part.size() == 1 &&
                 ((part[0] >= 'A' && part[0] <= 'Z') || (part[0] >= '0' && part[0] <= '9')))
            key = part[0];
        else if (part.size() <= 3 && part.rfind("F", 0) == 0 && part.size() > 1 &&
                 part.substr(1).find_first_not_of("0123456789") == string::npos &&
                 std::stoi(part.substr(1)) >= 1 && std::stoi(part.substr(1)) <= 12)
            key = VK_F1 + std::stoi(part.substr(1)) - 1;
        else
            throw std::runtime_error("无法识别此快捷键组合。");
    }
    require(bool(mod && key), "请选择修饰键和主键。");
    return {mod, key};
}
class Application {
    using Chord = std::pair<UINT, UINT>;
    fs::path home = localDir(), resources = exeDir() / L"www";
    Archive archive{home};
    Capture capture;
    NativeShelf shelf{archive, [this](const string &id) {
                          archive.writeToClipboard(root, id);
                          lastSeq = GetClipboardSequenceNumber();
                      }};
    Json settings = defaults;
    std::map<string, std::shared_ptr<Panel>> panels;
    std::map<Chord, int> registered;
    std::map<int, string> assigned;
    int nextKey = 50, tries = 0;
    DWORD lastSeq = 0;
    bool listening = false, exiting = false, queuedCapture = false, wantLong = false, wantAuto = false;
    std::vector<std::weak_ptr<Panel>> hidden;
    NOTIFYICONDATAW tray{sizeof(tray)};
    UINT restart = RegisterWindowMessageW(L"TaskbarCreated");
    static constexpr UINT trayEvent = WM_APP + 2;
    HWND root = nullptr;
    void notify(const string &message) {
        tray.uFlags = NIF_INFO;
        wcscpy_s(tray.szInfoTitle, L"词匣");
        wcsncpy_s(tray.szInfo, wide(message).c_str(), _TRUNCATE);
        tray.dwInfoFlags = NIIF_INFO;
        Shell_NotifyIconW(NIM_MODIFY, &tray);
    }
    void addTray() {
        tray.hWnd = root;
        tray.uID = 1;
        tray.uCallbackMessage = trayEvent;
        tray.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
        tray.hIcon = LoadIconW(instance(), MAKEINTRESOURCEW(1));
        if (!tray.hIcon)
            tray.hIcon = LoadIconW(nullptr, IDI_APPLICATION);
        wcscpy_s(tray.szTip, L"词匣 · 提示词与剪贴板");
        Shell_NotifyIconW(NIM_ADD, &tray);
    }
    void setListening(bool enabled) {
        if (enabled == listening)
            return;
        if (enabled) {
            require(AddClipboardFormatListener(root), "无法订阅系统剪贴板更新。");
            lastSeq = GetClipboardSequenceNumber();
        } else {
            RemoveClipboardFormatListener(root);
            KillTimer(root, 1);
        }
        listening = enabled;
    }
    void apply(const Json &value, bool startup = false) {
        Json selected = value.value("hotkeys", settings.at("hotkeys"));
        bool enabled = value.value("monitoring", settings.value("monitoring", true));
        std::map<Chord, string> wanted;
        std::map<Chord, int> staged;
        std::map<int, string> active;
        for (auto &a : actions) {
            string binding = selected.at(a);
            auto key = chord(binding);
            require(!wanted.count(key), "不同操作不能使用同一快捷键。");
            wanted[key] = a;
        }
        const bool oldMonitoring = listening;
        std::vector<string> conflicts;
        try {
            for (auto &[key, a] : wanted) {
                int id = 0;
                if (registered.count(key))
                    id = registered.at(key);
                else {
                    id = nextKey++;
                    if (nextKey > 0xBFFF)
                        nextKey = 50;
                    while (assigned.count(id))
                        id = nextKey++;
                    if (!RegisterHotKey(root, id, key.first | MOD_NOREPEAT, key.second)) {
                        auto text = selected.at(a).get<string>();
                        if (startup) {
                            conflicts.push_back(text);
                            continue;
                        }
                        throw std::runtime_error("快捷键 " + text + " 已被系统或其他应用占用。");
                    }
                    staged[key] = id;
                }
                active[id] = a;
            }
            setListening(enabled);
            Json updated = {{"hotkeys", selected}, {"monitoring", enabled}};
            if (!startup)
                writeJson(home / L"settings.json", updated);
            settings = updated;
        } catch (...) {
            for (auto &[key, id] : staged)
                UnregisterHotKey(root, id);
            setListening(oldMonitoring);
            throw;
        }
        for (auto it = registered.begin(); it != registered.end();) {
            if (!wanted.count(it->first)) {
                UnregisterHotKey(root, it->second);
                it = registered.erase(it);
            } else
                ++it;
        }
        registered.insert(staged.begin(), staged.end());
        assigned = active;
        if (!conflicts.empty()) {
            string text = "下列快捷键已被占用，请在设置中更换：";
            for (auto &s : conflicts)
                text += " " + s;
            settings["hotkeyIssue"] = text;
            notify(text);
            open("settings");
        }
    }
    void changed() {
        shelf.refresh();
        for (auto &[k, p] : panels)
            p->post({{"event", "history.changed"}, {"data", Json::object()}});
    }
    std::shared_ptr<Panel> open(string area) {
        if (area == "shelf") {
            shelf.show();
            return nullptr;
        }
        string kind = area == "settings" ? area : "main";
        auto p = panels[kind];
        if (!p) {
            p = std::make_shared<Panel>(
                kind, resources, home, archive.mediaDir(),
                [this](const wstring &u) { return archive.externalResource(u); },
                [this](Panel &p, const Json &m) { message(p, m); },
                [this, kind](HWND) { panels.erase(kind); });
            panels[kind] = p;
        }
        p->show();
        if (kind == "main" && area != "main")
            p->post({{"event", "route"}, {"data", {{"area", area}}}});
        return p;
    }
    void save(Panel &panel, const Json &p) {
        wstring base = fs::path(wide(p.value("filename", "capture.png"))).filename().wstring();
        wchar_t path[32768]{};
        wcsncpy_s(path, base.c_str(), _TRUNCATE);
        OPENFILENAMEW picker{sizeof(picker)};
        picker.hwndOwner = panel.hwnd;
        picker.lpstrTitle = L"导出到文件";
        picker.lpstrFile = path;
        picker.nMaxFile = 32768;
        picker.lpstrFilter = L"所有文件\0*.*\0\0";
        picker.Flags = OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;
        if (!GetSaveFileNameW(&picker)) {
            throw std::runtime_error(CommDlgExtendedError() ? "无法打开保存对话框。" : "已取消导出。");
        }
        fs::path dest = path, temp = dest.parent_path() / wide("." + genId() + ".tmp");
        try {
            if (p.contains("id"))
                archive.exportFile(p.at("id"), temp);
            else
                writeBytes(temp, from64(p.at("data")));
            require(
                MoveFileExW(temp.c_str(), dest.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH),
                "文件写入失败。");
        } catch (...) {
            std::error_code ec;
            fs::remove(temp, ec);
            throw;
        }
    }
    void requestCapture(bool isLong, bool automatic) {
        require(!queuedCapture && !capture.active(), "已有截图正在进行。");
        shelf.dismiss(true);
        queuedCapture = true;
        wantLong = isLong;
        wantAuto = automatic;
        hidden.clear();
        for (auto &[k, p] : panels)
            if (p->hwnd && IsWindowVisible(p->hwnd)) {
                hidden.push_back(p);
                ShowWindow(p->hwnd, SW_HIDE);
            }
        SetTimer(root, 2, 180, nullptr);
    }
    void restore() {
        for (auto &weak : hidden)
            if (auto p = weak.lock())
                if (p->hwnd)
                    ShowWindow(p->hwnd, SW_SHOWNOACTIVATE);
        hidden.clear();
    }
    void makeCapture() {
        queuedCapture = false;
        DwmFlush();
        try {
            capture.start(
                wantLong, wantAuto,
                [this](Frame &&f) {
                    try {
                        Bytes png = encodeFrame(f);
                        string title = wantLong ? "滚动长截图" : "屏幕截图";
                        auto result = archive.binary(&png, nullptr, "image", "image/png", title + ".png",
                                                     title, "截图工具");
                        try {
                            archive.writeToClipboard(root, result["id"]);
                            lastSeq = GetClipboardSequenceNumber();
                        } catch (...) {
                            notify("截图已归档，但系统剪贴板暂时不可写。");
                        }
                        restore();
                        changed();
                        auto p = open("capture");
                        p->post({{"event", "capture.ready"},
                                 {"data",
                                  {{"id", result["id"]},
                                   {"title", title},
                                   {"mime", "image/png"},
                                   {"data", to64(png)},
                                   {"frameHeight", capture.frameHeight()}}}});
                    } catch (const std::exception &e) {
                        restore();
                        notify(e.what());
                    }
                },
                [this]() { restore(); });
        } catch (...) {
            restore();
            throw;
        }
    }
    void readChange() {
        KillTimer(root, 1);
        if (!listening)
            return;
        DWORD seq = GetClipboardSequenceNumber();
        if (seq == lastSeq)
            return;
        if (GetOpenClipboardWindow() && tries < 9) {
            tries++;
            SetTimer(root, 1, 55, nullptr);
            return;
        }
        try {
            // Applications can explicitly opt sensitive formats out of system history.
            if (IsClipboardFormatAvailable(
                    RegisterClipboardFormatW(L"ExcludeClipboardContentFromMonitorProcessing"))) {
                lastSeq = seq;
                return;
            }
            UINT opt = RegisterClipboardFormatW(L"CanIncludeInClipboardHistory");
            if (IsClipboardFormatAvailable(opt)) {
                ClipboardGuard guard(root);
                HGLOBAL block = GetClipboardData(opt);
                if (block && GlobalSize(block) >= sizeof(DWORD)) {
                    auto data = (DWORD *)GlobalLock(block);
                    bool skip = data && !*data;
                    if (data)
                        GlobalUnlock(block);
                    if (skip) {
                        lastSeq = seq;
                        return;
                    }
                }
            }
            archive.readClipboard(root);
            lastSeq = seq;
            changed();
        } catch (const std::exception &e) {
            string why = e.what();
            if (why.find("占用") != string::npos && tries++ < 9)
                SetTimer(root, 1, 55, nullptr);
            else {
                lastSeq = seq;
                if (why.find("没有支持") == string::npos)
                    notify(why);
            }
        }
    }
    void message(Panel &p, const Json &m) {
        if (!m.contains("id") || !m.contains("command"))
            return;
        Json id = m["id"], result = nullptr;
        bool close = false;
        try {
            string cmd = m.at("command");
            Json v = m.value("payload", Json::object());
            if (cmd == "settings.get")
                result = settings;
            else if (cmd == "settings.set") {
                apply(v);
                result = settings;
                for (auto &[name, panel] : panels)
                    panel->post({{"event", "settings.changed"}, {"data", settings}});
            } else if (cmd == "history.list")
                result = archive.list();
            else if (cmd == "history.detail")
                result = archive.details(v.at("id"));
            else if (cmd == "history.remove") {
                archive.remove(v.at("id"));
                changed();
            } else if (cmd == "history.add") {
                result = archive.fromPayload(v);
                changed();
            } else if (cmd == "history.copy") {
                archive.writeToClipboard(root, v.at("id"));
                lastSeq = GetClipboardSequenceNumber();
            } else if (cmd == "clipboard.write") {
                require(v.value("type", "text") == "text", "只接受文本。");
                auto content = v.at("text").get<string>();
                auto w = wide(content);
                {
                    ClipboardGuard g(root);
                    require(EmptyClipboard(), "系统剪贴板写入失败。");
                    setClipboardBytes(CF_UNICODETEXT, w.c_str(), (w.size() + 1) * sizeof(wchar_t));
                }
                lastSeq = GetClipboardSequenceNumber();
                result = archive.text(content, v.value("title", ""), v.value("source", "词匣"));
                changed();
            } else if (cmd == "clipboard.read") {
                result = archive.readClipboard(root);
                lastSeq = GetClipboardSequenceNumber();
                changed();
            } else if (cmd == "capture.start")
                requestCapture(v.value("long", false), v.value("automatic", true));
            else if (cmd == "capture.pin") {
                if (v.contains("data")) {
                    auto tmp = home / wide(genId() + ".png");
                    try {
                        writeBytes(tmp, from64(v.at("data")));
                        auto f = decodeImage(tmp);
                        fs::remove(tmp);
                        pinImage(std::move(f));
                    } catch (...) {
                        std::error_code ec;
                        fs::remove(tmp, ec);
                        throw;
                    }
                } else
                    pinImage(archive.pinFrame(v.value("id", "")));
            } else if (cmd == "file.save")
                save(p, v);
            else if (cmd == "window.open") {
                string area = v.value("area", "main");
                require(area == "main" || area == "settings" || area == "shelf" || area == "personal" ||
                            area == "clipboard" || area == "capture" || area == "builtin",
                        "窗口不存在。");
                open(area);
            } else if (cmd == "window.close")
                close = true;
            else
                throw std::runtime_error("未知的桌面操作。");
            p.post({{"id", id}, {"result", result}});
            if (close)
                PostMessageW(p.hwnd, WM_CLOSE, 0, 0);
        } catch (const std::exception &e) {
            p.post({{"id", id}, {"error", e.what()}});
        }
    }
    void menu() {
        HWND returnTo = GetForegroundWindow();
        HMENU m = CreatePopupMenu();
        AppendMenuW(m, MF_STRING, 10, L"打开词匣");
        AppendMenuW(m, MF_STRING, 11, L"剪贴板历史");
        AppendMenuW(m, MF_STRING, 12, L"截取屏幕");
        AppendMenuW(m, MF_STRING, 13, L"滚动长截图");
        AppendMenuW(m, MF_STRING, 14, L"置顶最近截图");
        AppendMenuW(m, MF_STRING, 15, L"设置");
        AppendMenuW(m, MF_SEPARATOR, 0, nullptr);
        AppendMenuW(m, MF_STRING, 16, L"退出词匣");
        POINT pt;
        GetCursorPos(&pt);
        SetForegroundWindow(root);
        UINT n = TrackPopupMenu(m, TPM_RETURNCMD | TPM_RIGHTBUTTON, pt.x, pt.y, 0, root, nullptr);
        DestroyMenu(m);
        PostMessageW(root, WM_NULL, 0, 0);
        if (n == 10)
            open("main");
        if (n == 11)
            shelf.show(returnTo);
        if (n == 12 || n == 13)
            requestCapture(n == 13, n == 13);
        if (n == 14)
            pinImage(archive.pinFrame(""));
        if (n == 15)
            open("settings");
        if (n == 16)
            DestroyWindow(root);
    }
    LRESULT handle(UINT msg, WPARAM wp, LPARAM lp) {
        try {
            if (msg == restart) {
                addTray();
                return 0;
            }
            if (msg == WM_APP + 3) {
                open("main");
                return 0;
            }
            if (msg == trayEvent) {
                if (lp == WM_RBUTTONUP)
                    menu();
                if (lp == WM_LBUTTONDBLCLK)
                    open("main");
                return 0;
            }
            if (msg == WM_HOTKEY) {
                auto a = assigned.find((int)wp);
                if (a == assigned.end())
                    return 0;
                if (a->second == "shelf") {
                    if (shelf.visible())
                        shelf.dismiss(true);
                    else
                        shelf.show();
                } else if (a->second == "templates")
                    open("personal");
                else if (a->second == "capture")
                    requestCapture(false, false);
                else
                    pinImage(archive.pinFrame(""));
                return 0;
            }
            if (msg == WM_CLIPBOARDUPDATE) {
                if (listening && GetClipboardSequenceNumber() != lastSeq) {
                    tries = 0;
                    readChange();
                }
                return 0;
            }
            if (msg == WM_TIMER) {
                if (wp == 1)
                    readChange();
                if (wp == 2) {
                    KillTimer(root, 2);
                    makeCapture();
                }
                return 0;
            }
            if (msg == WM_DESTROY) {
                exiting = true;
                shelf.dismiss(false);
                setListening(false);
                for (auto &[key, id] : registered)
                    UnregisterHotKey(root, id);
                registered.clear();
                while (!panels.empty()) {
                    auto p = panels.begin()->second;
                    p->shutdown();
                    if (!p->hwnd)
                        panels.erase(p->kind);
                }
                Shell_NotifyIconW(NIM_DELETE, &tray);
                PostQuitMessage(0);
                return 0;
            }
        } catch (const std::exception &e) {
            notify(e.what());
            return 0;
        }
        return DefWindowProcW(root, msg, wp, lp);
    }
    static LRESULT CALLBACK proc(HWND h, UINT msg, WPARAM wp, LPARAM lp) {
        auto *p = (Application *)GetWindowLongPtrW(h, GWLP_USERDATA);
        if (msg == WM_NCCREATE) {
            p = (Application *)((CREATESTRUCTW *)lp)->lpCreateParams;
            p->root = h;
            SetWindowLongPtrW(h, GWLP_USERDATA, (LONG_PTR)p);
        }
        return p ? p->handle(msg, wp, lp) : DefWindowProcW(h, msg, wp, lp);
    }

  public:
    int run() {
        registerClass(L"CiXiaNativeService", proc);
        root = CreateWindowW(L"CiXiaNativeService", L"词匣服务", WS_OVERLAPPED, 0, 0, 0, 0, nullptr, nullptr,
                             instance(), this);
        require(root, "后台工作区启动失败。");
        addTray();
        if (fs::exists(home / L"settings.json")) {
            std::ifstream f(home / L"settings.json");
            settings = Json::parse(f);
        }
        apply(settings, true);
        open("main");
        MSG msg{};
        while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        return (int)msg.wParam;
    }
};
int WINAPI wWinMain(HINSTANCE, HINSTANCE, LPWSTR, int) {
    HANDLE mutex = CreateMutexW(nullptr, FALSE, L"Local\\CiXiaDesktopMain");
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        auto wnd = FindWindowW(L"CiXiaNativeService", nullptr);
        if (wnd) {
            DWORD pid;
            GetWindowThreadProcessId(wnd, &pid);
            AllowSetForegroundWindow(pid);
            PostMessageW(wnd, WM_APP + 3, 0, 0);
        }
        if (mutex)
            CloseHandle(mutex);
        return 0;
    }
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    ULONG_PTR token = 0;
    Gdiplus::GdiplusStartupInput g;
    Gdiplus::GdiplusStartup(&token, &g, nullptr);
    int rc = 1;
    try {
        Application app;
        rc = app.run();
    } catch (const std::exception &e) {
        MessageBoxW(nullptr, wide(e.what()).c_str(), L"词匣启动失败", MB_OK | MB_ICONERROR);
    }
    if (token)
        Gdiplus::GdiplusShutdown(token);
    CoUninitialize();
    if (mutex)
        CloseHandle(mutex);
    return rc;
}
