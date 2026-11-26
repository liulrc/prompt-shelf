// Run on any host with a C++17 compiler and the same nlohmann JSON header used by desktop/windows/build.sh.
#ifdef _WIN32
#include "../../desktop/windows/win.hpp"
#include "../../desktop/windows/ai.hpp"
#else
#include "../../desktop/windows/ai_protocol.hpp"
#endif
#include <cassert>
#include <cstdlib>
#include <iostream>

#ifdef _WIN32
// Windows: compile with -lwinhttp -lcrypt32 -lole32 -lshell32, then run
// python tests/mac/test-provider.py path/to/ai-regression.exe
static void nativeFixture(const string &port) {
    using namespace ai;
    const string host = "http://127.0.0.1:" + port, testKey = "fixture-only";
    const fs::path temp = fs::temp_directory_path() / wide("CiXia-ai-" + genId() + ".json");
    auto cleanup = std::unique_ptr<const fs::path, std::function<void(const fs::path *)>>(
        &temp, [](const fs::path *file) {
            std::error_code ec;
            fs::remove(*file, ec);
        });
    Json input = {{"baseURL", host + "/team/v1/chat/completions"},
                  {"apiKey", testKey},
                  {"models", {"fixture-a", "fixture-b"}}};
    auto saved = Config{}.save(input, temp);
    auto bytes = readBytes(temp);
    assert(string(bytes.begin(), bytes.end()).find(testKey) == string::npos);
    saved = Config::load(temp);
    assert(saved.publicFields()["hasKey"] == true && !saved.publicFields().contains("apiKey"));
    Endpoint endpoint(saved.base);
    const auto key = saved.keyFor(endpoint, Json::object());
    assert(key == testKey);
    const auto ids = listResult(fetch(endpoint, key, "/models", {}));
    assert(ids["models"].size() == 2);
    auto result =
        fetch(endpoint, key, "/chat/completions", optimizeBody("fixture-a", "Summarize the project notes in an English email.").dump());
    assert(optimizeResult(result, "fixture-a")["text"] == "根据项目记录撰写一封英文邮件，概括进展和下一步。");
    bool limited = false;
    try {
        fetch(endpoint, key, "/chat/completions", optimizeBody("fixture-b", "Summarize the project notes in an English email.").dump());
    } catch (const std::exception &e) {
        limited = string(e.what()).find("429") != string::npos;
    }
    assert(limited);
    Endpoint other(host + "/other/v1");
    assert(saved.keyFor(other, Json::object()).empty());
    assert(listResult(fetch(other, saved.keyFor(other, Json::object()), "/models", {}))["models"] ==
           Json::array({"local"}));
    bool blocked = false;
    try {
        fetch(Endpoint(host + "/redirect/v1"), "", "/models", {});
    } catch (const std::exception &e) {
        blocked = string(e.what()).find("302") != string::npos;
    }
    assert(blocked);
    saved = saved.save({{"baseURL", other.base}, {"models", {"local"}}}, temp);
    assert(!saved.publicFields()["hasKey"].get<bool>());
    std::cout << "PASS Windows WinHTTP, DPAPI, key scoping and redirect handling\n";
}
#endif

int main() {
    using namespace ai;
    assert(Endpoint(" HTTP://LOCALHOST:11434/ ").base == "http://localhost:11434/v1");
    assert(Endpoint("https://Example.com:443/v2/proxy/chat/completions/").base ==
           "https://example.com/v2/proxy");
    assert(Endpoint("http://[::1]:8080/v1/models").base == "http://[::1]:8080/v1");
    for (const string &invalid :
         {"https://@api.example", "https://a:b@api.example", "https://a/api#key", "https://a:123456",
          "https://a/path?q=one", "file:///tmp/model", "https://a\\@second.example/path", "https://"}) {
        bool threw = false;
        try {
            Endpoint endpoint(invalid);
        } catch (...) {
            threw = true;
        }
        assert(threw);
    }
    bool badToken = false;
    try {
        keyValue("token\r\nx-another: yes");
    } catch (...) {
        badToken = true;
    }
    assert(badToken);
    auto list = Json::parse(R"({"data":[{"id":"m1"},{"model":"skip"},{"id":"m2"},{"id":"m1"}]})");
    assert(listResult(list)["models"] == Json::array({"m1", "m2"}));
    assert(selectedModels(Json::array({"m2", "m1", "m2"})) == Json::array({"m2", "m1"}));
    string original = "Summarize the project notes in an English email.";
    auto body = optimizeBody("local/my-model", original);
    assert(body["model"] == "local/my-model" && body["messages"][1]["content"] == original &&
           body["stream"] == false);
    const auto policy = body["messages"][0]["content"].get<string>();
    assert(policy.find("默认用中文") != string::npos && policy.find("提示词本身") != string::npos &&
           policy.find("用英文撰写邮件") != string::npos && policy.find("【】") != string::npos);
    auto response = Json::parse(
        R"({"choices":[{"message":{"content":[{"type":"text","text":"一"},{"type":"text","text":"二"}]}}]})");
    auto result = optimizeResult(response, "m1");
    assert(result["model"] == "m1" && result["text"] == "一二");
#ifdef _WIN32
    if (const char *port = std::getenv("PS_SMOKE_AI_PORT"))
        nativeFixture(port);
#endif
    std::cout << "PASS Windows AI protocol normalization, invalid URL/token, model lists and optimization "
                 "parse\n";
}
