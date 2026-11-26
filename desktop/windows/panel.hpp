#pragma once
#include "capture.hpp"
#include "WebView2.h"
#include "media_stream.hpp"
#include <deque>
template <class I, class A, class B> class Callback final : public I {
    ULONG refs = 1;
    IID iid;
    std::function<HRESULT(A, B)> fn;

  public:
    Callback(REFIID id, std::function<HRESULT(A, B)> f) : iid(id), fn(std::move(f)) {}
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id, void **out) override {
        if (!out)
            return E_POINTER;
        *out = nullptr;
        if (id != IID_IUnknown && id != iid)
            return E_NOINTERFACE;
        *out = static_cast<I *>(this);
        AddRef();
        return S_OK;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return ++refs; }
    ULONG STDMETHODCALLTYPE Release() override {
        ULONG left = --refs;
        if (!left)
            delete this;
        return left;
    }
    HRESULT STDMETHODCALLTYPE Invoke(A a, B b) override {
        try {
            return fn(a, b);
        } catch (...) {
            return E_FAIL;
        }
    }
};
#define BIND_HANDLER(Interface, A, B, expression) new Callback<Interface, A, B>(IID_##Interface, expression)
inline bool trustedPage(const wstring &uri) {
    auto end = uri.find_first_of(L"?#");
    wstring base = uri.substr(0, end);
    return base == L"https://app.cixia.local/index.html" ||
           base == L"https://app.cixia.local/desktop/ui/settings.html" ||
           base == L"https://app.cixia.local/desktop/ui/editor.html" ||
           base == L"https://app.cixia.local/desktop/ui/gallery.html";
}
class Panel : public std::enable_shared_from_this<Panel> {
    ICoreWebView2Controller *controller = nullptr;
    ICoreWebView2 *web = nullptr;
    ICoreWebView2Environment *environment = nullptr;
    std::function<std::pair<fs::path, string>(const wstring &)> resolveMedia;
    bool ready = false;
    std::vector<Json> pending;
    std::deque<Json> requests;
    fs::path distribution, userData, mediaPath;
    wstring url;
    std::function<void(Panel &, const Json &)> dispatch;
    std::function<void(HWND)> closed;
    static LRESULT CALLBACK proc(HWND hwnd, UINT m, WPARAM wp, LPARAM lp) {
        auto *p = (Panel *)GetWindowLongPtrW(hwnd, GWLP_USERDATA);
        if (m == WM_NCCREATE) {
            p = (Panel *)((CREATESTRUCTW *)lp)->lpCreateParams;
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, (LONG_PTR)p);
        }
        if (p) {
            if (m == WM_APP + 33) {
                if (!p->requests.empty()) {
                    auto guard = p->shared_from_this();
                    auto request = std::move(p->requests.front());
                    p->requests.pop_front();
                    p->dispatch(*p, request);
                }
                return 0;
            }
            if (m == WM_SIZE && p->controller) {
                p->resize();
                p->controller->put_IsVisible(wp != SIZE_MINIMIZED);
                return 0;
            }
            if (m == WM_SETFOCUS && p->controller) {
                p->controller->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
                return 0;
            }
            if (m == WM_DPICHANGED) {
                auto *r = (RECT *)lp;
                SetWindowPos(hwnd, nullptr, r->left, r->top, r->right - r->left, r->bottom - r->top,
                             SWP_NOZORDER | SWP_NOACTIVATE);
                return 0;
            }
            if (m == WM_CLOSE) {
                auto guard = p->shared_from_this();
                p->shutdown();
                return 0;
            }
        }
        return DefWindowProcW(hwnd, m, wp, lp);
    }
    void resize() {
        RECT r;
        GetClientRect(hwnd, &r);
        controller->put_Bounds(r);
    }
    void failed() {
        if (hwnd)
            MessageBoxW(hwnd,
                        L"无法启动 Microsoft Edge WebView2。请安装或修复 Microsoft WebView2 Evergreen "
                        L"Runtime，然后重新打开词匣。",
                        L"词匣", MB_OK | MB_ICONWARNING);
    }
    void mediaRequest(ICoreWebView2WebResourceRequestedEventArgs *args) {
        ICoreWebView2WebResourceRequest *request = nullptr;
        if (FAILED(args->get_Request(&request)))
            return;
        LPWSTR address = nullptr;
        request->get_Uri(&address);
        auto media = resolveMedia(address ? address : L"");
        CoTaskMemFree(address);
        if (media.first.empty()) {
            request->Release();
            return;
        }
        ICoreWebView2HttpRequestHeaders *headers = nullptr;
        LPWSTR rangeText = nullptr;
        if (SUCCEEDED(request->get_Headers(&headers))) {
            headers->GetHeader(L"Range", &rangeText);
            headers->Release();
        }
        wstring range = rangeText ? rangeText : L"";
        CoTaskMemFree(rangeText);
        request->Release();
        std::error_code ec;
        uintmax_t size = fs::file_size(media.first, ec), begin = 0, end = ec || size == 0 ? 0 : size - 1;
        int code = ec ? 404 : 200;
        wstring reason = ec ? L"Not Found" : L"OK";
        if (!ec && range.rfind(L"bytes=", 0) == 0) {
            try {
                auto spec = range.substr(6);
                auto dash = spec.find(L'-');
                if (dash == wstring::npos || spec.find(L',') != wstring::npos)
                    throw std::runtime_error("range");
                if (dash == 0) {
                    auto suffix = std::stoull(spec.substr(1));
                    if (!suffix)
                        throw std::runtime_error("range");
                    begin = size - std::min<uintmax_t>(suffix, size);
                } else {
                    begin = std::stoull(spec.substr(0, dash));
                    if (dash + 1 < spec.size())
                        end = std::min<uintmax_t>(end, std::stoull(spec.substr(dash + 1)));
                }
                if (begin >= size || end < begin)
                    throw std::runtime_error("range");
                code = 206;
                reason = L"Partial Content";
            } catch (...) {
                code = 416;
                reason = L"Range Not Satisfiable";
            }
        }
        auto length = code < 400 && size ? end - begin + 1 : 0;
        FileRange *stream = code < 400 ? new FileRange(media.first, begin, length) : nullptr;
        if (stream && !stream->valid()) {
            stream->Release();
            stream = nullptr;
            code = 404;
            reason = L"Not Found";
            length = 0;
        }
        wstring responseHeaders = L"Content-Type: " + wide(media.second) +
                                  L"\r\nAccept-Ranges: bytes\r\nAccess-Control-Allow-Origin: "
                                  L"https://app.cixia.local\r\nContent-Length: " +
                                  std::to_wstring(length);
        if (code == 206)
            responseHeaders += L"\r\nContent-Range: bytes " + std::to_wstring(begin) + L"-" +
                               std::to_wstring(end) + L"/" + std::to_wstring(size);
        if (code == 416)
            responseHeaders += L"\r\nContent-Range: bytes */" + std::to_wstring(size);
        ICoreWebView2WebResourceResponse *response = nullptr;
        if (SUCCEEDED(environment->CreateWebResourceResponse(stream, code, reason.c_str(),
                                                             responseHeaders.c_str(), &response))) {
            args->put_Response(response);
            response->Release();
        }
        if (stream)
            stream->Release();
    }
    void attach(ICoreWebView2Controller *c) {
        if (!hwnd)
            return;
        controller = c;
        controller->AddRef();
        require(SUCCEEDED(controller->get_CoreWebView2(&web)), "无法连接 WebView2。");
        ICoreWebView2_3 *v3 = nullptr;
        require(SUCCEEDED(web->QueryInterface(IID_ICoreWebView2_3, (void **)&v3)),
                "WebView2 版本过旧，请更新。");
        auto appMap = v3->SetVirtualHostNameToFolderMapping(L"app.cixia.local", distribution.c_str(),
                                                            COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_DENY_CORS);
        auto mediaMap = v3->SetVirtualHostNameToFolderMapping(L"media.cixia.local", mediaPath.c_str(),
                                                              COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW);
        v3->Release();
        require(SUCCEEDED(appMap) && SUCCEEDED(mediaMap), "无法加载本地界面。");
        ICoreWebView2Settings *cfg = nullptr;
        if (SUCCEEDED(web->get_Settings(&cfg))) {
            cfg->put_AreDevToolsEnabled(FALSE);
            cfg->put_IsStatusBarEnabled(FALSE);
            cfg->put_IsZoomControlEnabled(TRUE);
            cfg->Release();
        }
        EventRegistrationToken token;
        auto weak = weak_from_this();
        auto mediaEvent =
            BIND_HANDLER(ICoreWebView2WebResourceRequestedEventHandler, ICoreWebView2 *,
                         ICoreWebView2WebResourceRequestedEventArgs *, ([weak](auto *, auto *args) {
                             if (auto panel = weak.lock())
                                 panel->mediaRequest(args);
                             return S_OK;
                         }));
        web->AddWebResourceRequestedFilter(L"https://media.cixia.local/*",
                                           COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
        web->add_WebResourceRequested(mediaEvent, &token);
        mediaEvent->Release();
        auto nav = BIND_HANDLER(ICoreWebView2NavigationStartingEventHandler, ICoreWebView2 *,
                                ICoreWebView2NavigationStartingEventArgs *, ([](auto *, auto *args) {
                                    LPWSTR value = nullptr;
                                    if (SUCCEEDED(args->get_Uri(&value))) {
                                        wstring u(value);
                                        CoTaskMemFree(value);
                                        if (!trustedPage(u)) {
                                            args->put_Cancel(TRUE);
                                        }
                                    }
                                    return S_OK;
                                }));
        web->add_NavigationStarting(nav, &token);
        nav->Release();
        auto popup = BIND_HANDLER(
            ICoreWebView2NewWindowRequestedEventHandler, ICoreWebView2 *,
            ICoreWebView2NewWindowRequestedEventArgs *, ([](auto *, auto *args) {
                args->put_Handled(TRUE);
                BOOL user = FALSE;
                args->get_IsUserInitiated(&user);
                LPWSTR value = nullptr;
                if (user && SUCCEEDED(args->get_Uri(&value))) {
                    wstring u(value);
                    CoTaskMemFree(value);
                    if (u.rfind(L"https://", 0) == 0 && u.rfind(L"https://media.cixia.local/", 0) != 0 &&
                        u.rfind(L"https://app.cixia.local/", 0) != 0)
                        ShellExecuteW(nullptr, L"open", u.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
                }
                return S_OK;
            }));
        web->add_NewWindowRequested(popup, &token);
        popup->Release();
        auto message = BIND_HANDLER(ICoreWebView2WebMessageReceivedEventHandler, ICoreWebView2 *,
                                    ICoreWebView2WebMessageReceivedEventArgs *, ([weak](auto *, auto *args) {
                                        auto p = weak.lock();
                                        if (!p || !p->hwnd)
                                            return S_OK;
                                        LPWSTR address = nullptr, body = nullptr;
                                        if (FAILED(args->get_Source(&address)))
                                            return S_OK;
                                        bool ok = trustedPage(address);
                                        CoTaskMemFree(address);
                                        if (ok && SUCCEEDED(args->get_WebMessageAsJson(&body))) {
                                            wstring w(body);
                                            CoTaskMemFree(body);
                                            auto data = Json::parse(utf(w), nullptr, false);
                                            if (data.is_object()) {
                                                p->requests.push_back(std::move(data));
                                                PostMessageW(p->hwnd, WM_APP + 33, 0, 0);
                                            }
                                        }
                                        return S_OK;
                                    }));
        web->add_WebMessageReceived(message, &token);
        message->Release();
        auto done = BIND_HANDLER(ICoreWebView2NavigationCompletedEventHandler, ICoreWebView2 *,
                                 ICoreWebView2NavigationCompletedEventArgs *, ([weak](auto *, auto *args) {
                                     auto p = weak.lock();
                                     if (!p || !p->hwnd)
                                         return S_OK;
                                     BOOL ok = FALSE;
                                     args->get_IsSuccess(&ok);
                                     if (!ok) {
                                         p->failed();
                                         return S_OK;
                                     }
                                     p->ready = true;
                                     auto initial = std::move(p->pending);
                                     p->pending.clear();
                                     for (auto &m : initial)
                                         p->post(m);
                                     p->controller->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
                                     return S_OK;
                                 }));
        web->add_NavigationCompleted(done, &token);
        done->Release();
        resize();
        controller->put_IsVisible(TRUE);
        web->Navigate(url.c_str());
    }

  public:
    string kind;
    HWND hwnd = nullptr;
    Panel(string name, const fs::path &ui, const fs::path &data, const fs::path &media,
          std::function<std::pair<fs::path, string>(const wstring &)> resolver,
          std::function<void(Panel &, const Json &)> bridge, std::function<void(HWND)> close)
        : resolveMedia(std::move(resolver)), distribution(ui), userData(data / L"WebView"),
          mediaPath(media), dispatch(std::move(bridge)), closed(std::move(close)), kind(std::move(name)) {}
    void show() {
        if (hwnd) {
            ShowWindow(hwnd, SW_RESTORE);
            SetForegroundWindow(hwnd);
            return;
        }
        registerClass(L"CiXiaPanel", proc);
        bool settings = kind == "settings", editor = kind == "editor", gallery = kind == "gallery";
        auto dpi = GetDpiForSystem();
        int w = MulDiv(settings ? 680 : gallery ? 730 : editor ? 960 : 1140, dpi, 96);
        int h = MulDiv(settings ? 640 : gallery ? 540 : editor ? 680 : 780, dpi, 96);
        POINT cursor;
        GetCursorPos(&cursor);
        MONITORINFO mi{sizeof(mi)};
        GetMonitorInfoW(MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST), &mi);
        RECT r = mi.rcWork;
        w = std::min(w, (int)(r.right - r.left));
        h = std::min(h, (int)(r.bottom - r.top));
        DWORD ex = editor || gallery ? WS_EX_TOPMOST | WS_EX_TOOLWINDOW : 0;
        const wchar_t *caption = settings  ? L"词匣 · 设置"
                                 : editor  ? L"截图编辑"
                                 : gallery ? L"近期截图"
                                           : L"词匣";
        hwnd = CreateWindowExW(ex, L"CiXiaPanel", caption, WS_OVERLAPPEDWINDOW,
                               r.left + (r.right - r.left - w) / 2, r.top + (r.bottom - r.top - h) / 2, w,
                               h, nullptr, nullptr, instance(), this);
        require(hwnd, "无法创建工作台窗口。");
        ShowWindow(hwnd, SW_SHOW);
        SetForegroundWindow(hwnd);
        url = kind == "main" ? L"https://app.cixia.local/index.html"
                             : L"https://app.cixia.local/desktop/ui/" + wide(kind) + L".html";
        auto dll = LoadLibraryExW((exeDir() / L"WebView2Loader.dll").c_str(), nullptr,
                                  LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
        using Create =
            HRESULT(STDAPICALLTYPE *)(PCWSTR, PCWSTR, ICoreWebView2EnvironmentOptions *,
                                      ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler *);
        static Create envCreate = nullptr;
        if (!envCreate && dll)
            envCreate = (Create)GetProcAddress(dll, "CreateCoreWebView2EnvironmentWithOptions");
        else if (dll)
            FreeLibrary(dll);
        if (!envCreate) {
            failed();
            return;
        }
        auto weak = weak_from_this();
        auto env = BIND_HANDLER(ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler, HRESULT,
                                ICoreWebView2Environment *, ([weak](HRESULT res, auto *e) {
                                    auto p = weak.lock();
                                    if (!p || !p->hwnd)
                                        return S_OK;
                                    if (FAILED(res) || !e) {
                                        p->failed();
                                        return S_OK;
                                    }
                                    p->environment = e;
                                    e->AddRef();
                                    auto controller = BIND_HANDLER(
                                        ICoreWebView2CreateCoreWebView2ControllerCompletedHandler, HRESULT,
                                        ICoreWebView2Controller *, ([weak](HRESULT hr, auto *c) {
                                            if (auto p = weak.lock()) {
                                                if (FAILED(hr) || !c)
                                                    p->failed();
                                                else
                                                    try {
                                                        p->attach(c);
                                                    } catch (...) {
                                                        p->failed();
                                                    }
                                            }
                                            return S_OK;
                                        }));
                                    auto hr = e->CreateCoreWebView2Controller(p->hwnd, controller);
                                    controller->Release();
                                    if (FAILED(hr))
                                        p->failed();
                                    return S_OK;
                                }));
        HRESULT hr = envCreate(nullptr, userData.c_str(), nullptr, env);
        env->Release();
        if (FAILED(hr))
            failed();
    }
    void post(const Json &data) {
        if (!ready || !web) {
            if (data.value("event", "") != "history.changed")
                pending.push_back(data);
            return;
        }
        auto msg = wide(data.dump(-1, ' ', false, Json::error_handler_t::replace));
        web->PostWebMessageAsJson(msg.c_str());
    }
    void shutdown() {
        HWND current = hwnd;
        if (!current)
            return;
        hwnd = nullptr;
        ready = false;
        pending.clear();
        if (web) {
            web->Release();
            web = nullptr;
        }
        if (controller) {
            controller->Close();
            controller->Release();
            controller = nullptr;
        }
        if (environment) {
            environment->Release();
            environment = nullptr;
        }
        SetWindowLongPtrW(current, GWLP_USERDATA, 0);
        DestroyWindow(current);
        closed(current);
    }
};
