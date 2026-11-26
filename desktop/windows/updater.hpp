#pragma once
#include "win.hpp"
#include "update_protocol.hpp"
#include <winhttp.h>
#include <shobjidl.h>
#include <mutex>

namespace updater {
using Internet = std::unique_ptr<void, decltype(&WinHttpCloseHandle)>;
using Sink = std::function<void(const uint8_t *, DWORD)>;
constexpr UINT stateMessage = WM_APP + 24;
constexpr UINT_PTR timer = 8;
const wstring metadataURL = L"https://api.github.com/repos/liulrc/prompt-shelf/releases/latest";
const wstring fallbackURL = L"https://github.com/liulrc/prompt-shelf/releases/latest/download/update.json";

inline void fetch(wstring url, uint64_t limit, const Sink &sink) {
    Internet session(WinHttpOpen(L"CiXia-Updater/1.4", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                                 WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0),
                     WinHttpCloseHandle);
    check(bool(session) && WinHttpSetTimeouts(session.get(), 8000, 12000, 20000, 30000),
          "无法连接更新服务。");
    for (int hop = 0; hop < 6; ++hop) {
        URL_COMPONENTS u{sizeof(u)};
        u.dwHostNameLength = u.dwUrlPathLength = u.dwExtraInfoLength = u.dwUserNameLength =
            u.dwPasswordLength = DWORD(-1);
        check(url.size() <= 16384 && url.find_first_of(L"\r\n\\#") == wstring::npos &&
                  WinHttpCrackUrl(url.c_str(), DWORD(url.size()), 0, &u) &&
                  u.nScheme == INTERNET_SCHEME_HTTPS && u.nPort == 443 && u.dwUserNameLength == 0 &&
                  u.dwPasswordLength == 0,
              "更新服务提供了不受支持的地址。");
        wstring host(u.lpszHostName, u.dwHostNameLength);
        check(host == L"github.com" || host == L"api.github.com" ||
                  host == L"release-assets.githubusercontent.com" || host == L"objects.githubusercontent.com",
              "更新地址未通过来源校验。");
        wstring path(u.lpszUrlPath, u.dwUrlPathLength);
        if (u.dwExtraInfoLength)
            path.append(u.lpszExtraInfo, u.dwExtraInfoLength);
        Internet connection(WinHttpConnect(session.get(), host.c_str(), 443, 0), WinHttpCloseHandle);
        check(bool(connection), "无法连接更新服务。");
        Internet request(WinHttpOpenRequest(connection.get(), L"GET", path.c_str(), nullptr,
                                            WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES,
                                            WINHTTP_FLAG_SECURE | WINHTTP_FLAG_REFRESH),
                         WinHttpCloseHandle);
        DWORD policy = WINHTTP_OPTION_REDIRECT_POLICY_NEVER;
        check(bool(request) &&
                  WinHttpSetOption(request.get(), WINHTTP_OPTION_REDIRECT_POLICY, &policy, sizeof(policy)) &&
                  WinHttpSendRequest(request.get(), WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA,
                                     0, 0, 0) &&
                  WinHttpReceiveResponse(request.get(), nullptr),
              "连接更新服务失败，请检查网络后重试。");
        DWORD status = 0, length = sizeof(status);
        check(WinHttpQueryHeaders(request.get(), WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                                  nullptr, &status, &length, nullptr),
              "更新服务未返回有效状态。");
        if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
            DWORD bytes = 0;
            WinHttpQueryHeaders(request.get(), WINHTTP_QUERY_LOCATION, nullptr, nullptr, &bytes, nullptr);
            check(bytes > sizeof(wchar_t) && bytes <= 32768, "更新服务未返回有效的下载地址。");
            std::vector<wchar_t> target(bytes / sizeof(wchar_t));
            check(WinHttpQueryHeaders(request.get(), WINHTTP_QUERY_LOCATION, nullptr, target.data(), &bytes,
                                      nullptr),
                  "读取更新地址失败。");
            url = target.data();
            continue;
        }
        check(status == 200, "更新服务暂时无法访问，请稍后重试。");
        uint64_t total = 0;
        std::array<uint8_t, 65536> buffer;
        DWORD received = 0;
        do {
            check(WinHttpReadData(request.get(), buffer.data(), DWORD(buffer.size()), &received),
                  "更新下载中断，请重试。");
            total += received;
            check(total <= limit, "下载内容超过发行版声明的大小。");
            if (received)
                sink(buffer.data(), received);
        } while (received);
        return;
    }
    throw std::runtime_error("更新地址重定向次数过多。");
}
inline Release latestRelease(const string &installed = currentVersion) {
    string data;
    auto append = [&data](const uint8_t *p, DWORD n) { data.append(reinterpret_cast<const char *>(p), n); };
    try {
        fetch(metadataURL, 1024 * 1024, append);
    } catch (const std::exception &) {
        data.clear();
        fetch(fallbackURL, 1024 * 1024, append);
    }
    auto json = Json::parse(data, nullptr, false);
    check(json.is_object(), "无法识别更新服务返回的版本信息。");
    return parseRelease(json, installed);
}
struct Package {
    fs::path path;
    HANDLE lock = INVALID_HANDLE_VALUE;
    bool launched = false;
    ~Package() {
        if (lock != INVALID_HANDLE_VALUE)
            CloseHandle(lock);
        if (!launched && !path.empty())
            DeleteFileW(path.c_str());
    }
};
inline string digest(HANDLE file) {
    struct Hash {
        HCRYPTPROV provider = 0;
        HCRYPTHASH value = 0;
        ~Hash() {
            if (value)
                CryptDestroyHash(value);
            if (provider)
                CryptReleaseContext(provider, 0);
        }
    } hash;
    check(CryptAcquireContextW(&hash.provider, nullptr, nullptr, PROV_RSA_AES, CRYPT_VERIFYCONTEXT) &&
              CryptCreateHash(hash.provider, CALG_SHA_256, 0, 0, &hash.value),
          "无法启动 Windows SHA-256 校验。");
    std::array<BYTE, 65536> buffer;
    DWORD count = 0;
    do {
        check(ReadFile(file, buffer.data(), DWORD(buffer.size()), &count, nullptr),
              "无法读取已下载的安装包。");
        if (count)
            check(CryptHashData(hash.value, buffer.data(), count, 0), "无法校验安装包。");
    } while (count);
    BYTE bytes[32]{};
    DWORD length = sizeof(bytes);
    check(CryptGetHashParam(hash.value, HP_HASHVAL, bytes, &length, 0) && length == 32, "无法读取校验结果。");
    string result;
    const char hex[] = "0123456789abcdef";
    for (auto b : bytes) {
        result += hex[b >> 4];
        result += hex[b & 15];
    }
    return result;
}
inline void markInternetFile(const fs::path &path, const string &origin) {
    IAttachmentExecute *policy = nullptr;
    check(SUCCEEDED(CoCreateInstance(CLSID_AttachmentServices, nullptr, CLSCTX_INPROC_SERVER,
                                     IID_IAttachmentExecute, reinterpret_cast<void **>(&policy))),
          "无法使用 Windows 附件安全检查。");
    std::unique_ptr<IAttachmentExecute, void (*)(IAttachmentExecute *)> owner(policy,
                                                                              [](auto *p) { p->Release(); });
    check(SUCCEEDED(policy->SetLocalPath(path.c_str())) &&
              SUCCEEDED(policy->SetSource(wide(origin).c_str())) && SUCCEEDED(policy->Save()),
          "Windows 未允许保存此安装包，请检查系统安全提示后重试。");
}
struct Event {
    string phase, error;
    Release release;
    std::shared_ptr<Package> package;
    int progress = 0;
};
struct Mail {
    std::mutex mutex;
    HWND hwnd = nullptr;
    std::vector<Event> events;
    void post(Event event) {
        std::lock_guard<std::mutex> guard(mutex);
        if (!hwnd)
            return;
        events.push_back(std::move(event));
        PostMessageW(hwnd, stateMessage, 0, 0);
    }
};
inline std::shared_ptr<Package> download(const fs::path &folder, const Release &release,
                                         const std::shared_ptr<Mail> &mail) {
    fs::create_directories(folder);
    auto package = std::make_shared<Package>();
    const auto path = folder / (L"CiXia-" + wide(genId()) + L"-Setup.exe");
    HANDLE writer =
        CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
    check(writer != INVALID_HANDLE_VALUE, "无法创建更新文件，请检查可用空间。");
    package->path = path;
    uint64_t total = 0;
    int last = -5;
    {
        std::unique_ptr<void, decltype(&CloseHandle)> handle(writer, CloseHandle);
        fetch(wide(release.url), release.size, [&](const uint8_t *p, DWORD n) {
            DWORD written = 0;
            check(WriteFile(writer, p, n, &written, nullptr) && written == n,
                  "无法写入更新文件，请检查可用空间。");
            total += n;
            int percent = int(total * 100 / release.size);
            if (percent >= last + 5) {
                mail->post({"downloading", {}, {}, {}, percent});
                last = percent;
            }
        });
        check(total == release.size && FlushFileBuffers(writer), "安装包下载不完整，请重试。");
    }
    mail->post({"verifying"});
    markInternetFile(package->path, release.url);
    package->lock = CreateFileW(package->path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING,
                                FILE_FLAG_SEQUENTIAL_SCAN, nullptr);
    check(package->lock != INVALID_HANDLE_VALUE, "无法为安装包进行完整性校验。");
    check(digest(package->lock) == release.digest, "安装包 SHA-256 校验失败，已取消安装。");
    return package;
}
struct Job {
    std::shared_ptr<Mail> mail;
    fs::path folder;
    Release release;
    static void CALLBACK run(PTP_CALLBACK_INSTANCE, void *context) noexcept {
        std::unique_ptr<Job> job(static_cast<Job *>(context));
        const HRESULT com = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
        try {
            if (job->release.url.empty()) {
                auto release = latestRelease();
                Event result{release.url.empty() ? "current" : "available"};
                result.release = std::move(release);
                job->mail->post(std::move(result));
            } else {
                check(SUCCEEDED(com), "无法启动系统附件检查。");
                auto package = download(job->folder, job->release, job->mail);
                job->mail->post({"ready", {}, {}, std::move(package), 100});
            }
        } catch (const nlohmann::json::exception &) {
            job->mail->post({"error", "发行版更新清单格式无效或缺少必要信息。"});
        } catch (const std::exception &e) {
            job->mail->post({"error", e.what()});
        }
        if (SUCCEEDED(com))
            CoUninitialize();
    }
};
class Manager {
    fs::path prefs, folder;
    std::shared_ptr<Mail> mail = std::make_shared<Mail>();
    std::function<void(const Json &)> notify;
    std::function<bool(bool)> safe;
    HWND root = nullptr;
    Release release;
    std::shared_ptr<Package> package;
    string phase = "idle", error, lastChecked;
    int progress = 0;
    bool automatic = false, manual = false;
    ULONGLONG nextCheck = 0, nextCleanup = 0;
    void pruneOldPackages() {
        std::error_code ec;
        for (fs::directory_iterator it(folder, ec), end; !ec && it != end; it.increment(ec)) {
            const auto path = it->path();
            const auto name = path.filename().wstring();
            if (package && path == package->path)
                continue;
            if (name.size() == 52 && name.rfind(L"CiXia-", 0) == 0 && name.substr(42) == L"-Setup.exe" &&
                name.substr(6, 36).find_first_not_of(L"0123456789abcdefABCDEF-") == wstring::npos)
                DeleteFileW(path.c_str());
        }
    }
    void changed() { notify(state()); }
    void save() { writeJson(prefs, {{"automatic", automatic}, {"lastChecked", lastChecked}}); }
    bool working() const {
        return phase == "checking" || phase == "downloading" || phase == "verifying" || phase == "installing";
    }
    void start(bool downloading) {
        auto job = std::make_unique<Job>(Job{mail, folder, downloading ? release : Release{}});
        if (!TrySubmitThreadpoolCallback(Job::run, job.get(), nullptr))
            throw std::runtime_error("系统暂时无法运行更新任务。");
        job.release();
        phase = downloading ? "downloading" : "checking";
        error.clear();
        progress = 0;
        changed();
    }
    void install() {
        if (!package || phase != "ready" || (!manual && !automatic))
            return;
        if (!safe(manual)) {
            string reason = manual ? "请保存并关闭正在编辑的内容、截图和置顶窗口，随后将自动安装。"
                                   : "将在词匣工作窗口全部关闭后安装。";
            if (error != reason) {
                error = reason;
                changed();
            }
            return;
        }
        const auto parameters = L"/S /CIXIAUPGRADE /WAITPID=" + std::to_wstring(GetCurrentProcessId()) +
                                (manual ? L"" : L" /CIXIABACKGROUND") + L" /D=" + exeDir().wstring();
        SHELLEXECUTEINFOW info{sizeof(info)};
        info.fMask = SEE_MASK_NOASYNC | SEE_MASK_NOCLOSEPROCESS;
        info.lpVerb = L"open";
        info.hwnd = root;
        info.lpFile = package->path.c_str();
        info.lpParameters = parameters.c_str();
        info.nShow = SW_SHOWNORMAL;
        phase = "installing";
        error.clear();
        changed();
        if (!ShellExecuteExW(&info) || !info.hProcess) {
            phase = "error";
            manual = false;
            error = "Windows 未启动安装程序。请检查系统提示后重新检查更新。";
            nextCheck = GetTickCount64() + 3600000;
            changed();
            return;
        }
        package->launched = true;
        CloseHandle(info.hProcess);
        PostMessageW(root, WM_CLOSE, 0, 0);
    }

  public:
    explicit Manager(const fs::path &home) : prefs(home / L"update.json"), folder(home / L"Updates") {}
    void init(HWND window, std::function<void(const Json &)> listener, std::function<bool(bool)> isSafe) {
        notify = std::move(listener);
        safe = std::move(isSafe);
        root = window;
        mail->hwnd = window;
        std::ifstream input(prefs, std::ios::binary);
        const auto saved = Json::parse(input, nullptr, false);
        if (saved.is_object()) {
            automatic = saved.contains("automatic") && saved["automatic"] == true;
            if (saved.contains("lastChecked") && saved["lastChecked"].is_string())
                lastChecked = saved["lastChecked"];
        }
        // NSIS may still be reading its own executable when it relaunches the application.
        nextCleanup = GetTickCount64() + 15 * 60000;
        if (DeleteFileW((prefs.parent_path() / L"update-failed.flag").c_str())) {
            phase = "error";
            error = "上次安装未完成。请关闭占用安装目录的程序，然后重试。";
        }
        nextCheck = GetTickCount64() + 15000;
        SetTimer(root, timer, 15000, nullptr);
    }
    void stop() {
        KillTimer(root, timer);
        std::lock_guard<std::mutex> guard(mail->mutex);
        mail->hwnd = nullptr;
        mail->events.clear();
    }
    Json state() const {
        return {{"current", currentVersion},
                {"latest", release.latest},
                {"phase", phase},
                {"lastChecked", lastChecked},
                {"notes", release.notes},
                {"automatic", automatic},
                {"error", error},
                {"progress", progress}};
    }
    void preferences(bool enable) {
        bool old = automatic;
        automatic = enable;
        try {
            save();
        } catch (...) {
            automatic = old;
            throw;
        }
        if (enable && !old)
            nextCheck = 0;
        changed();
        tick();
    }
    void checkNow() {
        if (working() || phase == "ready")
            return;
        release = {};
        package.reset();
        manual = false;
        start(false);
        nextCheck = GetTickCount64() + 12ULL * 3600000;
    }
    void apply() {
        if (phase == "ready") {
            manual = true;
            install();
        } else if (phase == "available") {
            manual = true;
            start(true);
        } else if (!working())
            throw std::runtime_error("请先检查可用更新。");
    }
    void receive() {
        std::vector<Event> events;
        {
            std::lock_guard<std::mutex> guard(mail->mutex);
            events.swap(mail->events);
        }
        for (auto &item : events) {
            const bool wasChecking = phase == "checking";
            phase = item.phase;
            error = item.error;
            progress = item.progress;
            if (wasChecking) {
                lastChecked = nowIso();
                try {
                    save();
                } catch (...) { /* The last check remains visible in this session. */
                }
            }
            if (phase == "available" || phase == "current")
                release = std::move(item.release);
            if (phase == "ready")
                package = std::move(item.package);
            if (phase == "error") {
                manual = false;
                nextCheck = GetTickCount64() + 3600000;
            }
            changed();
        }
        tick();
    }
    void tick() {
        const auto now = GetTickCount64();
        if (!working() && now >= nextCleanup) {
            pruneOldPackages();
            nextCleanup = now + 12ULL * 3600000;
        }
        if (phase == "ready")
            install();
        else if (automatic && phase == "available")
            start(true);
        else if (automatic && !working() && GetTickCount64() >= nextCheck)
            checkNow();
    }
};
} // namespace updater
