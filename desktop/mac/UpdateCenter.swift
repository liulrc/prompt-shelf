import AppKit
import Foundation

private final class ReleaseNetwork: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
  let expectedSize: Int64
  let report: (@Sendable (Int) -> Void)?
  init(size: Int64 = 0, report: (@Sendable (Int) -> Void)? = nil) {
    expectedSize = size
    self.report = report
  }
  private static let hosts = ["api.github.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"]
  static func allowed(_ url: URL?) -> Bool {
    guard let url, url.scheme == "https", let host = url.host?.lowercased(), hosts.contains(host),
      url.user == nil, url.password == nil, url.port == nil || url.port == 443 else { return false }
    return true
  }
  func urlSession(_ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(Self.allowed(request.url) ? request : nil)
  }
  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {}
  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                  totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
    guard expectedSize > 0, totalBytesWritten <= expectedSize else { downloadTask.cancel(); return }
    report?(Int(totalBytesWritten * 100 / expectedSize))
  }
  static func session() -> URLSession {
    let config = URLSessionConfiguration.ephemeral
    config.httpShouldSetCookies = false
    config.tlsMinimumSupportedProtocolVersion = .TLSv12
    config.urlCache = nil
    config.requestCachePolicy = .reloadIgnoringLocalCacheData
    config.urlCredentialStorage = nil
    config.timeoutIntervalForRequest = 30
    config.timeoutIntervalForResource = 300
    return URLSession(configuration: config)
  }
  static func metadata(_ url: URL) async throws -> Data {
    var request = URLRequest(url: url)
    request.setValue("CiXia-Desktop-Updater", forHTTPHeaderField: "User-Agent")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    let session = session()
    defer { session.finishTasksAndInvalidate() }
    let (bytes, response) = try await session.bytes(for: request, delegate: ReleaseNetwork())
    guard let http = response as? HTTPURLResponse, allowed(http.url), http.statusCode == 200 else {
      throw AppIssue("更新服务暂不可用，请检查网络或稍后重试。")
    }
    var data = Data()
    for try await byte in bytes {
      guard data.count < 2_097_152 else { throw AppIssue("更新清单过大。") }
      data.append(byte)
    }
    return data
  }
  static func latest() async throws -> MacRelease {
    let data: Data
    do {
      data = try await metadata(URL(string: "https://api.github.com/repos/liulrc/prompt-shelf/releases/latest")!)
    } catch {
      data = try await metadata(URL(string: MacRelease.repository + "/releases/latest/download/update.json")!)
    }
    return try MacRelease(data: data)
  }
  static func download(_ release: MacRelease, to folder: URL, progress: @escaping @Sendable (Int) -> Void) async throws -> URL {
    let session = session()
    defer { session.finishTasksAndInvalidate() }
    let target = folder.appendingPathComponent("update.dmg")
    let (temp, response) = try await session.download(for: URLRequest(url: release.url),
      delegate: ReleaseNetwork(size: release.size, report: progress))
    guard let http = response as? HTTPURLResponse, allowed(http.url), http.statusCode == 200 else {
      throw AppIssue("未能从项目发布页下载安装包。")
    }
    try FileManager.default.moveItem(at: temp, to: target)
    return target
  }
}

private struct InstallerCache {
  let directory: URL
  var metadata: URL { directory.appendingPathComponent("release.json") }
  func file(_ release: MacRelease) -> URL { directory.appendingPathComponent(release.digest + ".dmg") }
  func load(current: String) -> MacRelease? {
    guard let data = try? Data(contentsOf: metadata), let release = try? MacRelease(data: data),
      MacRelease.newer(release.version, than: current),
      !UpdateFiles.isLink(file(release)), FileManager.default.fileExists(atPath: file(release).path)
    else { try? FileManager.default.removeItem(at: directory); return nil }
    prune(keeping: release)
    return release
  }
  private func prune(keeping release: MacRelease) {
    let keep = [metadata.lastPathComponent, file(release).lastPathComponent]
    for entry in (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
      where !keep.contains(entry.lastPathComponent) { try? FileManager.default.removeItem(at: entry) }
  }
  func store(_ dmg: URL, release: MacRelease) throws {
    try UpdateFiles.verifyDigest(dmg, release: release)
    try UpdateFiles.quarantine(dmg, source: release.url)
    let fm = FileManager.default
    try fm.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    let final = file(release)
    if fm.fileExists(atPath: final.path) {
      _ = try fm.replaceItemAt(final, withItemAt: dmg)
    } else {
      try fm.moveItem(at: dmg, to: final)
    }
    try release.cacheMetadata().write(to: metadata, options: .atomic)
    prune(keeping: release)
  }
}

@MainActor final class MacUpdates {
  private let root: URL, target: URL
  private let version: String
  private let cache: InstallerCache
  private var cached: MacRelease?
  private var release: MacRelease?, phase = "idle", lastChecked = "", error = "", progress = 0
  private var automatic = false, backgroundApply = false, nextCheck = Date.distantPast
  private var clock: Timer?, stagingID: UUID?, stagingDigest = "", deciding = false
  var changed: ((Object) -> Void)?
  var canRestart: ((Bool) async -> Bool)?
  var terminate: (() -> Void)?
  private var prefs: URL { root.appendingPathComponent("Updates.json") }
  private var ticket: URL { root.appendingPathComponent("UpdateStage.json") }
  private func remember(_ id: UUID, owner: Int32 = getpid()) throws {
    let data = try JSONSerialization.data(withJSONObject: ["id": id.uuidString, "target": target.path, "pid": owner] as Object)
    try data.write(to: ticket, options: .atomic)
  }
  private func cleanInterruptedStage() {
    guard let data = try? Data(contentsOf: ticket), let values = (try? JSONSerialization.jsonObject(with: data)) as? Object,
      values["target"] as? String == target.path, let uuid = values["id"] as? String,
      let id = UUID(uuidString: uuid), let pid = values["pid"] as? Int32,
      !CommandLine.arguments.contains("--update-receipt"), kill(pid, 0) != 0, errno == ESRCH
    else { return }
    let stage = UpdateFiles.stage(target, id: id)
    // A prior version can be the only available recovery copy after an interrupted swap.
    if let backup = try? UpdateFiles.validateBundle(UpdateFiles.candidate(stage)),
       MacRelease.newer(version, than: backup) { return }
    try? FileManager.default.removeItem(at: stage)
    try? FileManager.default.removeItem(at: ticket)
  }
  init(root: URL, bundle: Bundle = .main) {
    self.root = root; target = bundle.bundleURL
    version = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
    cache = InstallerCache(directory: root.appendingPathComponent("UpdateInstaller", isDirectory: true))
    cached = cache.load(current: version)
    if let cached { release = cached; phase = "available" }
    if let data = try? Data(contentsOf: prefs), let p = (try? JSONSerialization.jsonObject(with: data)) as? Object {
      automatic = p["automatic"] as? Bool ?? false
      lastChecked = p["lastChecked"] as? String ?? ""
      if let date = ISO8601DateFormatter().date(from: lastChecked) { nextCheck = min(date, Date()).addingTimeInterval(12 * 3600) }
    }
    cleanInterruptedStage()
    let failure = root.appendingPathComponent("UpdateFailure.txt")
    if let message = try? String(contentsOf: failure, encoding: .utf8) {
      phase = "error"; error = message
      try? FileManager.default.removeItem(at: failure)
    }
  }
  var state: Object {
    ["current": version, "latest": release?.version ?? "", "notes": release?.notes ?? "", "phase": phase,
     "automatic": automatic, "lastChecked": lastChecked, "error": error, "progress": progress, "hasInstaller": cached != nil]
  }
  private func set(_ value: String, _ message: String = "") {
    phase = value; error = message; changed?(state)
  }
  func start() {
    clock = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
      MainActor.assumeIsolated { self?.tick() }
    }
    clock?.tolerance = 10
    DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak self] in self?.tick() }
  }
  func stop() {
    clock?.invalidate()
    if phase != "installing", let id = stagingID {
      try? FileManager.default.removeItem(at: UpdateFiles.stage(target, id: id))
      try? FileManager.default.removeItem(at: ticket)
    }
  }
  private func persist() throws {
    let data = try JSONSerialization.data(withJSONObject: ["automatic": automatic, "lastChecked": lastChecked] as Object)
    try data.write(to: prefs, options: .atomic)
  }
  func preferences(_ enabled: Bool) throws {
    let previous = automatic
    automatic = enabled
    do { try persist() } catch { automatic = previous; throw error }
    if enabled && !previous { nextCheck = .distantPast }
    changed?(state)
    tick()
  }
  private func tick() {
    if phase == "ready" {
      if (backgroundApply && automatic) || !backgroundApply {
        Task { await installIfSafe() }
      }
    } else if automatic && Date() >= nextCheck && ["idle", "current", "error", "available"].contains(phase) {
      check()
    }
  }
  func check() {
    guard ["idle", "current", "error", "available"].contains(phase) else { return }
    release = nil
    progress = 0
    set("checking")
    Task {
      do {
        let result = try await ReleaseNetwork.latest()
        if let cached, cached.digest != result.digest || !MacRelease.newer(result.version, than: version) {
          self.cached = nil
          try? FileManager.default.removeItem(at: cache.directory)
        }
        release = result
        lastChecked = ISO8601DateFormatter().string(from: Date())
        try persist()
        nextCheck = Date().addingTimeInterval(12 * 3600)
        guard MacRelease.newer(result.version, than: version) else { set("current"); return }
        set("available")
        if automatic { apply(background: true) }
      } catch {
        nextCheck = Date().addingTimeInterval(3600)
        set("error", error.localizedDescription)
      }
    }
  }
  func apply(background: Bool = false) {
    if phase == "ready" {
      backgroundApply = background
      Task { await installIfSafe() }
      return
    }
    guard let release, ["available", "error"].contains(phase),
      MacRelease.newer(release.version, than: version) else { return }
    backgroundApply = background
    progress = 0
    let reuse = cached?.digest == release.digest
    set(reuse ? "verifying" : "downloading")
    Task { [self] in
      let fm = FileManager.default, id = UUID()
      let work = fm.temporaryDirectory.appendingPathComponent("com.promptshelf.download-" + id.uuidString, isDirectory: true)
      do {
        try fm.createDirectory(at: work, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
        defer { try? fm.removeItem(at: work) }
        let storage = cache
        var fetch = !reuse
        if reuse {
          do {
            try await Task.detached(priority: .utility) { try UpdateFiles.verifyDigest(storage.file(release), release: release) }.value
          } catch {
            cached = nil
            try? fm.removeItem(at: storage.directory)
            fetch = true; set("downloading")
          }
        }
        if fetch {
          let dmg = try await ReleaseNetwork.download(release, to: work) { [weak self] value in
            Task { @MainActor in
              guard let self, self.phase == "downloading", value > self.progress else { return }
              self.progress = value; self.changed?(self.state)
            }
          }
          set("verifying")
          try await Task.detached(priority: .utility) { try storage.store(dmg, release: release) }.value
          cached = release
        }
        let app = target
        try remember(id)
        stagingID = id
        stagingDigest = try await Task.detached(priority: .utility) {
          let stage = try UpdateFiles.prepare(storage.file(release), release: release, target: app, id: id)
          return try UpdateFiles.executableDigest(UpdateFiles.candidate(stage))
        }.value
        set("ready")
        if !backgroundApply || automatic { await installIfSafe() }
      } catch {
        if let id = stagingID {
          try? fm.removeItem(at: UpdateFiles.stage(target, id: id))
          try? fm.removeItem(at: ticket)
        }
        stagingID = nil
        nextCheck = Date().addingTimeInterval(12 * 3600)
        set("error", error.localizedDescription)
      }
    }
  }
  func openInstaller() async throws {
    guard let release = cached, ["available", "ready", "error", "idle"].contains(phase) else {
      throw AppIssue("没有可打开的已校验安装包。")
    }
    let file = cache.file(release)
    do {
      try await Task.detached(priority: .utility) {
        try UpdateFiles.verifyDigest(file, release: release)
        try UpdateFiles.quarantine(file, source: release.url)
      }.value
    } catch {
      if cached?.digest == release.digest {
        cached = nil
        try? FileManager.default.removeItem(at: cache.directory)
        set("error", error.localizedDescription)
      }
      throw error
    }
    guard cached?.digest == release.digest, ["available", "ready", "error", "idle"].contains(phase),
          NSWorkspace.shared.open(file) else { throw AppIssue("macOS 未能打开安装包。") }
  }
  private func installIfSafe() async {
    guard !deciding, let id = stagingID, let release, phase == "ready", let canRestart else { return }
    if backgroundApply && !automatic { return }
    deciding = true
    defer { deciding = false }
    guard await canRestart(backgroundApply) else {
      set("ready", "更新已就绪。请先保存草稿并关闭编辑窗口，随后再安装。")
      return
    }
    guard phase == "ready", !backgroundApply || automatic else { return }
    do {
      let helper = Process()
      helper.executableURL = Bundle.main.executableURL
      helper.arguments = ["--finish-update", id.uuidString, String(getpid()), release.version, stagingDigest, backgroundApply ? "background" : "manual"]
      try helper.run()
      try? remember(id, owner: helper.processIdentifier)
      set("installing")
      terminate?()
    } catch { set("ready", "无法启动安装程序，请重试。") }
  }
}
