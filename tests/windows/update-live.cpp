#include "../../desktop/windows/updater.hpp"
#include <iostream>

int main() {
    if (FAILED(CoInitializeEx(nullptr, COINIT_MULTITHREADED)))
        return 1;
    int code = 1;
    fs::path folder;
    try {
        folder = fs::temp_directory_path() / wide("cixia-update-test-" + genId());
        const auto release = updater::latestRelease("0.0.0");
        require(!release.url.empty(), "Missing public Windows release");
        auto mail = std::make_shared<updater::Mail>();
        auto package = updater::download(folder, release, mail);
        require(fs::file_size(package->path) == release.size, "Incorrect download size");
        auto writer = CreateFileW(package->path.c_str(), GENERIC_WRITE, FILE_SHARE_READ, nullptr,
                                  OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (writer != INVALID_HANDLE_VALUE)
            CloseHandle(writer);
        require(writer == INVALID_HANDLE_VALUE && GetLastError() == ERROR_SHARING_VIOLATION,
                "Verified file was writable");
        std::ifstream zone(fs::path(package->path.wstring() + L":Zone.Identifier"));
        std::cout << "GitHub release " << release.latest << " verified, bytes " << release.size
                  << ", SHA-256 " << release.digest << ", Internet-zone evidence "
                  << (zone ? "present" : "not recorded by policy") << "\n";
        zone.close();
        package.reset();
        require(fs::is_empty(folder), "Test package was not removed");
        auto bad = release;
        bad.digest.front() = bad.digest.front() == '0' ? '1' : '0';
        bool rejected = false;
        try {
            updater::download(folder, bad, mail);
        } catch (const std::exception &e) {
            rejected = string(e.what()).find("SHA-256") != string::npos;
        }
        require(rejected && fs::is_empty(folder), "Corrupted release accepted or left on disk");
        std::cout << "Modified digest rejected and download removed\n";
        code = 0;
    } catch (const std::exception &e) {
        std::cerr << e.what() << "\n";
    }
    if (!folder.empty()) {
        std::error_code ignored;
        fs::remove_all(folder, ignored);
    }
    CoUninitialize();
    return code;
}
