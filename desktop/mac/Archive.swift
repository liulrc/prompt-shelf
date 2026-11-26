import AVFoundation
import AppKit
import CryptoKit
import ImageIO
import SQLite3
import UniformTypeIdentifiers

typealias Object = [String: Any]
struct AppIssue: LocalizedError {
  let message: String
  init(_ message: String) { self.message = message }
  var errorDescription: String? { message }
}

final class Archive {
  let root: URL
  let files: URL
  private var db: OpaquePointer?
  private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
  private let limit = 64 * 1024 * 1024
  private let fm = FileManager.default
  private let thumbQueue = DispatchQueue(label: "shelf.thumbnails", qos: .utility)
  var onChange: (() -> Void)?

  init(root: URL) throws {
    self.root = root
    self.files = root.appendingPathComponent("Media", isDirectory: true)
    try fm.createDirectory(
      at: files, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    guard
      sqlite3_open_v2(
        root.appendingPathComponent("History.sqlite3").path, &db,
        SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK
    else { throw AppIssue("剪贴板数据库无法打开。") }
    try sql(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; CREATE TABLE IF NOT EXISTS items (seq INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, signature TEXT NOT NULL, json TEXT NOT NULL, cost INTEGER NOT NULL);"
    )
    // If the process exited between writing a file and committing the row, reclaim that file.
    let live = Set(try rows().compactMap { $0["id"] as? String })
    for url in (try? fm.contentsOfDirectory(at: files, includingPropertiesForKeys: nil)) ?? [] {
      let prefix = String(url.lastPathComponent.prefix(36))
      if UUID(uuidString: prefix) != nil && !live.contains(prefix) { try? fm.removeItem(at: url) }
    }
  }
  deinit { sqlite3_close(db) }
  private func sql(_ command: String) throws {
    if sqlite3_exec(db, command, nil, nil, nil) != SQLITE_OK { throw AppIssue("剪贴板数据库写入失败。") }
  }
  private func statement(_ query: String) throws -> OpaquePointer {
    var st: OpaquePointer?
    guard sqlite3_prepare_v2(db, query, -1, &st, nil) == SQLITE_OK, let st else {
      throw AppIssue("无法读取剪贴板数据库。")
    }
    return st
  }
  private func bind(_ text: String, _ stmt: OpaquePointer, _ pos: Int32) {
    sqlite3_bind_text(stmt, pos, text, -1, transient)
  }
  private func rows(id: String? = nil, capturesOnly: Bool = false) throws -> [Object] {
    // Older releases already wrote this signature prefix. Read only screenshot
    // rows so opening the gallery doesn't deserialize clipboard text and videos.
    let selection =
      capturesOnly
      ? "WHERE signature GLOB 'image-capture:*' ORDER BY seq DESC"
      : (id == nil ? "ORDER BY seq DESC" : "WHERE id=?")
    let st = try statement("SELECT json FROM items " + selection)
    defer { sqlite3_finalize(st) }
    if let id { bind(id, st, 1) }
    var items = [Object]()
    while sqlite3_step(st) == SQLITE_ROW {
      guard let bytes = sqlite3_column_text(st, 0),
        let row = try JSONSerialization.jsonObject(
          with: Data(bytes: bytes, count: Int(sqlite3_column_bytes(st, 0)))) as? Object
      else { continue }
      items.append(row)
    }
    return items
  }
  func raw(_ id: String) throws -> Object {
    guard let row = try rows(id: id).first else { throw AppIssue("记录已经移除。") }
    return row
  }
  func publicRow(_ raw: Object) -> Object {
    var r = raw
    r.removeValue(forKey: "path")
    r.removeValue(forKey: "owned")
    let id = r["id"] as? String ?? ""
    if r["type"] as? String != "text" {
      r["url"] = "promptmedia://asset/" + id + "/full"
      r["thumbUrl"] =
        fm.fileExists(atPath: thumbnail(id).path) ? "promptmedia://asset/" + id + "/thumb" : ""
    }
    return r
  }
  func list() throws -> [Object] { try rows().map(publicRow) }
  func thumbnail(_ id: String) -> URL { files.appendingPathComponent(id + ".thumb.jpg") }
  func media(_ id: String, thumb: Bool = false) throws -> URL {
    let row = try raw(id)
    guard let path = row["path"] as? String else { throw AppIssue("这条记录没有附件。") }
    let url = thumb ? thumbnail(id) : URL(fileURLWithPath: path)
    guard fm.isReadableFile(atPath: url.path) else { throw AppIssue("原文件已移动或无法读取。") }
    return url
  }
  func captures() throws -> [Object] {
    try rows(capturesOnly: true).map(publicRow)
  }
  @discardableResult func add(
    _ input: Object, capture: Bool = false, trustedFileReference: Bool = false
  ) throws -> Object {
    guard let type = input["type"] as? String, ["text", "image", "video"].contains(type) else {
      throw AppIssue("无法识别剪贴内容。")
    }
    let text = input["text"] as? String ?? ""
    let id = UUID().uuidString
    var r: Object = [
      "id": id, "type": type, "text": text, "source": input["source"] as? String ?? "系统剪贴板",
      "filename": input["filename"] as? String ?? "", "title": input["title"] as? String ?? "",
      "mime": input["mime"] as? String
        ?? (type == "text" ? "text/plain" : type == "image" ? "image/png" : "video/mp4"),
      "isDemo": false, "capture": capture, "createdAt": ISO8601DateFormatter().string(from: Date()),
    ]
    if capture {
      for field in ["width", "height", "frameHeight"] {
        if let value = input[field] as? Int, value > 0 { r[field] = value }
      }
    }
    let data: Data
    var target: URL?
    var sourceFile: URL?
    var size = 0
    var cost = 0
    if type == "text" {
      guard !text.isEmpty else { throw AppIssue("剪贴板没有文字。") }
      data = Data(text.utf8)
      size = data.count
      cost = size
    } else if let path = input["path"] as? String, trustedFileReference {
      let url = URL(fileURLWithPath: path)
      let values = try url.resourceValues(forKeys: [
        .fileSizeKey, .contentModificationDateKey, .isRegularFileKey,
      ])
      guard values.isRegularFile == true else { throw AppIssue("只支持图片或视频文件。") }
      r["path"] = path
      r["filename"] = url.lastPathComponent
      r["owned"] = false
      size = values.fileSize ?? 0
      if size <= limit {
        target = files.appendingPathComponent(id, isDirectory: true).appendingPathComponent(
          url.lastPathComponent)
        sourceFile = url
        r["path"] = target!.path
        r["owned"] = true
        r["fileReference"] = true
        cost = size
      }
      data = Data(
        (path + "|" + String(values.contentModificationDate?.timeIntervalSince1970 ?? 0)).utf8)
    } else {
      guard let encoded = input["data"] as? String, encoded.utf8.count <= limit * 4 / 3 + 8,
        let bytes = Data(base64Encoded: encoded), !bytes.isEmpty
      else { throw AppIssue("媒体数据为空或超过 64 MiB。") }
      data = bytes
      size = data.count
      cost = size
      let ext = UTType(mimeType: r["mime"] as? String ?? "")?.preferredFilenameExtension ?? "bin"
      target = files.appendingPathComponent(id + "." + ext)
      r["owned"] = true
      r["path"] = target!.path
    }
    guard cost <= limit else { throw AppIssue("单条记录超过 64 MiB。") }
    r["size"] = size
    if (r["title"] as? String ?? "").isEmpty {
      let caption =
        type == "text"
        ? String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(65))
        : r["filename"] as? String ?? ""
      r["title"] = caption.isEmpty ? (type == "image" ? "图片" : "视频") : caption
    }
    let signature =
      type + (capture ? "-capture:" : ":")
      + SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    let last = try statement(
      "SELECT id FROM items WHERE seq=(SELECT MAX(seq) FROM items) AND signature=?")
    bind(signature, last, 1)
    let same =
      sqlite3_step(last) == SQLITE_ROW ? String(cString: sqlite3_column_text(last, 0)) : nil
    sqlite3_finalize(last)
    if let same { return try publicRow(raw(same)) }
    let json = String(decoding: try JSONSerialization.data(withJSONObject: r), as: UTF8.self)
    var retired = [Object]()
    if let target {
      if let sourceFile {
        try fm.createDirectory(
          at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        do { try fm.copyItem(at: sourceFile, to: target) } catch {
          try? fm.removeItem(at: target.deletingLastPathComponent())
          throw error
        }
      } else {
        try data.write(to: target, options: .atomic)
      }
    }
    do {
      try sql("BEGIN IMMEDIATE")
      let q = try statement("INSERT INTO items(id,signature,json,cost) VALUES(?,?,?,?)")
      defer { sqlite3_finalize(q) }
      bind(id, q, 1)
      bind(signature, q, 2)
      bind(json, q, 3)
      sqlite3_bind_int64(q, 4, Int64(cost))
      guard sqlite3_step(q) == SQLITE_DONE else { throw AppIssue("写入剪贴板历史失败。") }
      let expired = try statement(
        "SELECT id FROM (SELECT id, ROW_NUMBER() OVER(ORDER BY seq DESC) n, SUM(cost) OVER(ORDER BY seq DESC) total FROM items) WHERE n>100 OR total>?"
      )
      sqlite3_bind_int64(expired, 1, Int64(limit))
      var ids = [String]()
      while sqlite3_step(expired) == SQLITE_ROW {
        ids.append(String(cString: sqlite3_column_text(expired, 0)))
      }
      sqlite3_finalize(expired)
      for key in ids {
        retired.append(try raw(key))
        try deleteRow(key)
      }
      try sql("COMMIT")
    } catch {
      try? sql("ROLLBACK")
      if let target {
        try? fm.removeItem(at: sourceFile == nil ? target : target.deletingLastPathComponent())
      }
      throw error
    }
    retired.forEach(clearFiles)
    onChange?()
    if type != "text", let path = r["path"] as? String {
      makeThumbnail(id: id, url: URL(fileURLWithPath: path), video: type == "video")
    }
    return publicRow(r)
  }
  private func deleteRow(_ id: String) throws {
    let st = try statement("DELETE FROM items WHERE id=?")
    defer { sqlite3_finalize(st) }
    bind(id, st, 1)
    guard sqlite3_step(st) == SQLITE_DONE else { throw AppIssue("移除失败。") }
  }
  private func clearFiles(_ r: Object) {
    if r["owned"] as? Bool == true, let path = r["path"] as? String {
      let file = URL(fileURLWithPath: path)
      try? fm.removeItem(
        at: r["fileReference"] as? Bool == true ? file.deletingLastPathComponent() : file)
    }
    if let id = r["id"] as? String { try? fm.removeItem(at: thumbnail(id)) }
  }
  func remove(_ id: String) throws {
    let r = try raw(id)
    try deleteRow(id)
    clearFiles(r)
    onChange?()
  }
  private func makeThumbnail(id: String, url: URL, video: Bool) {
    thumbQueue.async { [weak self] in
      var image: CGImage?
      if video {
        let gen = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        gen.appliesPreferredTrackTransform = true
        gen.maximumSize = CGSize(width: 224, height: 224)
        image = try? gen.copyCGImage(at: CMTime.zero, actualTime: nil)
      } else if let src = CGImageSourceCreateWithURL(url as CFURL, nil) {
        let opt =
          [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 224,
          ] as CFDictionary
        image = CGImageSourceCreateThumbnailAtIndex(src, 0, opt)
      }
      guard let image else { return }
      let data = NSMutableData()
      guard
        let dst = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil)
      else { return }
      CGImageDestinationAddImage(
        dst, image, [kCGImageDestinationLossyCompressionQuality: 0.74] as CFDictionary)
      guard CGImageDestinationFinalize(dst) else { return }
      DispatchQueue.main.async {
        guard let self, (try? self.raw(id)) != nil else { return }
        try? (data as Data).write(to: self.thumbnail(id), options: .atomic)
        self.onChange?()
      }
    }
  }
}
