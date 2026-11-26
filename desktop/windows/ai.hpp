#pragma once
#include "ai_protocol.hpp"
#include "win.hpp"
#include <winhttp.h>

namespace ai {
inline DATA_BLOB blob(const void *data, size_t size) {
    check(size <= MAXDWORD, "凭据过长。");
    return {DWORD(size), (BYTE *)data};
}
inline string protectKey(const string &key, const string &base) {
    if (key.empty())
        return {};
    auto input = blob(key.data(), key.size()), salt = blob(base.data(), base.size());
    DATA_BLOB encrypted{};
    check(CryptProtectData(&input, L"词匣 AI", &salt, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN,
                           &encrypted),
          "Windows 无法保护 API 密钥，设置未保存。");
    std::unique_ptr<BYTE, decltype(&LocalFree)> owner(encrypted.pbData, LocalFree);
    return to64(Bytes(encrypted.pbData, encrypted.pbData + encrypted.cbData));
}
inline string unprotectKey(const string &cipher, const string &base) {
    if (cipher.empty())
        return {};
    auto bytes = from64(cipher);
    auto input = blob(bytes.data(), bytes.size()), salt = blob(base.data(), base.size());
    DATA_BLOB clear{};
    check(CryptUnprotectData(&input, nullptr, &salt, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN, &clear),
          "当前 Windows 用户无法读取这份密钥，请重新填写。");
    std::unique_ptr<BYTE, decltype(&LocalFree)> owner(clear.pbData, LocalFree);
    string result((char *)clear.pbData, clear.cbData);
    SecureZeroMemory(clear.pbData, clear.cbData);
    return result;
}
struct Config {
    string base, cipher;
    Json models = Json::array();
    Json publicFields() const {
        return {{"baseURL", base}, {"hasKey", !cipher.empty()}, {"models", models}};
    }
    static Config load(const fs::path &file) {
        if (!fs::exists(file))
            return {};
        std::ifstream input(file, std::ios::binary);
        auto j = Json::parse(input, nullptr, false);
        check(j.is_object() && j.contains("baseURL") && j["baseURL"].is_string() && j.contains("models") &&
                  j.contains("credential") && j["credential"].is_string(),
              "模型设置文件读取失败。");
        Config result;
        result.base = j["baseURL"].get<string>();
        result.cipher = j["credential"].get<string>();
        result.models = selectedModels(j["models"]);
        return result;
    }
    Config save(const Json &p, const fs::path &file) const {
        Config next;
        const string value = trim(p.at("baseURL").get<string>());
        if (!value.empty())
            next.base = Endpoint(value).base;
        next.models = selectedModels(p.at("models"));
        check(!next.base.empty() || next.models.empty(), "请先填写这些模型的接口地址。");
        if (p.contains("apiKey")) {
            const auto key = keyValue(p.at("apiKey").get<string>());
            check(!next.base.empty() || key.empty(), "请先填写密钥对应的接口地址。");
            next.cipher = protectKey(key, next.base);
        } else if (next.base == base)
            next.cipher = cipher;
        writeJson(file, {{"baseURL", next.base}, {"models", next.models}, {"credential", next.cipher}});
        return next;
    }
    string keyFor(const Endpoint &endpoint, const Json &p) const {
        if (p.contains("apiKey"))
            return keyValue(p.at("apiKey").get<string>());
        return endpoint.base == base ? unprotectKey(cipher, base) : "";
    }
};
using Internet = std::unique_ptr<void, decltype(&WinHttpCloseHandle)>;
inline Json fetch(const Endpoint &endpoint, const string &key, const string &suffix, const string &body) {
    Internet session(WinHttpOpen(L"CiXia/1.3", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_NO_PROXY_NAME,
                                 WINHTTP_NO_PROXY_BYPASS, 0),
                     WinHttpCloseHandle);
    check(bool(session), "无法启动网络请求。");
    check(WinHttpSetTimeouts(session.get(), 10000, 15000, 30000, 90000), "无法设置网络超时。");
    Internet connection(
        WinHttpConnect(session.get(), wide(endpoint.host).c_str(), INTERNET_PORT(endpoint.port), 0),
        WinHttpCloseHandle);
    check(bool(connection), "无法连接模型接口，请检查主机和端口。");
    Internet request(WinHttpOpenRequest(connection.get(), body.empty() ? L"GET" : L"POST",
                                        wide(endpoint.path + suffix).c_str(), nullptr, WINHTTP_NO_REFERER,
                                        WINHTTP_DEFAULT_ACCEPT_TYPES,
                                        endpoint.secure ? WINHTTP_FLAG_SECURE : 0),
                     WinHttpCloseHandle);
    check(bool(request), "无法创建模型请求，请检查接口路径。");
    DWORD redirects = WINHTTP_OPTION_REDIRECT_POLICY_NEVER;
    DWORD disable = WINHTTP_DISABLE_COOKIES | WINHTTP_DISABLE_AUTHENTICATION;
    check(WinHttpSetOption(request.get(), WINHTTP_OPTION_REDIRECT_POLICY, &redirects, sizeof(redirects)) &&
              WinHttpSetOption(request.get(), WINHTTP_OPTION_DISABLE_FEATURE, &disable, sizeof(disable)),
          "无法初始化请求的身份验证选项。");
    wstring headers = L"Accept: application/json\r\n";
    if (!body.empty())
        headers += L"Content-Type: application/json; charset=utf-8\r\n";
    if (!key.empty())
        headers += L"Authorization: Bearer " + wide(key) + L"\r\n";
    check(body.size() <= MAXDWORD, "提示词内容过大。");
    const BOOL sent = WinHttpSendRequest(request.get(), headers.c_str(), DWORD(headers.size()),
                                         body.empty() ? WINHTTP_NO_REQUEST_DATA : (void *)body.data(),
                                         DWORD(body.size()), DWORD(body.size()), 0);
    SecureZeroMemory(headers.data(), headers.size() * sizeof(wchar_t));
    check(sent && WinHttpReceiveResponse(request.get(), nullptr),
          "网络请求失败或超时，请检查网络、接口地址和证书。");
    DWORD code = 0, size = sizeof(code);
    check(WinHttpQueryHeaders(request.get(), WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, nullptr,
                              &code, &size, WINHTTP_NO_HEADER_INDEX),
          "无法读取接口状态。");
    if (code < 200 || code >= 300) {
        string reason = code >= 300 && code < 400    ? "请填写最终地址，接口请求不会跟随跳转。"
                        : code == 401 || code == 403 ? "请检查 API 密钥和该模型的访问权限。"
                        : code == 404                ? "请检查接口路径与模型名。"
                        : code == 429                ? "请求频率或账户额度受限。"
                                                     : "请检查接口服务状态。";
        throw std::runtime_error("模型接口返回 HTTP " + std::to_string(code) + "。" + reason);
    }
    string response;
    char buffer[16384];
    DWORD count;
    do {
        check(WinHttpReadData(request.get(), buffer, sizeof(buffer), &count), "读取接口响应失败。");
        check(response.size() + count <= 8 * 1024 * 1024, "接口响应过大。");
        response.append(buffer, count);
    } while (count);
    auto parsed = Json::parse(response, nullptr, false);
    check(parsed.is_object(), "接口响应不是有效的 JSON 对象。");
    return parsed;
}
} // namespace ai
