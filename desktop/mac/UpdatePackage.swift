import CoreServices
import CryptoKit
import Darwin
import Foundation
import Security

struct MacRelease {
  let version: String, notes: String, digest: String
  let size: Int64, url: URL
  static let repository = "https://github.com/liulrc/prompt-shelf"
  func cacheMetadata() throws -> Data {
    let asset: Object = ["name": url.lastPathComponent, "browser_download_url": url.absoluteString,
                         "size": size, "digest": "sha256:" + digest]
    return try JSONSerialization.data(withJSONObject: [
      "tag_name": "v" + version, "body": notes, "draft": false, "prerelease": false, "assets": [asset],
    ] as Object)
  }
  static func parts(_ version: String) -> [Int]? {
    let values = version.split(separator: ".", omittingEmptySubsequences: false)
    guard values.count == 3 else { return nil }
    let numbers = values.compactMap { value -> Int? in
      guard (1...9).contains(value.count), value.utf8.allSatisfy({ (48...57).contains($0) }),
            value.count == 1 || value.first != "0" else { return nil }
      return Int(value)
    }
    return numbers.count == 3 ? numbers : nil
  }
  static func newer(_ lhs: String, than rhs: String) -> Bool {
    guard let left = parts(lhs), let right = parts(rhs) else { return false }
    return right.lexicographicallyPrecedes(left)
  }
  init(data: Data) throws {
    guard data.count <= 2_097_152, let json = try JSONSerialization.jsonObject(with: data) as? Object,
      let tag = json["tag_name"] as? String, tag.first == "v", Self.parts(String(tag.dropFirst())) != nil,
      json["draft"] as? Bool == false, json["prerelease"] as? Bool == false
    else { throw AppIssue("发布信息无效，请稍后重试。") }
    version = String(tag.dropFirst())
    notes = String((json["body"] as? String ?? "").prefix(16000))
    let name = "PromptShelf-\(version)-macOS-universal.dmg"
    let matches = (json["assets"] as? [Object] ?? []).filter { $0["name"] as? String == name }
    guard matches.count == 1, let asset = matches.first,
      let url = URL(string: Self.repository + "/releases/download/" + tag + "/" + name),
      asset["browser_download_url"] as? String == url.absoluteString,
      let hash = asset["digest"] as? String, hash.hasPrefix("sha256:"), hash.count == 71,
      hash.dropFirst(7).utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }),
      let bytes = asset["size"] as? Int64, (1...268_435_456).contains(bytes)
    else { throw AppIssue("发布包缺少可验证的 macOS 安装文件或 SHA-256。") }
    self.url = url
    digest = String(hash.dropFirst(7))
    size = bytes
  }
}

enum UpdateFiles {
  static let bundleID = "com.promptshelf.desktop"
  static let fm = FileManager.default
  static func run(_ path: String, _ arguments: [String], failure: String) throws {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: path)
    process.arguments = arguments
    process.standardInput = FileHandle.nullDevice
    process.standardOutput = FileHandle.nullDevice
    process.standardError = FileHandle.nullDevice
    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else { throw AppIssue(failure) }
  }
  static func verifyDigest(_ dmg: URL, release: MacRelease) throws {
    guard !isLink(dmg) else { throw AppIssue("无法验证安装包文件。") }
    let file = try FileHandle(forReadingFrom: dmg)
    defer { try? file.close() }
    var size: Int64 = 0, hash = SHA256()
    while let data = try file.read(upToCount: 256 * 1024), !data.isEmpty {
      hash.update(data: data)
      size += Int64(data.count)
      if size > release.size { throw AppIssue("下载包长度与发布记录不符。") }
    }
    let actual = hash.finalize().map { String(format: "%02x", $0) }.joined()
    guard size == release.size, actual == release.digest else { throw AppIssue("安装包 SHA-256 校验失败，请重新下载。") }
  }
  static func executableDigest(_ app: URL) throws -> String {
    // The signed executable also seals Info.plist and the bundle resource envelope.
    let binary = app.appendingPathComponent("Contents/MacOS/PromptShelf")
    let file = try FileHandle(forReadingFrom: binary)
    defer { try? file.close() }
    var hash = SHA256()
    while let chunk = try file.read(upToCount: 256 * 1024), !chunk.isEmpty { hash.update(data: chunk) }
    return hash.finalize().map { String(format: "%02x", $0) }.joined()
  }
  static func validateBundle(_ url: URL, version: String? = nil) throws -> String {
    let plist = url.appendingPathComponent("Contents/Info.plist")
    guard !isLink(url),
      let info = try PropertyListSerialization.propertyList(from: Data(contentsOf: plist), format: nil) as? Object,
      info["CFBundleIdentifier"] as? String == bundleID,
      info["CFBundleExecutable"] as? String == "PromptShelf",
      let found = info["CFBundleShortVersionString"] as? String, MacRelease.parts(found) != nil,
      version == nil || found == version
    else { throw AppIssue("安装包的应用标识或版本不匹配。") }
    return found
  }
  static func isLink(_ item: URL) -> Bool {
    (try? item.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) != false
  }
  static func signingTeam(_ app: URL) throws -> String? {
    var code: SecStaticCode?, info: CFDictionary?
    guard SecStaticCodeCreateWithPath(app as CFURL, [], &code) == errSecSuccess, let code,
      SecCodeCopySigningInformation(code, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess
    else { throw AppIssue("无法读取应用签名。") }
    return (info as NSDictionary?)?[kSecCodeInfoTeamIdentifier] as? String
  }
  static func verifyCode(_ candidate: URL, installed: URL) throws {
    try run("/usr/bin/codesign", ["--verify", "--strict", "--deep", "--all-architectures", candidate.path],
            failure: "新版应用的代码签名校验失败。")
    if let team = try signingTeam(installed), try signingTeam(candidate) != team {
      throw AppIssue("新版应用的开发者签名与已安装版本不一致。")
    }
  }
  static func quarantine(_ file: URL, source: URL) throws {
    if (try file.resourceValues(forKeys: [.quarantinePropertiesKey])).quarantineProperties == nil {
      try (file as NSURL).setResourceValue([
        kLSQuarantineTypeKey as String: kLSQuarantineTypeWebDownload,
        kLSQuarantineDataURLKey as String: source,
        kLSQuarantineOriginURLKey as String: URL(string: MacRelease.repository + "/releases")!,
      ] as [String: Any], forKey: .quarantinePropertiesKey)
    }
    guard getxattr(file.path, "com.apple.quarantine", nil, 0, 0, XATTR_NOFOLLOW) > 0 else {
      throw AppIssue("无法保留 macOS 的下载来源标记。")
    }
  }
  static func stage(_ target: URL, id: UUID) -> URL {
    target.deletingLastPathComponent().appendingPathComponent(".com.promptshelf.update-" + id.uuidString, isDirectory: true)
  }
  static func candidate(_ stage: URL) -> URL { stage.appendingPathComponent("词匣.app", isDirectory: true) }
  static func prepare(_ dmg: URL, release: MacRelease, target: URL, id: UUID) throws -> URL {
    try verifyDigest(dmg, release: release)
    try quarantine(dmg, source: release.url)
    let installed = try validateBundle(target)
    guard MacRelease.newer(release.version, than: installed) else { throw AppIssue("当前版本已更新。") }
    let parent = target.deletingLastPathComponent(), staging = stage(target, id: id)
    guard !target.path.contains("/AppTranslocation/"), fm.isWritableFile(atPath: parent.path),
          (try? parent.resourceValues(forKeys: [.volumeIsReadOnlyKey]).volumeIsReadOnly) == false else {
      throw AppIssue("应用目录不可写。请将词匣移到个人「应用程序」文件夹，或由管理员安装后再试。")
    }
    do { try fm.createDirectory(at: staging, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700]) }
    catch { throw AppIssue("无法在应用目录暂存更新。请从个人「应用程序」文件夹运行，或联系管理员。") }
    do {
      let mount = fm.temporaryDirectory.appendingPathComponent("com.promptshelf.mount-" + id.uuidString, isDirectory: true)
      try fm.createDirectory(at: mount, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
      // Removing an empty directory is safe even if a failed detach left the volume mounted.
      defer { _ = Darwin.rmdir(mount.path) }
      try run("/usr/bin/hdiutil", ["attach", "-readonly", "-nobrowse", "-noautoopen", "-mountpoint", mount.path, dmg.path],
              failure: "macOS 无法挂载已下载的安装包。")
      defer {
        do { try run("/usr/bin/hdiutil", ["detach", mount.path], failure: "无法卸载磁盘映像。") }
        catch { try? run("/usr/bin/hdiutil", ["detach", "-force", mount.path], failure: "无法卸载磁盘映像。") }
      }
      let source = candidate(mount), copy = candidate(staging)
      _ = try validateBundle(source, version: release.version)
      try run("/usr/bin/ditto", [source.path, copy.path], failure: "无法复制新版应用，请检查可用空间与目录权限。")
      _ = try validateBundle(copy, version: release.version)
      try verifyCode(copy, installed: target)
      try quarantine(copy, source: release.url)
      return staging
    } catch {
      try? fm.removeItem(at: staging)
      throw error
    }
  }
  static func swap(_ target: URL, _ copy: URL) throws {
    guard renameatx_np(AT_FDCWD, target.path, AT_FDCWD, copy.path, UInt32(RENAME_SWAP)) == 0 else {
      throw AppIssue("macOS 拒绝替换应用。请检查应用程序目录的写入权限。")
    }
  }
  static func receipt(_ root: URL, id: UUID) -> URL {
    root.appendingPathComponent("update-started-" + id.uuidString)
  }
  static func confirmLaunch(root: URL, arguments: [String]) {
    guard let index = arguments.firstIndex(of: "--update-receipt"), arguments.indices.contains(index + 1),
          let id = UUID(uuidString: arguments[index + 1]) else { return }
    try? Data((Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "").utf8)
      .write(to: receipt(root, id: id), options: .atomic)
  }
  static func open(_ app: URL, args: [String]) throws {
    try run("/usr/bin/open", ["-n", app.path, "--args"] + args, failure: "macOS 未能启动新版词匣。")
  }
  /// The original bundle stays in staging until the replacement finishes native startup.
  static func replaceAndLaunch(target: URL, staging: URL, expected: String, digest: String, launch: () throws -> Bool) throws {
    let copy = candidate(staging), installed = try validateBundle(target)
    _ = try validateBundle(copy, version: expected)
    guard MacRelease.newer(expected, than: installed) else { throw AppIssue("已安装版本发生变化，请重新检查。") }
    guard try executableDigest(copy) == digest else { throw AppIssue("暂存的应用在安装前发生变化，请重新下载。") }
    try verifyCode(copy, installed: target)
    try swap(target, copy)
    do {
      guard try launch() else { throw AppIssue("新版未完成启动。请确认 macOS 的打开提示后重试。") }
    } catch {
      do { try swap(target, copy) }
      catch { throw AppIssue("自动恢复失败，上一版应用保留在 " + copy.path + "。") }
      throw error
    }
  }
  static func handoff(arguments: [String], root: URL) -> Int32 {
    let target = Bundle.main.bundleURL
    guard arguments.count == 7, target.pathExtension == "app",
          let id = UUID(uuidString: arguments[2]), let pid = Int32(arguments[3]), pid > 1,
          MacRelease.parts(arguments[4]) != nil, arguments[5].count == 64, ["manual", "background"].contains(arguments[6])
    else { return 2 }
    let expected = arguments[4], staging = stage(target, id: id), ack = receipt(root, id: id)
    let launchArgs = arguments[6] == "background" ? ["--background"] : []
    for _ in 0..<200 {
      if kill(pid, 0) == -1 && errno == ESRCH { break }
      Thread.sleep(forTimeInterval: 0.1)
    }
    do {
      guard kill(pid, 0) < 0, errno == ESRCH else { throw AppIssue("旧版仍在运行，请退出后重试。") }
      try replaceAndLaunch(target: target, staging: staging, expected: expected, digest: arguments[5]) {
        try open(target, args: launchArgs + ["--update-receipt", id.uuidString])
        for _ in 0..<200 {
          if (try? String(contentsOf: ack, encoding: .utf8)) == expected { return true }
          Thread.sleep(forTimeInterval: 0.3)
        }
        return false
      }
      try? fm.removeItem(at: ack)
      try? fm.removeItem(at: staging)
      return 0
    } catch {
      // Never discard the only remaining copy of the previous version if rollback failed.
      if (try? validateBundle(target)) != expected { try? fm.removeItem(at: staging) }
      try? Data(error.localizedDescription.utf8).write(to: root.appendingPathComponent("UpdateFailure.txt"), options: .atomic)
      if kill(pid, 0) < 0 { try? open(target, args: launchArgs + ["--update-rollback"]) }
      return 1
    }
  }
}
