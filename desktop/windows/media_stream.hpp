#pragma once
#include "win.hpp"

// WebView2 can request small byte ranges of a large source video. This stream
// exposes only the selected archived file and never materializes it in RAM.
class FileRange final : public IStream {
    std::atomic<ULONG> references{1};
    HANDLE file;
    ULONGLONG origin, length, position = 0;
    fs::path path;

  public:
    FileRange(fs::path p, ULONGLONG begin, ULONGLONG bytes)
        : origin(begin), length(bytes), path(std::move(p)) {
        file = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                           nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    }
    ~FileRange() {
        if (file != INVALID_HANDLE_VALUE)
            CloseHandle(file);
    }
    bool valid() const { return file != INVALID_HANDLE_VALUE; }
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id, void **out) override {
        if (!out)
            return E_POINTER;
        *out = nullptr;
        if (id != IID_IUnknown && id != IID_ISequentialStream && id != IID_IStream)
            return E_NOINTERFACE;
        *out = (IStream *)this;
        AddRef();
        return S_OK;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return ++references; }
    ULONG STDMETHODCALLTYPE Release() override {
        ULONG n = --references;
        if (!n)
            delete this;
        return n;
    }
    HRESULT STDMETHODCALLTYPE Read(void *dest, ULONG requested, ULONG *actual) override {
        if (actual)
            *actual = 0;
        if (!dest && requested)
            return STG_E_INVALIDPOINTER;
        auto remaining = length - position;
        DWORD n = (DWORD)std::min<ULONGLONG>(requested, remaining);
        LARGE_INTEGER offset;
        offset.QuadPart = origin + position;
        DWORD read = 0;
        if (!SetFilePointerEx(file, offset, nullptr, FILE_BEGIN) || !ReadFile(file, dest, n, &read, nullptr))
            return STG_E_READFAULT;
        position += read;
        if (actual)
            *actual = read;
        return read == requested ? S_OK : S_FALSE;
    }
    HRESULT STDMETHODCALLTYPE Seek(LARGE_INTEGER delta, DWORD mode, ULARGE_INTEGER *result) override {
        if (mode != STREAM_SEEK_SET && mode != STREAM_SEEK_CUR && mode != STREAM_SEEK_END)
            return STG_E_INVALIDFUNCTION;
        LONGLONG base = mode == STREAM_SEEK_SET ? 0 : mode == STREAM_SEEK_CUR ? position : length;
        if (delta.QuadPart < -base || delta.QuadPart > (LONGLONG)length - base)
            return STG_E_INVALIDFUNCTION;
        position = base + delta.QuadPart;
        if (result)
            result->QuadPart = position;
        return S_OK;
    }
    HRESULT STDMETHODCALLTYPE Stat(STATSTG *stats, DWORD) override {
        if (!stats)
            return E_POINTER;
        *stats = {};
        stats->type = STGTY_STREAM;
        stats->cbSize.QuadPart = length;
        stats->grfMode = STGM_READ;
        return S_OK;
    }
    HRESULT STDMETHODCALLTYPE Clone(IStream **out) override {
        if (!out)
            return E_POINTER;
        auto *other = new FileRange(path, origin, length);
        if (!other->valid()) {
            other->Release();
            return STG_E_FILENOTFOUND;
        }
        other->position = position;
        *out = other;
        return S_OK;
    }
    HRESULT STDMETHODCALLTYPE Write(const void *, ULONG, ULONG *) override { return STG_E_ACCESSDENIED; }
    HRESULT STDMETHODCALLTYPE SetSize(ULARGE_INTEGER) override { return STG_E_ACCESSDENIED; }
    HRESULT STDMETHODCALLTYPE CopyTo(IStream *, ULARGE_INTEGER, ULARGE_INTEGER *, ULARGE_INTEGER *) override {
        return E_NOTIMPL;
    }
    HRESULT STDMETHODCALLTYPE Commit(DWORD) override { return S_OK; }
    HRESULT STDMETHODCALLTYPE Revert() override { return STG_E_INVALIDFUNCTION; }
    HRESULT STDMETHODCALLTYPE LockRegion(ULARGE_INTEGER, ULARGE_INTEGER, DWORD) override {
        return STG_E_INVALIDFUNCTION;
    }
    HRESULT STDMETHODCALLTYPE UnlockRegion(ULARGE_INTEGER, ULARGE_INTEGER, DWORD) override {
        return STG_E_INVALIDFUNCTION;
    }
};
