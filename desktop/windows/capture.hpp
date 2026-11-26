#pragma once
#include "win.hpp"
#include <dwmapi.h>
extern "C" unsigned ps_scroll_overlap(const uint8_t *, const uint8_t *, unsigned, unsigned, unsigned);
inline HINSTANCE instance() { return GetModuleHandleW(nullptr); }
inline void registerClass(const wchar_t *name, WNDPROC proc, HCURSOR cursor = nullptr) {
    WNDCLASSEXW wc{sizeof(wc)};
    wc.lpfnWndProc = proc;
    wc.hInstance = instance();
    wc.hCursor = cursor ? cursor : LoadCursorW(nullptr, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wc.lpszClassName = name;
    wc.hIcon = LoadIconW(instance(), MAKEINTRESOURCEW(1));
    if (!RegisterClassExW(&wc) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS)
        throw std::runtime_error("创建窗口类型失败。");
}
class Capture {
    Frame screen, previous, merged;
    RECT total{}, region{}, selection{};
    POINT anchor{}, formerPointer{};
    HWND overlay = nullptr, bar = nullptr, target = nullptr;
    bool dragging = false, longMode = false, automatic = false, issuedWheel = false, restoredPointer = false;
    int parts = 0, stationary = 0;
    wstring status;
    std::function<void(Frame &&)> finished;
    std::function<void()> cancelled;
    static LRESULT CALLBACK selectProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
        auto *self = (Capture *)GetWindowLongPtrW(hwnd, GWLP_USERDATA);
        if (msg == WM_NCCREATE) {
            self = (Capture *)((CREATESTRUCTW *)lp)->lpCreateParams;
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, (LONG_PTR)self);
        }
        if (!self)
            return DefWindowProcW(hwnd, msg, wp, lp);
        switch (msg) {
        case WM_ERASEBKGND:
            return 1;
        case WM_PAINT: {
            PAINTSTRUCT ps;
            HDC dc = BeginPaint(hwnd, &ps);
            RECT size{0, 0, self->screen.w, self->screen.h};
            drawFrame(dc, self->screen, size, size);
            HBRUSH black = CreateSolidBrush(RGB(22, 25, 19));
            RECT r = self->selection;
            if (self->dragging) {
                FrameRect(dc, &r, (HBRUSH)GetStockObject(WHITE_BRUSH));
                InflateRect(&r, 1, 1);
                FrameRect(dc, &r, black);
            }
            RECT help{20, 20, 375, 58};
            FillRect(dc, &help, black);
            SetTextColor(dc, RGB(255, 255, 251));
            SetBkMode(dc, TRANSPARENT);
            DrawTextW(dc, L"拖动选择截图区域    ·    Esc 取消", -1, &help,
                      DT_CENTER | DT_VCENTER | DT_SINGLELINE);
            DeleteObject(black);
            EndPaint(hwnd, &ps);
            return 0;
        }
        case WM_LBUTTONDOWN:
            self->anchor = {GET_X_LPARAM(lp), GET_Y_LPARAM(lp)};
            self->selection = {self->anchor.x, self->anchor.y, self->anchor.x, self->anchor.y};
            self->dragging = true;
            SetCapture(hwnd);
            return 0;
        case WM_MOUSEMOVE:
            if (self->dragging) {
                self->updatePoint(GET_X_LPARAM(lp), GET_Y_LPARAM(lp));
                InvalidateRect(hwnd, nullptr, FALSE);
            }
            return 0;
        case WM_LBUTTONUP:
            if (self->dragging) {
                self->updatePoint(GET_X_LPARAM(lp), GET_Y_LPARAM(lp));
                self->dragging = false;
                ReleaseCapture();
                RECT r = self->selection;
                if (r.right - r.left < 4 || r.bottom - r.top < 4) {
                    InvalidateRect(hwnd, nullptr, FALSE);
                    return 0;
                }
                try {
                    self->commit(r);
                } catch (const std::exception &e) {
                    self->stop();
                    MessageBoxW(nullptr, wide(e.what()).c_str(), L"词匣", MB_OK | MB_ICONWARNING);
                }
            }
            return 0;
        case WM_KEYDOWN:
            if (wp == VK_ESCAPE) {
                self->stop();
                return 0;
            }
            break;
        case WM_CLOSE:
            self->stop();
            return 0;
        }
        return DefWindowProcW(hwnd, msg, wp, lp);
    }
    void updatePoint(LONG x, LONG y) {
        x = std::clamp(x, 0L, LONG(screen.w));
        y = std::clamp(y, 0L, LONG(screen.h));
        selection = {std::min(x, anchor.x), std::min(y, anchor.y), std::max(x, anchor.x),
                     std::max(y, anchor.y)};
    }
    void label(wstring s) {
        status = std::move(s);
        if (bar)
            SetWindowTextW(GetDlgItem(bar, 8), status.c_str());
    }
    static LRESULT CALLBACK barProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
        auto *s = (Capture *)GetWindowLongPtrW(hwnd, GWLP_USERDATA);
        if (msg == WM_NCCREATE) {
            s = (Capture *)((CREATESTRUCTW *)lp)->lpCreateParams;
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, (LONG_PTR)s);
        }
        if (!s)
            return DefWindowProcW(hwnd, msg, wp, lp);
        try {
            switch (msg) {
            case WM_TIMER:
                if (wp == 1)
                    s->tick();
                return 0;
            case WM_CLOSE:
                s->stop();
                return 0;
            case WM_COMMAND:
                if (LOWORD(wp) == 1) {
                    s->automatic = false;
                    KillTimer(hwnd, 1);
                    s->mergeOne();
                }
                if (LOWORD(wp) == 2)
                    s->finish();
                if (LOWORD(wp) == 3)
                    s->stop();
                return 0;
            }
        } catch (const std::exception &e) {
            s->automatic = false;
            KillTimer(hwnd, 1);
            s->label(wide(e.what()));
        }
        return DefWindowProcW(hwnd, msg, wp, lp);
    }
    void commit(RECT r) {
        Frame first{int(r.right - r.left), int(r.bottom - r.top),
                    Bytes(size_t(r.right - r.left) * (r.bottom - r.top) * 4)};
        for (int y = 0; y < first.h; y++)
            memcpy(&first.px[size_t(y) * first.w * 4],
                   &screen.px[(size_t(y + r.top) * screen.w + r.left) * 4], size_t(first.w) * 4);
        region = {r.left + total.left, r.top + total.top, r.right + total.left, r.bottom + total.top};
        DestroyWindow(overlay);
        overlay = nullptr;
        screen = {};
        merged = first;
        parts = 1;
        if (!longMode) {
            finish();
            return;
        }
        previous = std::move(first);
        POINT center{(region.left + region.right) / 2, (region.top + region.bottom) / 2};
        target = GetAncestor(WindowFromPoint(center), GA_ROOT);
        GetCursorPos(&formerPointer);
        RECT work;
        MONITORINFO mi{sizeof(mi)};
        GetMonitorInfoW(MonitorFromPoint(center, MONITOR_DEFAULTTONEAREST), &mi);
        work = mi.rcWork;
        int x = std::clamp(region.left, work.left, std::max(work.left, work.right - 435));
        int y = region.top - work.top > 100 ? region.top - 95 : std::min(region.bottom + 3, work.bottom - 95);
        bar = CreateWindowExW(WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, L"CiXiaScroll",
                              L"词匣 · 长截图", WS_POPUP | WS_BORDER, x, y, 435, 91, nullptr, nullptr,
                              instance(), this);
        require(bar, "无法打开长截图控制条。");
        CreateWindowW(L"STATIC", L"", WS_CHILD | WS_VISIBLE, 10, 9, 412, 23, bar, (HMENU)8, instance(),
                      nullptr);
        int bx = 10;
        for (auto item :
             {std::pair<int, const wchar_t *>{1, L"手动加入当前屏"}, {2, L"完成长截图"}, {3, L"取消"}}) {
            HWND b = CreateWindowW(L"BUTTON", item.second, BS_PUSHBUTTON | WS_VISIBLE | WS_CHILD, bx, 40,
                                   item.first == 1 ? 142 : 108, 34, bar, (HMENU)(INT_PTR)item.first,
                                   instance(), nullptr);
            SendMessageW(b, WM_SETFONT, (WPARAM)GetStockObject(DEFAULT_GUI_FONT), TRUE);
            bx += item.first == 1 ? 149 : 115;
        }
        ShowWindow(bar, SW_SHOWNOACTIVATE);
        label(automatic ? L"自动滚动中，可随时完成或取消。" : L"请在所选窗口向下滚动少许，再加入当前屏。");
        if (automatic) {
            SetForegroundWindow(target);
            SetCursorPos(center.x, center.y);
            restoredPointer = true;
            SetTimer(bar, 1, 450, nullptr);
        }
    }
    void tick() {
        if (!automatic)
            return;
        if (!IsWindow(target)) {
            automatic = false;
            KillTimer(bar, 1);
            label(L"来源窗口已关闭，可完成已采集的内容。");
            return;
        }
        if (GetAsyncKeyState(VK_ESCAPE) & 0x8000) {
            stop();
            return;
        }
        if (!issuedWheel) {
            POINT center{(region.left + region.right) / 2, (region.top + region.bottom) / 2};
            ShowWindow(bar, SW_HIDE);
            DwmFlush();
            HWND visible = GetAncestor(WindowFromPoint(center), GA_ROOT);
            if (visible != target) {
                ShowWindow(bar, SW_SHOWNOACTIVATE);
                automatic = false;
                KillTimer(bar, 1);
                label(L"目标窗口已被遮挡，请恢复后手动加入。");
                return;
            }
            POINT cursor;
            GetCursorPos(&cursor);
            if (abs(cursor.x - center.x) > 8 || abs(cursor.y - center.y) > 8) {
                ShowWindow(bar, SW_SHOWNOACTIVATE);
                automatic = false;
                KillTimer(bar, 1);
                label(L"已暂停自动滚动，可手动加入或完成。");
                return;
            }
            INPUT event{};
            event.type = INPUT_MOUSE;
            event.mi.dwFlags = MOUSEEVENTF_WHEEL;
            event.mi.mouseData = (DWORD)(-WHEEL_DELTA);
            if (!SendInput(1, &event, sizeof(event))) {
                automatic = false;
                KillTimer(bar, 1);
                label(L"目标未接收滚动，请手动滚动后加入。");
            }
            ShowWindow(bar, SW_SHOWNOACTIVATE);
            issuedWheel = true;
        } else {
            issuedWheel = false;
            mergeOne();
        }
    }
    void mergeOne() {
        ShowWindow(bar, SW_HIDE);
        DwmFlush();
        Frame next;
        try {
            next = captureRect(region);
        } catch (...) {
            ShowWindow(bar, SW_SHOWNOACTIVATE);
            throw;
        }
        ShowWindow(bar, SW_SHOWNOACTIVATE);
        unsigned overlap = ps_scroll_overlap(previous.px.data(), next.px.data(), next.w, next.h, next.w * 4);
        if (overlap >= unsigned(next.h)) {
            if (automatic && ++stationary >= 2) {
                finish();
                return;
            }
            label(L"画面尚未变化，可滚动后继续或完成。");
            return;
        }
        if (!overlap) {
            automatic = false;
            KillTimer(bar, 1);
            label(L"未找到重叠区域，请向上退一点后手动加入。");
            return;
        }
        stationary = 0;
        size_t offset = size_t(overlap) * next.w * 4;
        int append = next.h - int(overlap);
        if (merged.h + append > 32767 || uint64_t(merged.h + append) * next.w > 64000000) {
            automatic = false;
            KillTimer(bar, 1);
            label(L"已到此张图片的尺寸上限，请完成长截图。");
            return;
        }
        merged.px.insert(merged.px.end(), next.px.begin() + offset, next.px.end());
        merged.h += append;
        previous = std::move(next);
        parts++;
        label(L"已拼接 " + std::to_wstring(parts) + L" 屏 · " + std::to_wstring(merged.h) + L" 像素高");
    }
    void cleanup() {
        if (overlay) {
            DestroyWindow(overlay);
            overlay = nullptr;
        }
        if (bar) {
            KillTimer(bar, 1);
            DestroyWindow(bar);
            bar = nullptr;
        }
        if (restoredPointer) {
            POINT p;
            GetCursorPos(&p);
            POINT center{(region.left + region.right) / 2, (region.top + region.bottom) / 2};
            if (abs(p.x - center.x) < 10 && abs(p.y - center.y) < 10)
                SetCursorPos(formerPointer.x, formerPointer.y);
        }
        restoredPointer = issuedWheel = dragging = false;
        stationary = 0;
        screen = {};
        previous = {};
        merged = {};
    }
    void finish() {
        Frame result = std::move(merged);
        cleanup();
        if (finished)
            finished(std::move(result));
    }

  public:
    int frameHeight() const { return region.bottom - region.top; }
    bool active() const { return overlay || bar; }
    void start(bool longShot, bool autoScroll, std::function<void(Frame &&)> done,
               std::function<void()> cancel) {
        require(!active(), "已有截图正在进行。");
        registerClass(L"CiXiaSelect", selectProc, LoadCursorW(nullptr, IDC_CROSS));
        registerClass(L"CiXiaScroll", barProc);
        longMode = longShot;
        automatic = autoScroll;
        finished = std::move(done);
        cancelled = std::move(cancel);
        total = wholeScreen();
        screen = captureRect(total);
        selection = {};
        overlay = CreateWindowExW(WS_EX_TOPMOST | WS_EX_TOOLWINDOW, L"CiXiaSelect", L"词匣 · 拖动选择区域",
                                  WS_POPUP, total.left, total.top, screen.w, screen.h, nullptr, nullptr,
                                  instance(), this);
        require(overlay, "无法打开截图选区。");
        ShowWindow(overlay, SW_SHOW);
        SetForegroundWindow(overlay);
        SetFocus(overlay);
    }
    void stop() {
        cleanup();
        if (cancelled)
            cancelled();
    }
};
inline LRESULT CALLBACK pinProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    auto *f = (Frame *)GetWindowLongPtrW(hwnd, GWLP_USERDATA);
    if (msg == WM_NCCREATE) {
        f = (Frame *)((CREATESTRUCTW *)lp)->lpCreateParams;
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, (LONG_PTR)f);
    }
    if (msg == WM_PAINT && f) {
        PAINTSTRUCT ps;
        HDC dc = BeginPaint(hwnd, &ps);
        RECT r;
        GetClientRect(hwnd, &r);
        FillRect(dc, &r, (HBRUSH)GetStockObject(BLACK_BRUSH));
        double z = std::min(double(r.right) / f->w, double(r.bottom) / f->h);
        int w = std::max(1, (int)(f->w * z)), h = std::max(1, (int)(f->h * z));
        RECT dst{(r.right - w) / 2, (r.bottom - h) / 2, (r.right + w) / 2, (r.bottom + h) / 2};
        drawFrame(dc, *f, dst, {0, 0, f->w, f->h});
        EndPaint(hwnd, &ps);
        return 0;
    }
    if (msg == WM_KEYDOWN && wp == VK_ESCAPE) {
        DestroyWindow(hwnd);
        return 0;
    }
    if (msg == WM_LBUTTONDOWN) {
        ReleaseCapture();
        SendMessageW(hwnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
        return 0;
    }
    if (msg == WM_NCDESTROY) {
        delete f;
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
}
inline void pinImage(Frame frame) {
    registerClass(L"CiXiaPin", pinProc);
    double scale = std::min({1.0, 760.0 / frame.w, 560.0 / frame.h});
    int w = std::max(140, int(frame.w * scale)), h = std::max(90, int(frame.h * scale));
    RECT rect{0, 0, w, h};
    AdjustWindowRectEx(&rect, WS_OVERLAPPEDWINDOW, FALSE, WS_EX_TOPMOST | WS_EX_TOOLWINDOW);
    auto *f = new Frame(std::move(frame));
    HWND wnd = CreateWindowExW(WS_EX_TOPMOST | WS_EX_TOOLWINDOW, L"CiXiaPin", L"词匣 · 置顶截图",
                               WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, rect.right - rect.left,
                               rect.bottom - rect.top, nullptr, nullptr, instance(), f);
    if (!wnd)
        throw std::runtime_error("置顶窗口创建失败。");
    ShowWindow(wnd, SW_SHOWNOACTIVATE);
}
