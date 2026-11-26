#pragma once
#include "win.hpp"
#include <dwmapi.h>
extern "C" unsigned ps_scroll_match(const uint8_t *, const uint8_t *, unsigned, unsigned, unsigned,
                                    unsigned *);
inline HINSTANCE instance() {
    return GetModuleHandleW(nullptr);
}
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
    bool dragging = false, selected = false, longMode = false, automatic = false, restoredPointer = false;
    bool startInScroll = false, autoRequested = false, barOverlaps = false, atLimit = false;
    ULONGLONG lastWheel = 0, lastSample = 0;
    enum Control { Edit = 1, Scroll, Cancel, Finish, ToggleAuto, Status };
    enum class Match { Same, Added, Unmatched, Obstructed, Limit };
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
            if (self->dragging || self->selected) {
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
            if (self->selected) {
                self->selected = false;
                if (self->bar)
                    DestroyWindow(self->bar);
                self->bar = nullptr;
            }
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
                    self->choose(r);
                } catch (const std::exception &e) {
                    self->stop();
                    MessageBoxW(nullptr, wide(e.what()).c_str(), L"词匣", MB_OK | MB_ICONWARNING);
                }
            }
            return 0;
        case WM_KEYDOWN:
            if (wp == VK_RETURN && self->selected) {
                self->finish();
                return 0;
            }
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
            SetWindowTextW(GetDlgItem(bar, Status), status.c_str());
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
            case WM_MOUSEACTIVATE:
                return MA_NOACTIVATE;
            case WM_COMMAND:
                switch (LOWORD(wp)) {
                case Edit:
                    s->finish();
                    break;
                case Scroll:
                    s->startScrolling(false);
                    break;
                case Finish:
                    s->completeLong();
                    break;
                case ToggleAuto:
                    s->setAuto(!s->automatic);
                    break;
                case Cancel:
                    s->stop();
                    break;
                }
                return 0;
            }
        } catch (const std::exception &e) {
            if (!s->bar && !s->overlay) {
                s->stop();
                MessageBoxW(nullptr, wide(e.what()).c_str(), L"词匣 · 截图", MB_OK | MB_ICONWARNING);
            } else {
                s->automatic = false;
                s->label(wide(e.what()));
            }
            return 0;
        }
        return DefWindowProcW(hwnd, msg, wp, lp);
    }
    POINT middle() const { return {(region.left + region.right) / 2, (region.top + region.bottom) / 2}; }
    void placeToolbar() {
        MONITORINFO mi{sizeof(mi)};
        GetMonitorInfoW(MonitorFromPoint(middle(), MONITOR_DEFAULTTONEAREST), &mi);
        const RECT work = mi.rcWork;
        const auto dpi = GetDpiForWindow(overlay ? overlay : bar);
        const int w = std::min<int>(MulDiv(456, dpi ? dpi : 96, 96), work.right - work.left);
        const int h = MulDiv(82, dpi ? dpi : 96, 96);
        int x = std::clamp<int>(region.left, work.left, work.right - w);
        int y = region.bottom + 4;
        if (y + h > work.bottom)
            y = region.top - h - 4;
        if (y < work.top) {
            y = std::clamp<int>(region.top, work.top, std::max<int>(work.top, work.bottom - h));
            if (region.right + w + 4 <= work.right)
                x = region.right + 4;
            else if (region.left - w - 4 >= work.left)
                x = region.left - w - 4;
            else
                y = work.bottom - h;
        }
        RECT barRect{x, y, x + w, y + h}, intersection;
        barOverlaps = IntersectRect(&intersection, &barRect, &region);
        SetWindowPos(bar, HWND_TOPMOST, x, y, w, h, SWP_NOACTIVATE | SWP_SHOWWINDOW);
    }
    void button(int id, const wchar_t *name, int x, int w) {
        const auto dpi = GetDpiForWindow(bar);
        auto px = [&](int d) { return MulDiv(d, dpi, 96); };
        HWND b = CreateWindowW(L"BUTTON", name, BS_PUSHBUTTON | WS_CHILD | WS_VISIBLE, px(x), px(37), px(w),
                               px(31), bar, (HMENU)(INT_PTR)id, instance(), nullptr);
        SendMessageW(b, WM_SETFONT, (WPARAM)GetStockObject(DEFAULT_GUI_FONT), TRUE);
    }
    void toolbar(bool scrolling) {
        if (bar)
            DestroyWindow(bar);
        bar = CreateWindowExW(WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, L"CiXiaScroll",
                              L"截图工具栏", WS_POPUP | WS_BORDER, region.left, region.top, 1, 1, nullptr,
                              nullptr, instance(), this);
        require(bar, "无法打开截图工具栏。");
        placeToolbar();
        UINT dpi = GetDpiForWindow(bar);
        HWND note = CreateWindowW(L"STATIC", L"", WS_CHILD | WS_VISIBLE, MulDiv(10, dpi, 96),
                                  MulDiv(8, dpi, 96), MulDiv(435, dpi, 96), MulDiv(24, dpi, 96), bar,
                                  (HMENU)(INT_PTR)Status, instance(), nullptr);
        SendMessageW(note, WM_SETFONT, (WPARAM)GetStockObject(DEFAULT_GUI_FONT), TRUE);
        if (scrolling) {
            button(ToggleAuto, L"自动滚动", 10, 115);
            button(Finish, L"完成长图并编辑", 134, 156);
            button(Cancel, L"取消", 301, 90);
        } else {
            button(Edit, L"编辑普通截图", 10, 134);
            button(Scroll, L"滚动长截图", 153, 136);
            button(Cancel, L"取消", 301, 90);
        }
    }
    void choose(RECT r) {
        const int w = r.right - r.left, h = r.bottom - r.top;
        Frame first{w, h, Bytes(size_t(w) * h * 4)};
        for (int y = 0; y < h; y++)
            memcpy(&first.px[size_t(y) * w * 4], &screen.px[(size_t(y + r.top) * screen.w + r.left) * 4],
                   size_t(w) * 4);
        region = {r.left + total.left, r.top + total.top, r.right + total.left, r.bottom + total.top};
        selected = true;
        merged = std::move(first);
        parts = 1;
        InvalidateRect(overlay, nullptr, FALSE);
        if (startInScroll && w >= 24 && h >= 48)
            startScrolling(autoRequested);
        else {
            toolbar(false);
            label(L"已框选 · 普通截图　Enter 编辑，也可以切换长截图");
        }
    }
    void startScrolling(bool autoScroll) {
        if (region.bottom - region.top < 48 || region.right - region.left < 24) {
            label(L"长截图选区过小，请重新拖选滚动内容。");
            return;
        }
        if (bar) {
            DestroyWindow(bar);
            bar = nullptr;
        }
        DestroyWindow(overlay);
        overlay = nullptr;
        screen = {};
        DwmFlush();
        target = GetAncestor(WindowFromPoint(middle()), GA_ROOT);
        require(target, "无法定位滚动目标窗口，请重新框选网页内容。");
        SetForegroundWindow(target);
        previous = merged;
        longMode = true;
        toolbar(true);
        setAuto(autoScroll);
        SetTimer(bar, 1, 130, nullptr);
    }
    void setAuto(bool enabled) {
        automatic = enabled;
        stationary = 0;
        lastWheel = 0;
        if (enabled) {
            if (!restoredPointer)
                GetCursorPos(&formerPointer);
            restoredPointer = true;
            auto center = middle();
            SetCursorPos(center.x, center.y);
            SetForegroundWindow(target);
        }
        SetWindowTextW(GetDlgItem(bar, ToggleAuto), enabled ? L"手动滚动" : L"自动滚动");
        label(enabled ? L"自动滚动中 · 正在匹配网页内容" : L"在选区内向下缓慢滚动，新增内容会自动拼接");
    }
    void tick() {
        if (!longMode || atLimit)
            return;
        if (GetAsyncKeyState(VK_ESCAPE) & 0x8000) {
            stop();
            return;
        }
        // If the controls couldn't fit outside the selection, a sample briefly
        // hides them. Let mouse-down/up finish on the button before doing that.
        if (barOverlaps) {
            POINT pointer;
            GetCursorPos(&pointer);
            HWND hovered = WindowFromPoint(pointer);
            if (hovered == bar || IsChild(bar, hovered))
                return;
        }
        LASTINPUTINFO input{sizeof(input)};
        const ULONGLONG now = GetTickCount64();
        if (!automatic && GetLastInputInfo(&input) && DWORD(now) - input.dwTime > 1300 &&
            now - lastSample < 1200)
            return;
        lastSample = now;
        const Match match = sample();
        if (!automatic || match == Match::Limit)
            return;
        if (match == Match::Obstructed || match == Match::Unmatched) {
            setAuto(false);
            label(match == Match::Obstructed ? L"请将所选网页移回选区，再继续滚动"
                                             : L"当前画面缺少重叠，请向上滚回一小段再继续");
            return;
        }
        if (now - lastWheel < 460)
            return;
        if (match == Match::Same && lastWheel && ++stationary >= 3) {
            if (parts > 1)
                finish();
            else {
                setAuto(false);
                label(L"仍只有首屏。滚动网页正文，或重选可滚动的区域。");
            }
            return;
        }
        POINT cursor;
        GetCursorPos(&cursor);
        POINT center = middle();
        if (abs(cursor.x - center.x) > 8 || abs(cursor.y - center.y) > 8) {
            setAuto(false);
            return;
        }
        INPUT wheel{};
        wheel.type = INPUT_MOUSE;
        wheel.mi.dwFlags = MOUSEEVENTF_WHEEL;
        wheel.mi.mouseData = (DWORD)(-WHEEL_DELTA);
        if (!SendInput(1, &wheel, sizeof(wheel))) {
            setAuto(false);
            label(L"系统未接收自动滚动，请在网页上手动滚动。");
            return;
        }
        lastWheel = now;
    }
    Match sample() {
        // A toolbar fitting outside the selection can stay visible throughout sampling.
        const bool hide = barOverlaps;
        if (hide) {
            ShowWindow(bar, SW_HIDE);
            DwmFlush();
        }
        bool valid =
            target && IsWindow(target) && GetAncestor(WindowFromPoint(middle()), GA_ROOT) == target;
        Frame next;
        try {
            if (valid)
                next = captureRect(region);
        } catch (...) {
            if (hide)
                ShowWindow(bar, SW_SHOWNOACTIVATE);
            throw;
        }
        if (hide)
            ShowWindow(bar, SW_SHOWNOACTIVATE);
        if (!valid) {
            label(L"请恢复所选网页，保持选区在原位置。");
            return Match::Obstructed;
        }
        unsigned seam = 0;
        unsigned overlap =
            ps_scroll_match(previous.px.data(), next.px.data(), next.w, next.h, next.w * 4, &seam);
        if (overlap >= unsigned(next.h))
            return Match::Same;
        if (!overlap) {
            label(L"未对齐：请向上滚回一小段，保留两屏重叠的正文");
            return Match::Unmatched;
        }
        int added = next.h - int(overlap);
        if (merged.h + added > 32767 || uint64_t(merged.h + added) * next.w > 64000000) {
            automatic = false;
            atLimit = true;
            EnableWindow(GetDlgItem(bar, ToggleAuto), FALSE);
            label(L"已到图像尺寸上限，请完成当前长图。");
            return Match::Limit;
        }
        // Join inside the overlapping content. Replacing the bottom portion of the old
        // viewport prevents a sticky browser footer from appearing at every join.
        const size_t stride = size_t(next.w) * 4;
        const size_t required = size_t(merged.h + added) * stride;
        if (merged.px.capacity() < required) {
            const size_t capacity = merged.px.capacity();
            const size_t upper = std::min<size_t>(size_t(32767) * stride, 64000000ull * 4);
            merged.px.reserve(std::max(required, std::min(upper, capacity + capacity / 2)));
        }
        merged.px.resize(merged.px.size() - size_t(overlap - seam) * stride);
        merged.px.insert(merged.px.end(), next.px.begin() + seam * stride, next.px.end());
        merged.h += added;
        previous = std::move(next);
        stationary = 0;
        ++parts;
        label(L"已拼接 " + std::to_wstring(parts) + L" 帧 · " + std::to_wstring(merged.h) + L" 像素高");
        return Match::Added;
    }
    void completeLong() {
        Match match = atLimit ? Match::Limit : sample();
        if (parts < 2) {
            label(L"只有首屏：请先滚动选区内的正文，看到拼接高度后再完成。");
            return;
        }
        if (match == Match::Unmatched || match == Match::Obstructed) {
            const bool wasAuto = automatic;
            KillTimer(bar, 1);
            int response = MessageBoxW(bar, L"最后这一屏尚未对齐。仅编辑已经拼接成功的部分？",
                                       L"确认长截图", MB_YESNO | MB_ICONQUESTION);
            if (response != IDYES) {
                setAuto(wasAuto);
                SetTimer(bar, 1, 130, nullptr);
                return;
            }
        }
        finish();
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
        restoredPointer = dragging = selected = automatic = atLimit = false;
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
        longMode = false;
        startInScroll = longShot;
        autoRequested = autoScroll;
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
struct PinSurface {
    Frame pixels;
    std::function<void(HWND)> closed;
};
inline LRESULT CALLBACK pinProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    auto *surface = reinterpret_cast<PinSurface *>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    if (!surface)
        return DefWindowProcW(hwnd, msg, wp, lp);
    auto &f = surface->pixels;
    switch (msg) {
    case WM_ERASEBKGND:
        return 1;
    case WM_SIZE:
        InvalidateRect(hwnd, nullptr, FALSE);
        return 0;
    case WM_SIZING: {
        // Keep the proportions on a corner drag. Very tall screenshots still have
        // a usable title bar: their image is fitted inside the minimum window.
        if (wp != WMSZ_TOPLEFT && wp != WMSZ_TOPRIGHT && wp != WMSZ_BOTTOMLEFT && wp != WMSZ_BOTTOMRIGHT)
            break;
        RECT before{}, client{};
        GetWindowRect(hwnd, &before);
        GetClientRect(hwnd, &client);
        RECT &next = *reinterpret_cast<RECT *>(lp);
        const int borderW = before.right - before.left - client.right;
        const int borderH = before.bottom - before.top - client.bottom;
        int w = std::max<int>(1, next.right - next.left - borderW);
        int h = std::max<int>(1, next.bottom - next.top - borderH);
        const bool horizontal = abs(w - client.right) * double(std::max<LONG>(1, client.bottom)) >
                                abs(h - client.bottom) * double(std::max<LONG>(1, client.right));
        const double scale = horizontal ? double(w) / f.w : double(h) / f.h;
        MONITORINFO mi{sizeof(mi)};
        GetMonitorInfoW(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST), &mi);
        int maxW = std::max<int>(1, mi.rcWork.right - mi.rcWork.left - borderW);
        int maxH = std::max<int>(1, mi.rcWork.bottom - mi.rcWork.top - borderH);
        w = std::clamp<int>(int(f.w * scale + 0.5), std::min(94, maxW), maxW) + borderW;
        h = std::clamp<int>(int(f.h * scale + 0.5), std::min(48, maxH), maxH) + borderH;
        if (wp == WMSZ_TOPLEFT || wp == WMSZ_BOTTOMLEFT)
            next.left = next.right - w;
        else
            next.right = next.left + w;
        if (wp == WMSZ_TOPLEFT || wp == WMSZ_TOPRIGHT)
            next.top = next.bottom - h;
        else
            next.bottom = next.top + h;
        return TRUE;
    }
    case WM_PAINT: {
        PAINTSTRUCT ps;
        HDC dc = BeginPaint(hwnd, &ps);
        RECT r;
        GetClientRect(hwnd, &r);
        FillRect(dc, &r, (HBRUSH)GetStockObject(BLACK_BRUSH));
        double z = std::min(double(r.right) / f.w, double(r.bottom) / f.h);
        int w = std::max(1, int(f.w * z)), h = std::max(1, int(f.h * z));
        int x = (r.right - w) / 2, y = (r.bottom - h) / 2;
        drawFrame(dc, f, {x, y, x + w, y + h}, {0, 0, f.w, f.h});
        EndPaint(hwnd, &ps);
        return 0;
    }
    case WM_KEYDOWN:
        if (wp == VK_ESCAPE) {
            DestroyWindow(hwnd);
            return 0;
        }
        break;
    case WM_LBUTTONDOWN:
        ReleaseCapture();
        SendMessageW(hwnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
        return 0;
    case WM_NCDESTROY:
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
        if (surface->closed)
            surface->closed(hwnd);
        delete surface;
        break;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
}
inline HWND pinImage(Frame frame, const wstring &title = L"词匣 · 置顶截图", size_t ordinal = 0,
                     std::function<void(HWND)> closed = {}) {
    registerClass(L"CiXiaPin", pinProc);
    POINT point;
    GetCursorPos(&point);
    MONITORINFO mi{sizeof(mi)};
    GetMonitorInfoW(MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST), &mi);
    RECT work = mi.rcWork;
    double z = std::min(
        {1.0, (work.right - work.left) * 0.47 / frame.w, (work.bottom - work.top) * 0.68 / frame.h});
    int w = std::max(94, int(frame.w * z)), h = std::max(48, int(frame.h * z));
    constexpr DWORD style = WS_OVERLAPPEDWINDOW, ex = WS_EX_TOPMOST | WS_EX_TOOLWINDOW;
    RECT rect{0, 0, w, h};
    AdjustWindowRectEx(&rect, style, FALSE, ex);
    int width = rect.right - rect.left, height = rect.bottom - rect.top;
    int offset = int(ordinal % 8) * 32;
    int x =
        std::clamp<int>(work.left + 30 + offset, work.left, std::max<int>(work.left, work.right - width));
    int y =
        std::clamp<int>(work.top + 48 + offset, work.top, std::max<int>(work.top, work.bottom - height));
    auto surface = std::make_unique<PinSurface>(PinSurface{std::move(frame), std::move(closed)});
    HWND wnd = CreateWindowExW(ex, L"CiXiaPin", title.c_str(), style, x, y, width, height, nullptr, nullptr,
                               instance(), nullptr);
    require(wnd, "置顶窗口创建失败。");
    SetWindowLongPtrW(wnd, GWLP_USERDATA, (LONG_PTR)surface.release());
    ShowWindow(wnd, SW_SHOWNOACTIVATE);
    return wnd;
}
