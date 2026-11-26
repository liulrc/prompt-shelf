import CryptoKit
import Foundation

@main enum UpdateRegression {
  static func require(_ ok: Bool, _ message: String) throws {
    if !ok { throw AppIssue("更新测试失败：" + message) }
  }
  static func expectError(_ message: String, _ work: () throws -> Void) throws {
    do { try work() } catch { return }
    throw AppIssue("意外接受了" + message)
  }
  // This self-built fixture exercises real Launch Services without registering shortcuts,
  // reading the real archive, or downloading / modifying any user-installed app.
  static func handoffFixture(in temp: URL) throws {
    let target = temp.appendingPathComponent("词匣更新测试.app")
    let id = UUID(), staging = UpdateFiles.stage(target, id: id)
    try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: false)
    for (app, version) in [(target, "1.3.0"), (UpdateFiles.candidate(staging), "1.4.0")] {
      let contents = app.appendingPathComponent("Contents"), bin = contents.appendingPathComponent("MacOS")
      try FileManager.default.createDirectory(at: bin, withIntermediateDirectories: true)
      let info: Object = ["CFBundleIdentifier": UpdateFiles.bundleID, "CFBundleExecutable": "PromptShelf",
        "CFBundlePackageType": "APPL", "CFBundleName": "词匣更新测试", "CFBundleShortVersionString": version,
        "CFBundleVersion": "1", "LSUIElement": true]
      try PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0)
        .write(to: contents.appendingPathComponent("Info.plist"))
      try FileManager.default.copyItem(at: URL(fileURLWithPath: CommandLine.arguments[0]), to: bin.appendingPathComponent("PromptShelf"))
      try UpdateFiles.run("/usr/bin/codesign", ["--force", "--sign", "-", app.path], failure: "测试签名失败")
    }
    try UpdateFiles.run(target.appendingPathComponent("Contents/MacOS/PromptShelf").path, ["--fixture-parent", id.uuidString], failure: "测试旧版进程失败")
    for _ in 0..<320 {
      if !FileManager.default.fileExists(atPath: staging.path) { break }
      Thread.sleep(forTimeInterval: 0.25)
    }
    try require(try UpdateFiles.validateBundle(target) == "1.4.0" && !FileManager.default.fileExists(atPath: staging.path),
                "新进程启动回执失败：" + ((try? String(contentsOf: temp.appendingPathComponent("UpdateFailure.txt"), encoding: .utf8)) ?? "超时"))
  }
  @MainActor static func main() throws {
    let args = CommandLine.arguments
    let fixtureRoot = Bundle.main.bundleURL.deletingLastPathComponent()
    if let mode = args.dropFirst().first, ["--live-check", "--live-stage"].contains(mode) {
      let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
      try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false)
      defer { try? FileManager.default.removeItem(at: root) }
      var bundle = Bundle.main
      if args.count == 3 {
        let copied = root.appendingPathComponent("测试安装.app")
        try FileManager.default.copyItem(at: URL(fileURLWithPath: args[2]), to: copied)
        guard let installed = Bundle(url: copied) else { throw AppIssue("测试应用路径无效。") }
        bundle = installed
      } else if mode == "--live-stage" { throw AppIssue("需要旧版测试 app。") }
      let updates = MacUpdates(root: root, bundle: bundle)
      updates.canRestart = { _ in false }
      func waitWhile(_ busy: [String]) {
        let deadline = Date().addingTimeInterval(100)
        while busy.contains(updates.state["phase"] as? String ?? "") && Date() < deadline {
          RunLoop.main.run(until: Date().addingTimeInterval(0.1))
        }
      }
      updates.check()
      waitWhile(["checking"])
      try require(["available", "current"].contains(updates.state["phase"] as? String ?? ""),
        "线上发布检查：" + (updates.state["error"] as? String ?? ""))
      if mode == "--live-stage" {
        try require(updates.state["phase"] as? String == "available", "需要测试升级的旧版本")
        updates.apply()
        waitWhile(["downloading", "verifying"])
        try require(updates.state["phase"] as? String == "ready" && updates.state["hasInstaller"] as? Bool == true,
          "线上安装包校验：" + (updates.state["error"] as? String ?? ""))
        let restored = MacUpdates(root: root, bundle: bundle)
        try require(restored.state["hasInstaller"] as? Bool == true, "已校验安装包的落盘回读")
      }
      print("PASS public macOS release: current=\(updates.state["current"]!) latest=\(updates.state["latest"]!) phase=\(updates.state["phase"]!)")
      updates.stop()
      return
    }
    if args.dropFirst().first == "--fixture-parent" {
      let helper = Process()
      helper.executableURL = Bundle.main.executableURL
      let stage = UpdateFiles.stage(Bundle.main.bundleURL, id: UUID(uuidString: args[2])!)
      helper.arguments = ["--finish-update", args[2], String(getpid()), "1.4.0",
                          try UpdateFiles.executableDigest(UpdateFiles.candidate(stage)), "background"]
      try helper.run()
      return
    }
    if args.dropFirst().first == "--finish-update" { exit(UpdateFiles.handoff(arguments: args, root: fixtureRoot)) }
    if args.contains("--update-receipt") {
      UpdateFiles.confirmLaunch(root: fixtureRoot, arguments: args)
      return
    }
    guard args.count == 3 else { throw AppIssue("需要旧版 app 和新版 DMG 路径。") }
    let fm = FileManager.default, temp = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try fm.createDirectory(at: temp, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
    defer { try? fm.removeItem(at: temp) }
    let target = temp.appendingPathComponent("测试安装.app"), dmg = temp.appendingPathComponent("local.dmg")
    try fm.copyItem(at: URL(fileURLWithPath: args[1]), to: target)
    try fm.copyItem(at: URL(fileURLWithPath: args[2]), to: dmg)
    let data = try Data(contentsOf: dmg), digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    let version = "1.4.0", name = "PromptShelf-" + version + "-macOS-universal.dmg"
    var asset: Object = ["name":name, "browser_download_url": MacRelease.repository + "/releases/download/v" + version + "/" + name,
                         "size":data.count, "digest":"sha256:" + digest]
    func release() throws -> MacRelease {
      let record: Object = ["tag_name":"v" + version, "draft":false, "prerelease":false, "assets":[asset]]
      return try MacRelease(data: JSONSerialization.data(withJSONObject: record))
    }
    try require(!MacRelease.newer("1.4.0", than: "1.4.0") && MacRelease.newer("1.10.0", than: "1.4.9"), "版本比较")
    for bad in ["1.4", "9.0.0/../../x", "1.40.01", "1.4.0-rc1", "1.4.0.1"] {
      try require(MacRelease.parts(bad) == nil, "非正式标签")
    }
    let clean = asset
    asset["browser_download_url"] = "https://example.com/test.dmg"
    try expectError("其他下载源") { _ = try release() }
    asset = clean
    asset["digest"] = "sha256:" + String(repeating: "a", count: 64)
    try expectError("损坏的下载包") { try UpdateFiles.verifyDigest(dmg, release: try release()) }
    asset = clean
    let record = try release(), before = try UpdateFiles.validateBundle(target)
    let stage = try UpdateFiles.prepare(dmg, release: record, target: target, id: UUID())
    let copy = UpdateFiles.candidate(stage)
    try require(try UpdateFiles.validateBundle(copy) == version, "暂存版本")
    try require(getxattr(copy.path, "com.apple.quarantine", nil, 0, 0, XATTR_NOFOLLOW) > 0, "保留来源标记")
    let preparedHash = try UpdateFiles.executableDigest(copy)
    try expectError("暂存期间变更的应用") {
      try UpdateFiles.replaceAndLaunch(target: target, staging: stage, expected: version, digest: "invalid") { true }
    }
    try expectError("未启动的新版") {
      try UpdateFiles.replaceAndLaunch(target: target, staging: stage, expected: version, digest: preparedHash) { false }
    }
    try require(try UpdateFiles.validateBundle(target) == before, "启动失败未恢复")
    try UpdateFiles.replaceAndLaunch(target: target, staging: stage, expected: version, digest: preparedHash) {
      try require(try UpdateFiles.validateBundle(target) == version && UpdateFiles.validateBundle(copy) == before, "原子替换")
      return true
    }
    try handoffFixture(in: temp)
    print("PASS real Launch Services restart, receipt and cleanup in isolated local fixture")
    print("PASS macOS release policy, checksum/tamper, real DMG attach/copy, signature, quarantine, rollback and atomic replacement")
  }
}
