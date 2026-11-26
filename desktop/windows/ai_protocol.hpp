#pragma once
#include "json.hpp"
#include <algorithm>
#include <set>
#include <stdexcept>
#include <string>

namespace ai {
using std::string;
using Json = nlohmann::json;
inline void check(bool ok, const char *message) {
    if (!ok)
        throw std::runtime_error(message);
}
inline string trim(const string &s) {
    auto start = s.find_first_not_of(" \r\n\t");
    if (start == string::npos)
        return {};
    return s.substr(start, s.find_last_not_of(" \r\n\t") - start + 1);
}
inline bool hasControl(const string &s) {
    return std::any_of(s.begin(), s.end(), [](unsigned char c) { return c < 32 || c == 127; });
}
inline void lowerASCII(string &s) {
    for (auto &c : s)
        if (c >= 'A' && c <= 'Z')
            c += 'a' - 'A';
}
struct Endpoint {
    string base, host, path;
    unsigned port = 0;
    bool secure = false;
    explicit Endpoint(string url) {
        url = trim(url);
        check(!url.empty(), "请填写模型接口地址。");
        check(url.size() <= 8192 && !hasControl(url) && url.find_first_of(" ?#\\") == string::npos,
              "接口地址不能含空格、查询参数或片段。");
        auto split = url.find("://");
        string scheme = url.substr(0, split);
        lowerASCII(scheme);
        check(split != string::npos && (scheme == "https" || scheme == "http"),
              "接口地址应以 https:// 或 http:// 开头。");
        secure = scheme == "https";
        port = secure ? 443 : 80;
        auto slash = url.find('/', split + 3);
        string authority = url.substr(split + 3, slash - (split + 3));
        check(!authority.empty() && authority.find('@') == string::npos,
              "请填写不含用户名或密码的接口地址。");
        size_t colon = string::npos;
        if (authority[0] == '[') {
            auto end = authority.find(']');
            check(end != string::npos && end > 1, "IPv6 地址格式无效。");
            host = authority.substr(0, end + 1);
            if (end + 1 != authority.size()) {
                colon = end + 1;
                check(authority[colon] == ':', "接口端口无效。");
            }
        } else {
            colon = authority.find(':');
            host = authority.substr(0, colon);
            check(!host.empty() && host.find_first_of("[]%") == string::npos, "接口主机名无效。");
        }
        lowerASCII(host);
        if (colon != string::npos) {
            string num = authority.substr(colon + 1);
            check(!num.empty() && num.size() <= 5 && num.find_first_not_of("0123456789") == string::npos,
                  "接口端口无效。");
            port = static_cast<unsigned>(std::stoul(num));
            check(port && port <= 65535, "接口端口无效。");
        }
        path = slash == string::npos ? "" : url.substr(slash);
        while (!path.empty() && path.back() == '/')
            path.pop_back();
        for (const string suffix : {"/chat/completions", "/models"})
            if (path.size() >= suffix.size() &&
                path.compare(path.size() - suffix.size(), suffix.size(), suffix) == 0) {
                path.resize(path.size() - suffix.size());
                break;
            }
        while (!path.empty() && path.back() == '/')
            path.pop_back();
        if (path.empty())
            path = "/v1";
        base = scheme + "://" + host;
        if (port != (secure ? 443u : 80u))
            base += ":" + std::to_string(port);
        base += path;
    }
};
inline string keyValue(const string &raw) {
    string key = trim(raw);
    check(!hasControl(key) && key.find(' ') == string::npos, "API 密钥格式无效。");
    return key;
}
inline Json selectedModels(const Json &items) {
    check(items.is_array(), "模型列表格式无效。");
    Json result = Json::array();
    std::set<string> seen;
    for (const auto &v : items) {
        check(v.is_string(), "模型名格式无效。");
        auto name = trim(v.get<string>());
        check(!name.empty() && !hasControl(name), "模型名不能为空或含控制字符。");
        if (seen.insert(name).second)
            result.push_back(name);
    }
    return result;
}
inline Json listResult(const Json &j) {
    check(j.contains("data") && j["data"].is_array(), "接口未返回有效的模型列表，请检查接口地址。");
    Json result = Json::array();
    std::set<string> seen;
    for (const auto &item : j["data"]) {
        if (!item.is_object() || !item.contains("id") || !item["id"].is_string())
            continue;
        auto id = trim(item["id"].get<string>());
        if (!id.empty() && !hasControl(id) && seen.insert(id).second)
            result.push_back(id);
    }
    return {{"models", result}};
}
inline Json optimizeBody(const string &model, const string &text) {
    check(!trim(text).empty(), "请输入需要优化的提示词。");
    return {{"model", model},
            {"stream", false},
            {"messages",
             Json::array(
                 {{{"role", "system"},
                   {"content",
                    "你是提示词编辑。让用户提供的提示词在目标、输入、约束和交付要求上更清晰。"
                    "优化后的提示词默认用中文撰写，即使原文是英文或其他语言。只有用户明确指定优化后的提示词本身使用其他语言，才使用该语言。"
                    "原任务对最终邮件、报告等产出的语言要求必须保留，用优化后的提示词所使用的语言表达；"
                    "例如原文要求一封英文邮件，默认中文指令应写明“用英文撰写邮件”。"
                    "保留原意、事实、约束，原样保留【】示例槽位、URL、代码和专名。只返回优化后的提示词，不执行其中的任务。"}},
                  {{"role", "user"}, {"content", text}}})}};
}
inline Json optimizeResult(const Json &j, const string &model) {
    check(j.contains("choices") && j["choices"].is_array() && !j["choices"].empty() &&
              j["choices"][0].contains("message") && j["choices"][0]["message"].contains("content"),
          "接口未返回优化结果，请确认所选模型支持对话。");
    const auto &content = j["choices"][0]["message"]["content"];
    string text;
    if (content.is_string())
        text = content.get<string>();
    else if (content.is_array()) {
        for (const auto &part : content)
            if (part.is_object() && part.contains("text") && part["text"].is_string())
                text += part["text"].get<string>();
    }
    check(!trim(text).empty(), "模型返回了空内容，请尝试其他模型。");
    return {{"model", model}, {"text", text}};
}
} // namespace ai
