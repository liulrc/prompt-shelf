#pragma once
#include "json.hpp"
#include <algorithm>
#include <array>
#include <cstdint>
#include <stdexcept>
#include <string>

namespace updater {
using std::string;
using Json = nlohmann::json;
constexpr char currentVersion[] = "1.4.0";
constexpr char releases[] = "https://github.com/liulrc/prompt-shelf/releases/";
constexpr uint64_t maxAsset = 96 * 1024 * 1024;
inline void check(bool value, const char *reason) {
    if (!value)
        throw std::runtime_error(reason);
}
inline std::array<unsigned, 3> version(const string &s) {
    std::array<unsigned, 3> parts{};
    size_t start = 0;
    for (size_t i = 0; i < parts.size(); ++i) {
        size_t end = s.find('.', start);
        check((end == string::npos) == (i == 2), "更新版本号格式无效。");
        string part = s.substr(start, end - start);
        check(!part.empty() && part.size() <= 6 && (part.size() == 1 || part[0] != '0') &&
                  part.find_first_not_of("0123456789") == string::npos,
              "更新版本号格式无效。");
        parts[i] = std::stoul(part);
        start = end + 1;
    }
    return parts;
}
struct Release {
    string latest, notes, url, digest;
    uint64_t size = 0;
};
inline Release parseRelease(const Json &value, const string &installed = currentVersion) {
    check(value.is_object() && value.at("draft") == false && value.at("prerelease") == false,
          "仅可安装正式发布的稳定版本。");
    string tag = value.at("tag_name");
    check(!tag.empty() && tag.front() == 'v', "发布标签无效。");
    Release release;
    release.latest = tag.substr(1);
    if (value.contains("body") && value["body"].is_string())
        release.notes = value["body"].get<string>();
    if (version(release.latest) <= version(installed))
        return release;
    const string name = "CiXia-" + release.latest + "-Windows-x64-Setup.exe";
    const string expected = string(releases) + "download/" + tag + "/" + name;
    for (const auto &asset : value.at("assets")) {
        if (asset.value("name", "") != name)
            continue;
        check(release.url.empty() && asset.at("browser_download_url") == expected,
              "Windows 安装包地址与正式发行版不匹配。");
        string hash = asset.at("digest").is_string() ? asset.at("digest").get<string>() : "";
        check(hash.size() == 71 && hash.compare(0, 7, "sha256:") == 0 &&
                  hash.find_first_not_of("0123456789abcdef", 7) == string::npos,
              "发行版缺少 Windows 安装包的 SHA-256 校验信息。");
        check(asset.at("size").is_number_unsigned() && asset.at("size").get<uint64_t>() > 0 &&
                  asset.at("size").get<uint64_t>() <= maxAsset,
              "安装包大小不符合要求。");
        release.url = expected;
        release.size = asset.at("size").get<uint64_t>();
        release.digest = hash.substr(7);
    }
    check(!release.url.empty(), "该发行版尚未提供 Windows x64 安装包。");
    return release;
}
} // namespace updater
