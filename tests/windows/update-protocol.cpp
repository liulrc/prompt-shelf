#include "../../desktop/windows/update_protocol.hpp"
#include <cassert>
#include <iostream>
using namespace updater;
int main() {
    const string asset = "CiXia-1.10.0-Windows-x64-Setup.exe";
    const string url = string(releases) + "download/v1.10.0/" + asset;
    const string hash(64, 'a');
    Json release = {{"draft", false},
                    {"prerelease", false},
                    {"tag_name", "v1.10.0"},
                    {"body", "notes"},
                    {"assets", Json::array({{{"name", asset},
                                             {"size", size_t(2050)},
                                             {"digest", "sha256:" + hash},
                                             {"browser_download_url", url}}})}};
    const auto found = parseRelease(release);
    assert(found.url == url && found.digest == hash && found.size == 2050 && found.notes == "notes");
    assert(parseRelease(release, "1.10.0").url.empty());
    assert(parseRelease(release, "2.0.0").url.empty());
    auto rejects = [](auto f) {
        try {
            f();
            return false;
        } catch (const std::exception &) {
            return true;
        }
    };
    for (const auto *bad :
         {"", "1", "1.2", "1.2.3.4", "1.2.3-beta", "0.1.00", "1.010.1", "+1.0.0", "1/2.3.4", "9999999.0.0"})
        assert(rejects([&] { version(bad); }));
    for (const auto *key : {"draft", "prerelease"}) {
        auto bad = release;
        bad[key] = true;
        assert(rejects([&] { parseRelease(bad); }));
    }
    for (const auto *key :
         {"url", "digest", "size", "duplicate", "missing", "crossrepo", "unsigned", "large"}) {
        auto bad = release;
        auto &a = bad["assets"][0];
        string k = key;
        if (k == "url")
            a["browser_download_url"] = "https://example.org/setup.exe";
        if (k == "digest")
            a["digest"] = "sha256:" + string(64, 'q');
        if (k == "unsigned")
            a["digest"] = nullptr;
        if (k == "size")
            a["size"] = -1;
        if (k == "large")
            a["size"] = maxAsset + 1;
        if (k == "crossrepo")
            a["browser_download_url"] = "https://github.com/other/repo/releases/download/v1.10.0/" + asset;
        if (k == "duplicate")
            bad["assets"].push_back(Json(a));
        if (k == "missing")
            a["name"] = "CiXia.exe";
        assert(rejects([&] { parseRelease(bad); }));
    }
    std::cout << "Windows release policy passed\n";
}
