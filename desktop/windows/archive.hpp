#pragma once
#include "win.hpp"

struct ClipboardGuard {
    ClipboardGuard(HWND owner) { require(OpenClipboard(owner) != 0, "剪贴板正在被其他程序占用，请重试。"); }
    ~ClipboardGuard() { CloseClipboard(); }
};
inline void setClipboardBytes(UINT format, const void *ptr, size_t length) {
    HGLOBAL mem = GlobalAlloc(GMEM_MOVEABLE, length);
    require(mem, "剪贴板内存不足。");
    void *dest = GlobalLock(mem);
    if (!dest) {
        GlobalFree(mem);
        throw std::runtime_error("剪贴板内存不足。");
    }
    memcpy(dest, ptr, length);
    GlobalUnlock(mem);
    if (!SetClipboardData(format, mem)) {
        GlobalFree(mem);
        throw std::runtime_error("写入系统剪贴板失败。");
    }
}
inline string mimeFor(const wstring &filename) {
    wstring e = fs::path(filename).extension().wstring();
    for (auto &c : e)
        c = towlower(c);
    static const std::map<wstring, string> values = {
        {L".png", "image/png"},       {L".jpg", "image/jpeg"},     {L".jpeg", "image/jpeg"},
        {L".gif", "image/gif"},       {L".bmp", "image/bmp"},      {L".tif", "image/tiff"},
        {L".tiff", "image/tiff"},     {L".webp", "image/webp"},    {L".avif", "image/avif"},
        {L".heic", "image/heic"},     {L".mp4", "video/mp4"},      {L".webm", "video/webm"},
        {L".mov", "video/quicktime"}, {L".m4v", "video/mp4"},      {L".mkv", "video/x-matroska"},
        {L".avi", "video/x-msvideo"}, {L".wmv", "video/x-ms-wmv"}, {L".mpeg", "video/mpeg"},
        {L".mpg", "video/mpeg"}};
    auto it = values.find(e);
    return it == values.end() ? "" : it->second;
}
inline void makeThumbnail(const fs::path &source, const fs::path &target) {
    IShellItemImageFactory *factory = nullptr;
    if (FAILED(SHCreateItemFromParsingName(source.c_str(), nullptr, IID_PPV_ARGS(&factory))))
        return;
    SIZE size{264, 180};
    HBITMAP bm = nullptr;
    auto hr = factory->GetImage(size, (SIIGBF)(SIIGBF_THUMBNAILONLY | SIIGBF_BIGGERSIZEOK), &bm);
    factory->Release();
    if (SUCCEEDED(hr) && bm) {
        {
            Gdiplus::Bitmap image(bm, nullptr);
            image.Save(target.c_str(), &pngEncoder, nullptr);
        }
        DeleteObject(bm);
    }
}
class Archive {
    fs::path folder, media, index;
    Json rows = Json::array();
    static constexpr uint64_t limit = 64ull * 1024 * 1024;
    static string filenameOnly(const string &s) { return utf(fs::path(wide(s)).filename().wstring()); }
    Json exposed(const Json &r) const {
        Json j = r;
        j.erase("stored");
        j.erase("thumb");
        j.erase("originFile");
        j.erase("external");
        j.erase("cost");
        if (r.contains("stored"))
            j["url"] = "https://media.cixia.local/" + r["stored"].get<string>();
        if (r.contains("thumb"))
            j["thumbUrl"] = "https://media.cixia.local/" + r["thumb"].get<string>();
        else if (r["type"] == "image")
            j["thumbUrl"] = j.value("url", "");
        return j;
    }
    fs::path managed(const string &name) const {
        require(!name.empty() &&
                    name.find_first_not_of(
                        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-") == string::npos &&
                    name != "." && name != "..",
                "无效的媒体路径。");
        return media / wide(name);
    }
    fs::path original(const Json &r) const {
        return r.contains("external") ? fs::path(wide(r.at("external"))) : managed(r.at("stored"));
    }
    void removeFiles(const Json &r) {
        std::error_code ignored;
        auto id = r.at("id").get<string>();
        if (id.size() == 36 && id.find_first_not_of("0123456789ABCDEFabcdef-") == string::npos)
            fs::remove_all(folder / L"Transfers" / wide(id), ignored);
        for (auto key : {"stored", "thumb"})
            if (r.contains(key)) {
                std::error_code ec;
                fs::remove(managed(r[key]), ec);
            }
    }
    Json put(Json r) {
        Json updated = rows;
        updated.insert(updated.begin(), r);
        Json expired = Json::array();
        uintmax_t size = 0;
        for (size_t i = 0; i < updated.size(); i++) {
            size += updated[i].value("cost", updated[i].value("size", uint64_t(0)));
            if (i > 0 && (i >= 100 || size > limit)) {
                for (size_t k = i; k < updated.size(); k++)
                    expired.push_back(updated[k]);
                updated.erase(updated.begin() + i, updated.end());
                break;
            }
        }
        try {
            writeJson(index, updated);
        } catch (...) {
            removeFiles(r);
            throw;
        }
        rows = std::move(updated);
        for (auto &row : expired)
            removeFiles(row);
        return exposed(r);
    }

  public:
    explicit Archive(const fs::path &base)
        : folder(base), media(base / L"Media"), index(base / L"history.json") {
        fs::create_directories(media);
        if (fs::exists(index)) {
            std::ifstream f(index);
            rows = Json::parse(f);
            require(rows.is_array(), "本地剪贴板索引无法读取。");
        }
    }
    fs::path mediaDir() const { return media; }
    const Json &nativeRows() const { return rows; }
    Frame thumbnailFrame(const Json &r) const {
        if (r.contains("thumb")) {
            try {
                return decodeImage(managed(r.at("thumb")));
            } catch (...) {
            }
        }
        return {};
    }
    std::pair<fs::path, string> externalResource(const wstring &uri) const {
        const wstring prefix = L"https://media.cixia.local/";
        if (uri.rfind(prefix, 0) != 0)
            return {};
        string name = utf(uri.substr(prefix.size()));
        for (const auto &r : rows)
            if (r.contains("external") && r.value("stored", "") == name)
                return {original(r), r.value("mime", "application/octet-stream")};
        return {};
    }
    const Json &get(const string &id) const {
        for (auto &row : rows)
            if (row.value("id", "") == id)
                return row;
        throw std::runtime_error("未找到此记录。");
    }
    Json list() const {
        Json out = Json::array();
        for (auto &r : rows)
            out.push_back(exposed(r));
        return out;
    }
    Json text(string value, string title, string source) {
        require(!value.empty(), "剪贴板文字为空。");
        require(value.size() <= limit, "单条文字超过 64 MiB。");
        if (title.empty()) {
            size_t pos = value.find_first_of("\r\n");
            auto w = wide(value.substr(0, pos));
            if (w.size() > 65) {
                w.resize(64);
                if (IS_HIGH_SURROGATE(w.back()))
                    w.pop_back();
                w += L"…";
            }
            title = utf(w);
        }
        return put({{"id", genId()},
                    {"type", "text"},
                    {"title", title},
                    {"source", source},
                    {"text", value},
                    {"createdAt", nowIso()},
                    {"mime", "text/plain"},
                    {"filename", ""},
                    {"isDemo", false},
                    {"size", value.size()}});
    }
    Json binary(const Bytes *data, const fs::path *sourcePath, string type, string mime, string filename,
                string title, string source, bool fileCopy = false) {
        require(type == "image" || type == "video", "仅支持图片和视频文件。");
        string id = genId();
        filename = filenameOnly(filename);
        wstring ext = fs::path(wide(filename)).extension().wstring();
        bool safe = ext.size() > 1 && ext.size() < 10 &&
                    std::all_of(ext.begin() + 1, ext.end(), [](wchar_t c) { return c < 128 && iswalnum(c); });
        if (!safe)
            ext = type == "image" ? L".png" : L".mp4";
        string stored = id + utf(ext), thumb = id + ".thumb.png";
        auto path = managed(stored);
        auto thumbPath = managed(thumb);
        Json r = {{"id", id},
                  {"type", type},
                  {"mime", mime},
                  {"filename", filename.empty() ? ("clip" + utf(ext)) : filename},
                  {"title", !title.empty()      ? title
                            : !filename.empty() ? filename
                                                : "剪贴图片"},
                  {"text", ""},
                  {"source", source},
                  {"isDemo", false},
                  {"createdAt", nowIso()},
                  {"stored", stored},
                  {"originFile", fileCopy}};
        try {
            if (sourcePath) {
                require(fs::is_regular_file(*sourcePath), "原文件已移动或无法访问。");
                r["size"] = fs::file_size(*sourcePath);
                if (r["size"].get<uint64_t>() > limit) {
                    r["external"] = utf(sourcePath->wstring());
                    r["cost"] = 0;
                } else
                    require(CopyFileW(sourcePath->c_str(), path.c_str(), TRUE),
                            "归档文件失败，请检查可用空间。");
            } else {
                require(data && !data->empty(), "没有可归档的数据。");
                require(data->size() <= limit, "单条媒体超过 64 MiB。大文件可以从资源管理器复制到剪贴板。");
                writeBytes(path, *data);
                r["size"] = data->size();
            }
            makeThumbnail(original(r), thumbPath);
            if (type == "image" && !fs::exists(thumbPath)) {
                Gdiplus::Bitmap image(original(r).c_str());
                auto width = image.GetWidth(), height = image.GetHeight();
                if (image.GetLastStatus() == Gdiplus::Ok && width && height &&
                    uint64_t(width) * height <= 120000000) {
                    auto zoom = std::min({1.0, 264.0 / width, 180.0 / height});
                    Gdiplus::Bitmap small(std::max(1, int(width * zoom)), std::max(1, int(height * zoom)),
                                          PixelFormat32bppARGB);
                    {
                        Gdiplus::Graphics graphics(&small);
                        graphics.SetInterpolationMode(Gdiplus::InterpolationModeHighQualityBilinear);
                        graphics.DrawImage(&image, 0, 0, static_cast<INT>(small.GetWidth()),
                                           static_cast<INT>(small.GetHeight()));
                    }
                    small.Save(thumbPath.c_str(), &pngEncoder, nullptr);
                }
            }
            if (fs::exists(thumbPath))
                r["thumb"] = thumb;
            return put(r);
        } catch (...) {
            std::error_code ec;
            fs::remove(path, ec);
            fs::remove(thumbPath, ec);
            throw;
        }
    }
    Json details(const string &id) const {
        const auto &r = get(id);
        Json j = exposed(r);
        if (r["type"] == "image") {
            // Only fetch pixels for the selected image. List and thumbnails stay small.
            auto p = original(r);
            if (r["mime"] == "image/png")
                j["data"] = to64(readBytes(p));
            else {
                auto f = decodeImage(p);
                j["data"] = to64(encodeFrame(f));
                j["mime"] = "image/png";
            }
        }
        return j;
    }
    void exportFile(const string &id, const fs::path &target) const {
        const auto &r = get(id);
        if (r["type"] == "text") {
            auto s = r.at("text").get<string>();
            writeBytes(target, Bytes(s.begin(), s.end()));
            return;
        }
        require(CopyFileW(original(r).c_str(), target.c_str(), TRUE), "无法复制归档文件。");
    }
    Frame pinFrame(string id) const {
        if (id.empty()) {
            for (auto &r : rows)
                if (r["type"] == "image" && r.value("source", "").find("截图") != string::npos) {
                    id = r["id"];
                    break;
                }
        }
        require(!id.empty(), "还没有截图。请先截取一张图片。");
        const auto &r = get(id);
        require(r["type"] == "image", "请选择一张图片。");
        return decodeImage(original(r));
    }
    void remove(const string &id) {
        auto r = get(id);
        auto next = rows;
        next.erase(std::remove_if(next.begin(), next.end(), [&](const Json &a) { return a["id"] == id; }),
                   next.end());
        writeJson(index, next);
        rows = std::move(next);
        removeFiles(r);
    }
    Json fromPayload(const Json &p) {
        auto type = p.value("type", "text");
        if (type == "text")
            return text(p.value("text", ""), p.value("title", ""), p.value("source", "词匣"));
        const auto &encoded = p.at("data").get_ref<const string &>();
        require(encoded.size() <= limit * 4 / 3 + 8, "导入文件超过 64 MiB。请从资源管理器复制原文件。");
        auto b = from64(encoded);
        return binary(&b, nullptr, type, p.value("mime", type == "image" ? "image/png" : "video/mp4"),
                      p.value("filename", ""), p.value("title", ""), p.value("source", "导入文件"));
    }
    Json readClipboard(HWND owner) {
        string source = appName(GetClipboardOwner() ? GetClipboardOwner() : GetForegroundWindow());
        Bytes png;
        string plain;
        std::vector<fs::path> files;
        {
            ClipboardGuard guard(owner);
            if (auto handle = GetClipboardData(CF_HDROP)) {
                HDROP drop = (HDROP)handle;
                UINT count = DragQueryFileW(drop, UINT(-1), nullptr, 0);
                for (UINT i = 0; i < count; i++) {
                    UINT n = DragQueryFileW(drop, i, nullptr, 0);
                    wstring w(n + 1, 0);
                    DragQueryFileW(drop, i, w.data(), n + 1);
                    w.resize(n);
                    if (!mimeFor(w).empty())
                        files.emplace_back(w);
                }
            }
            if (files.empty()) {
                auto pngFormat = RegisterClipboardFormatW(L"PNG");
                if (auto h = GetClipboardData(pngFormat)) {
                    auto n = GlobalSize(h);
                    auto ptr = (uint8_t *)GlobalLock(h);
                    if (ptr && n >= 8 && memcmp(ptr, "\x89PNG\r\n\x1a\n", 8) == 0)
                        png.assign(ptr, ptr + n);
                    if (ptr)
                        GlobalUnlock(h);
                }
                if (png.empty() && IsClipboardFormatAvailable(CF_BITMAP)) {
                    HBITMAP bm = (HBITMAP)GetClipboardData(CF_BITMAP);
                    if (bm) {
                        Gdiplus::Bitmap image(bm, nullptr);
                        png = encodeImage(image);
                    }
                }
                if (png.empty()) {
                    HANDLE h = GetClipboardData(CF_UNICODETEXT);
                    if (h) {
                        auto p = (wchar_t *)GlobalLock(h);
                        if (p) {
                            size_t limit = GlobalSize(h) / sizeof(wchar_t);
                            plain = utf(wstring(p, wcsnlen(p, limit)));
                            GlobalUnlock(h);
                        }
                    }
                }
            }
        }
        if (!files.empty()) {
            Json last;
            for (auto &path : files) {
                string mime = mimeFor(path.wstring());
                last = binary(nullptr, &path, mime.substr(0, mime.find('/')), mime,
                              utf(path.filename().wstring()), "", source, true);
            }
            return last;
        }
        if (!png.empty())
            return binary(&png, nullptr, "image", "image/png", "剪贴图片.png", "剪贴图片", source);
        if (!plain.empty())
            return text(plain, "", source);
        throw std::runtime_error("剪贴板里没有支持的文字、图片或视频。");
    }
    void writeToClipboard(HWND owner, const string &id) {
        const auto &r = get(id);
        auto type = r.value("type", "");
        wstring value;
        if (type == "text") {
            value = wide(r["text"]);
            ClipboardGuard guard(owner);
            require(EmptyClipboard(), "剪贴板写入失败。");
            setClipboardBytes(CF_UNICODETEXT, value.c_str(), (value.size() + 1) * sizeof(wchar_t));
            return;
        }
        auto path = original(r);
        require(fs::is_regular_file(path), "媒体文件已移动或不可读。");
        Frame pixels;
        Bytes png;
        bool file = type == "video" || r.value("originFile", false);
        if (type == "image") {
            try {
                pixels = decodeImage(path);
                png = r["mime"] == "image/png" ? readBytes(path) : encodeFrame(pixels);
            } catch (...) {
                file = true;
            }
        }
        if (file && !r.contains("external")) {
            // Explorer takes the leaf name from CF_HDROP. Keep the displayed original name
            // while retaining an independent, immutable archive asset for the browser.
            auto leaf = fs::path(wide(r.value("filename", ""))).filename().wstring();
            if (!leaf.empty() && leaf.find_first_of(L"<>:\"/\\|?*") == wstring::npos && leaf != L"." &&
                leaf != L"..") {
                fs::path transfer = folder / L"Transfers" / wide(r.at("id"));
                fs::create_directories(transfer);
                transfer /= leaf;
                if (!fs::exists(transfer) && !CreateHardLinkW(transfer.c_str(), path.c_str(), nullptr))
                    require(CopyFileW(path.c_str(), transfer.c_str(), TRUE), "无法准备原名文件。");
                path = transfer;
            }
        }
        ClipboardGuard guard(owner);
        require(EmptyClipboard(), "剪贴板写入失败。");
        if (file) {
            wstring name = path.wstring();
            Bytes payload(sizeof(DROPFILES) + (name.size() + 2) * sizeof(wchar_t));
            auto *drop = (DROPFILES *)payload.data();
            drop->pFiles = sizeof(DROPFILES);
            drop->fWide = TRUE;
            memcpy(payload.data() + sizeof(DROPFILES), name.c_str(), (name.size() + 1) * sizeof(wchar_t));
            setClipboardBytes(CF_HDROP, payload.data(), payload.size());
        }
        if (!pixels.px.empty()) {
            auto info = frameInfo(pixels.w, pixels.h);
            Bytes dib(sizeof(BITMAPINFOHEADER) + pixels.px.size());
            memcpy(dib.data(), &info.bmiHeader, sizeof(BITMAPINFOHEADER));
            memcpy(dib.data() + sizeof(BITMAPINFOHEADER), pixels.px.data(), pixels.px.size());
            setClipboardBytes(CF_DIB, dib.data(), dib.size());
            if (!png.empty())
                setClipboardBytes(RegisterClipboardFormatW(L"PNG"), png.data(), png.size());
        }
    }
};
