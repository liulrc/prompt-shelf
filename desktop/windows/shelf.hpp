#pragma once
#include "archive.hpp"
#include "capture.hpp"
#include <commctrl.h>
#include <sstream>

class NativeShelf {
    Archive &archive;
    HWND window = nullptr, edit = nullptr, list = nullptr, previous = nullptr;
    HFONT regular = nullptr, heading = nullptr, detail = nullptr;
    HBRUSH paper = nullptr, control = nullptr;
    int dpi = 96;
    bool composing = false, closing = false;
    std::vector<string> filtered;
    std::map<string, Frame> thumbs;
    std::function<void(const string &)> copy;
    wstring feedback;
    int px(int value) const { return MulDiv(value, dpi, 96); }
    static void fillRound(HDC dc, RECT r, int radius, COLORREF border, COLORREF fill) {
        HPEN p = CreatePen(PS_SOLID, 1, border);
        HBRUSH b = CreateSolidBrush(fill);
        HGDIOBJ oldPen = SelectObject(dc, p), oldBrush = SelectObject(dc, b);
        RoundRect(dc, r.left, r.top, r.right, r.bottom, radius, radius);
        SelectObject(dc, oldPen);
        SelectObject(dc, oldBrush);
        DeleteObject(p);
        DeleteObject(b);
    }
    static void textAt(HDC dc, HFONT font, COLORREF ink, const wstring &text, RECT r, UINT align = DT_LEFT) {
        auto old = SelectObject(dc, font);
        SetBkMode(dc, TRANSPARENT);
        SetTextColor(dc, ink);
        DrawTextW(dc, text.c_str(), (int)text.size(), &r,
                  align | DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS | DT_NOPREFIX);
        SelectObject(dc, old);
    }
    static wstring typeName(const Json &r) {
        return r.at("type") == "text" ? L"文本" : r.at("type") == "video" ? L"视频" : L"图片";
    }
    static wstring lower(wstring text) {
        if (!text.empty())
            CharLowerBuffW(text.data(), (DWORD)text.size());
        return text;
    }
    static wstring localTime(const string &iso) {
        SYSTEMTIME u{}, local{};
        unsigned y, m, d, h, min, sec;
        if (sscanf(iso.c_str(), "%u-%u-%uT%u:%u:%u", &y, &m, &d, &h, &min, &sec) != 6)
            return {};
        u.wYear = y;
        u.wMonth = m;
        u.wDay = d;
        u.wHour = h;
        u.wMinute = min;
        u.wSecond = sec;
        if (!SystemTimeToTzSpecificLocalTime(nullptr, &u, &local))
            return {};
        wchar_t s[40];
        swprintf(s, 40, L"%02u/%02u  %02u:%02u", local.wMonth, local.wDay, local.wHour, local.wMinute);
        return s;
    }
    bool matches(const Json &r, const std::vector<wstring> &words) const {
        if (words.empty())
            return true;
        auto base =
            lower(wide(r.value("title", "") + " " + r.value("source", "") + " " + r.value("filename", "")) +
                  L" " + typeName(r));
        wstring body;
        bool loaded = false;
        for (auto &word : words) {
            if (base.find(word) != wstring::npos)
                continue;
            if (!loaded) {
                body = lower(wide(r.value("text", "")));
                loaded = true;
            }
            if (body.find(word) == wstring::npos)
                return false;
        }
        return true;
    }
    void fonts() {
        for (auto f : {regular, heading, detail})
            if (f)
                DeleteObject(f);
        auto make = [this](int size, int weight) {
            return CreateFontW(-px(size), 0, 0, 0, weight, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                               OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH,
                               L"Segoe UI");
        };
        regular = make(14, FW_MEDIUM);
        heading = make(18, FW_SEMIBOLD);
        detail = make(12, FW_NORMAL);
    }
    void layout() {
        RECT r;
        GetClientRect(window, &r);
        int margin = px(16);
        MoveWindow(edit, margin + px(12), px(57), r.right - (margin + px(12)) * 2, px(23), TRUE);
        MoveWindow(list, px(11), px(96), r.right - px(22), std::max(0, (int)r.bottom - px(137)), TRUE);
        SendMessageW(list, LB_SETITEMHEIGHT, 0, px(70));
        InvalidateRect(window, nullptr, TRUE);
    }
    void paint() {
        PAINTSTRUCT ps;
        auto dc = BeginPaint(window, &ps);
        RECT client;
        GetClientRect(window, &client);
        FillRect(dc, &client, paper);
        RECT header{px(18), px(5), client.right - px(56), px(45)};
        textAt(dc, heading, RGB(42, 49, 40), L"剪贴板历史", header);
        RECT close{client.right - px(43), px(6), client.right - px(12), px(40)};
        textAt(dc, heading, RGB(88, 96, 84), L"×", close, DT_CENTER);
        RECT search{px(16), px(49), client.right - px(16), px(85)};
        fillRound(dc, search, px(9), RGB(197, 204, 189), RGB(255, 254, 250));
        RECT footer{px(19), client.bottom - px(37), client.right - px(16), client.bottom - px(3)};
        const wstring note = !feedback.empty()  ? feedback
                             : filtered.empty() ? L"没有匹配的记录。"
                                                : L"↑ ↓ 选择      Enter 复制      Esc 关闭";
        textAt(dc, detail, RGB(88, 97, 82), note, footer);
        EndPaint(window, &ps);
    }
    void drawCard(const DRAWITEMSTRUCT &d) {
        if (d.itemID == UINT(-1) || d.itemID >= filtered.size())
            return;
        auto &r = archive.get(filtered[d.itemID]);
        bool selected = (d.itemState & ODS_SELECTED);
        FillRect(d.hDC, &d.rcItem, paper);
        RECT card = d.rcItem;
        InflateRect(&card, -px(3), -px(3));
        fillRound(d.hDC, card, px(11), selected ? RGB(179, 195, 159) : RGB(219, 224, 211),
                  selected ? RGB(232, 239, 220) : RGB(255, 254, 250));
        RECT thumb{card.left + px(8), card.top + px(7), card.left + px(70), card.bottom - px(7)};
        fillRound(d.hDC, thumb, px(7), RGB(218, 218, 205), RGB(237, 235, 224));
        auto id = filtered[d.itemID];
        if (!thumbs.count(id)) {
            if (thumbs.size() >= 18)
                thumbs.erase(thumbs.begin());
            thumbs[id] = archive.thumbnailFrame(r);
        }
        auto &f = thumbs.at(id);
        if (f.w && f.h) {
            double scale = std::min(double(thumb.right - thumb.left - 2) / f.w,
                                    double(thumb.bottom - thumb.top - 2) / f.h);
            int w = std::max(1, int(scale * f.w)), h = std::max(1, int(scale * f.h)),
                x = (thumb.left + thumb.right - w) / 2, y = (thumb.top + thumb.bottom - h) / 2;
            drawFrame(d.hDC, f, {x, y, x + w, y + h}, {0, 0, f.w, f.h});
        } else
            textAt(d.hDC, regular, RGB(103, 100, 79), r.at("type") == "text" ? L"Aa" : typeName(r), thumb,
                   DT_CENTER);
        RECT title{thumb.right + px(12), card.top + px(6), card.right - px(12), card.top + px(33)};
        textAt(d.hDC, regular, RGB(43, 50, 42), wide(r.value("title", "未命名内容")), title);
        RECT meta{title.left, title.bottom, card.right - px(12), card.bottom - px(6)};
        textAt(d.hDC, detail, RGB(91, 100, 83),
               typeName(r) + L" · " + wide(r.value("source", "")) + L"  ·  " +
                   localTime(r.value("createdAt", "")),
               meta);
    }
    void choose() {
        auto selected = SendMessageW(list, LB_GETCURSEL, 0, 0);
        if (selected == LB_ERR || selected >= (LRESULT)filtered.size())
            return;
        try {
            copy(filtered[selected]);
            dismiss(true);
        } catch (const std::exception &e) {
            feedback = wide(e.what());
            InvalidateRect(window, nullptr, FALSE);
            SetFocus(edit);
        }
    }
    void move(int by) {
        if (filtered.empty())
            return;
        int at = (int)SendMessageW(list, LB_GETCURSEL, 0, 0);
        SendMessageW(list, LB_SETCURSEL, std::clamp(at + by, 0, (int)filtered.size() - 1), 0);
        feedback.clear();
        InvalidateRect(window, nullptr, FALSE);
    }
    static LRESULT CALLBACK controlProc(HWND h, UINT m, WPARAM wp, LPARAM lp, UINT_PTR id, DWORD_PTR ref) {
        auto *s = (NativeShelf *)ref;
        if (m == WM_IME_STARTCOMPOSITION)
            s->composing = true;
        if (m == WM_IME_ENDCOMPOSITION)
            s->composing = false;
        if (m == WM_KEYDOWN && !s->composing) {
            if (wp == VK_ESCAPE) {
                s->dismiss(true);
                return 0;
            }
            if (wp == VK_RETURN) {
                s->choose();
                return 0;
            }
            if (wp == VK_DOWN || wp == VK_UP) {
                s->move(wp == VK_DOWN ? 1 : -1);
                return 0;
            }
            if (id == 2 && wp == VK_TAB) {
                SetFocus(s->edit);
                return 0;
            }
        }
        if (h == s->list && m == WM_LBUTTONUP) {
            auto hit = SendMessageW(h, LB_ITEMFROMPOINT, 0, lp);
            if (!HIWORD(hit) && (size_t)LOWORD(hit) < s->filtered.size()) {
                auto outcome = DefSubclassProc(h, m, wp, lp);
                SendMessageW(h, LB_SETCURSEL, LOWORD(hit), 0);
                s->choose();
                return outcome;
            }
        }
        return DefSubclassProc(h, m, wp, lp);
    }
    static LRESULT CALLBACK proc(HWND h, UINT m, WPARAM wp, LPARAM lp) {
        auto *s = (NativeShelf *)GetWindowLongPtrW(h, GWLP_USERDATA);
        if (m == WM_NCCREATE) {
            s = (NativeShelf *)((CREATESTRUCTW *)lp)->lpCreateParams;
            s->window = h;
            SetWindowLongPtrW(h, GWLP_USERDATA, (LONG_PTR)s);
        }
        if (!s)
            return DefWindowProcW(h, m, wp, lp);
        try {
            switch (m) {
            case WM_PAINT:
                s->paint();
                return 0;
            case WM_ERASEBKGND:
                return 1;
            case WM_DRAWITEM:
                if (wp == 2) {
                    s->drawCard(*(DRAWITEMSTRUCT *)lp);
                    return TRUE;
                }
                break;
            case WM_MEASUREITEM:
                ((MEASUREITEMSTRUCT *)lp)->itemHeight = s->px(70);
                return TRUE;
            case WM_CTLCOLOREDIT:
                SetBkColor((HDC)wp, RGB(255, 254, 250));
                SetTextColor((HDC)wp, RGB(42, 49, 40));
                return (LRESULT)s->control;
            case WM_CTLCOLORLISTBOX:
                SetBkColor((HDC)wp, RGB(248, 248, 244));
                return (LRESULT)s->paper;
            case WM_COMMAND:
                if (s->edit && (HWND)lp == s->edit && HIWORD(wp) == EN_CHANGE) {
                    s->feedback.clear();
                    s->refresh(false);
                    return 0;
                }
                break;
            case WM_LBUTTONUP: {
                RECT r;
                GetClientRect(h, &r);
                if (GET_X_LPARAM(lp) > r.right - s->px(53) && GET_Y_LPARAM(lp) < s->px(44)) {
                    s->dismiss(true);
                    return 0;
                }
            } break;
            case WM_KEYDOWN:
                if (wp == VK_ESCAPE) {
                    s->dismiss(true);
                    return 0;
                }
                break;
            case WM_SIZE:
                if (s->list)
                    s->layout();
                return 0;
            case WM_CLOSE:
                s->dismiss(true);
                return 0;
            case WM_ACTIVATE:
                if (LOWORD(wp) == WA_INACTIVE && !s->closing && IsWindowVisible(h))
                    PostMessageW(h, WM_APP + 55, 0, 0);
                break;
            case WM_APP + 55:
                if (GetForegroundWindow() != h)
                    s->dismiss(false);
                return 0;
            }
        } catch (const std::exception &e) {
            s->feedback = wide(e.what());
        }
        return DefWindowProcW(h, m, wp, lp);
    }

  public:
    NativeShelf(Archive &a, std::function<void(const string &)> action)
        : archive(a), copy(std::move(action)) {}
    ~NativeShelf() { dismiss(false); }
    bool visible() const { return window != nullptr; }
    void show(HWND returnTo = nullptr) {
        if (window) {
            SetForegroundWindow(window);
            SetFocus(edit);
            return;
        }
        previous = returnTo ? returnTo : GetForegroundWindow();
        registerClass(L"CiXiaQuickShelf", proc);
        POINT pt;
        GetCursorPos(&pt);
        MONITORINFO mi{sizeof(mi)};
        GetMonitorInfoW(MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST), &mi);
        RECT r = mi.rcWork;
        dpi = GetDpiForSystem();
        int w = std::min((int)(r.right - r.left), px(510)), h = std::min((int)(r.bottom - r.top), px(505));
        paper = CreateSolidBrush(RGB(248, 248, 244));
        control = CreateSolidBrush(RGB(255, 254, 250));
        window =
            CreateWindowExW(WS_EX_TOPMOST | WS_EX_TOOLWINDOW, L"CiXiaQuickShelf", L"剪贴板历史",
                            WS_POPUP | WS_BORDER, r.left + (r.right - r.left - w) / 2,
                            r.top + (r.bottom - r.top - h) / 2, w, h, nullptr, nullptr, instance(), this);
        require(window, "无法打开剪贴板历史栏。");
        dpi = GetDpiForWindow(window);
        fonts();
        DWORD roundCorners = 2;
        DwmSetWindowAttribute(window, 33, &roundCorners, sizeof(roundCorners));
        edit = CreateWindowExW(0, L"EDIT", L"", WS_CHILD | WS_VISIBLE | ES_AUTOHSCROLL | WS_TABSTOP, 0, 0, 1,
                               1, window, (HMENU)1, instance(), nullptr);
        list = CreateWindowExW(0, L"LISTBOX", L"",
                               WS_CHILD | WS_VISIBLE | WS_VSCROLL | LBS_HASSTRINGS | LBS_OWNERDRAWFIXED |
                                   LBS_NOINTEGRALHEIGHT | LBS_NOTIFY,
                               0, 0, 1, 1, window, (HMENU)2, instance(), nullptr);
        SendMessageW(edit, WM_SETFONT, (WPARAM)regular, TRUE);
        SendMessageW(edit, EM_SETCUEBANNER, TRUE, (LPARAM)L"搜索文字、文件名或来源");
        SetWindowTextW(list, L"剪贴板记录");
        SetWindowSubclass(edit, controlProc, 1, (DWORD_PTR)this);
        SetWindowSubclass(list, controlProc, 2, (DWORD_PTR)this);
        layout();
        refresh(false);
        ShowWindow(window, SW_SHOW);
        SetForegroundWindow(window);
        SetFocus(edit);
    }
    void refresh(bool keep = true) {
        if (!window || !list)
            return;
        int prior = (int)SendMessageW(list, LB_GETCURSEL, 0, 0);
        string id;
        if (keep && prior >= 0 && prior < (int)filtered.size())
            id = filtered[prior];
        wstring query(GetWindowTextLengthW(edit) + 1, 0);
        query.resize(GetWindowTextW(edit, query.data(), (int)query.size()));
        std::wistringstream wordsInput(lower(query));
        std::vector<wstring> words;
        wstring word;
        while (wordsInput >> word)
            words.push_back(word);
        SendMessageW(list, WM_SETREDRAW, FALSE, 0);
        SendMessageW(list, LB_RESETCONTENT, 0, 0);
        filtered.clear();
        int index = 0;
        for (auto &r : archive.nativeRows()) {
            if (!matches(r, words))
                continue;
            auto key = r.at("id").get<string>();
            if (key == id)
                index = (int)filtered.size();
            filtered.push_back(key);
            wstring accessible =
                wide(r.value("title", "")) + L" · " + typeName(r) + L" · " + wide(r.value("source", ""));
            SendMessageW(list, LB_ADDSTRING, 0, (LPARAM)accessible.c_str());
        }
        if (!filtered.empty())
            SendMessageW(list, LB_SETCURSEL, index, 0);
        SendMessageW(list, WM_SETREDRAW, TRUE, 0);
        InvalidateRect(list, nullptr, TRUE);
        InvalidateRect(window, nullptr, FALSE);
    }
    void dismiss(bool restore) {
        if (!window || closing)
            return;
        closing = true;
        HWND handle = window, old = previous;
        DestroyWindow(handle);
        window = edit = list = previous = nullptr;
        filtered.clear();
        thumbs.clear();
        feedback.clear();
        composing = false;
        for (auto font : {regular, heading, detail})
            if (font)
                DeleteObject(font);
        regular = heading = detail = nullptr;
        DeleteObject(paper);
        DeleteObject(control);
        paper = control = nullptr;
        closing = false;
        if (restore && old && IsWindow(old))
            SetForegroundWindow(old);
    }
};
