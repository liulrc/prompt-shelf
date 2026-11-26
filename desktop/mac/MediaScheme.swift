import Foundation
import WebKit

// Expose only files authorized by an archive ID. Range responses allow WebKit
// to seek within a video without copying the entire movie into JavaScript.
@MainActor final class MediaScheme: NSObject, WKURLSchemeHandler {
  let archive: Archive
  private var active = Set<ObjectIdentifier>()
  init(_ archive: Archive) { self.archive = archive }
  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url, url.host == "asset" else {
      task.didFailWithError(AppIssue("无效资源。"))
      return
    }
    let parts = url.path.split(separator: "/")
    guard parts.count == 2, UUID(uuidString: String(parts[0])) != nil,
      ["thumb", "full"].contains(String(parts[1]))
    else {
      task.didFailWithError(AppIssue("无效的媒体地址。"))
      return
    }
    let id = String(parts[0])
    let thumb = parts[1] == "thumb"
    do {
      let file = try archive.media(id, thumb: thumb)
      let mime =
        thumb
        ? "image/jpeg" : (try archive.raw(id)["mime"] as? String ?? "application/octet-stream")
      let total = Int64(try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0)
      var lo: Int64 = 0
      var hi = total - 1
      var partial = false
      if let range = task.request.value(forHTTPHeaderField: "Range"), range.hasPrefix("bytes=") {
        let pair = range.dropFirst(6).split(
          separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
        if pair.count == 2 {
          if let start = Int64(pair[0]) {
            lo = start
            if let end = Int64(pair[1]) { hi = min(hi, end) }
          } else if let suffix = Int64(pair[1]) {
            lo = max(0, total - suffix)
          }
          partial = true
        }
      }
      guard lo >= 0, hi >= lo, lo < total else {
        task.didFailWithError(AppIssue("文件范围无效。"))
        return
      }
      var headers = [
        "Content-Type": mime, "Content-Length": String(hi - lo + 1), "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
      ]
      if partial { headers["Content-Range"] = "bytes \(lo)-\(hi)/\(total)" }
      task.didReceive(
        HTTPURLResponse(
          url: url, statusCode: partial ? 206 : 200, httpVersion: "HTTP/1.1", headerFields: headers)!
      )
      if task.request.httpMethod == "HEAD" {
        task.didFinish()
        return
      }
      let key = ObjectIdentifier(task)
      active.insert(key)
      let handle = try FileHandle(forReadingFrom: file)
      try handle.seek(toOffset: UInt64(lo))
      send(task, key, handle, hi - lo + 1)
    } catch {
      active.remove(ObjectIdentifier(task))
      task.didFailWithError(error)
    }
  }
  private func send(
    _ task: WKURLSchemeTask, _ key: ObjectIdentifier, _ file: FileHandle, _ remaining: Int64
  ) {
    guard active.contains(key) else {
      try? file.close()
      return
    }
    do {
      if remaining == 0 {
        active.remove(key)
        try? file.close()
        task.didFinish()
        return
      }
      let chunk = try file.read(upToCount: Int(min(remaining, 128 * 1024))) ?? Data()
      guard !chunk.isEmpty else { throw AppIssue("媒体文件已被截断。") }
      task.didReceive(chunk)
      DispatchQueue.main.async { self.send(task, key, file, remaining - Int64(chunk.count)) }
    } catch {
      active.remove(key)
      try? file.close()
      task.didFailWithError(error)
    }
  }
  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
    active.remove(ObjectIdentifier(task))
  }
}
