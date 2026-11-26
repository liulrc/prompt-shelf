import AppKit
import Darwin

let smoke = CommandLine.arguments.contains("--smoke")
let fm = FileManager.default
let root =
  smoke
  ? fm.temporaryDirectory.appendingPathComponent("PromptShelf-smoke-" + UUID().uuidString)
  : fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent(
    "词匣", isDirectory: true)
if CommandLine.arguments.dropFirst().first == "--finish-update" {
  exit(UpdateFiles.handoff(arguments: CommandLine.arguments, root: root))
}
MainActor.assumeIsolated {
  do {
    try fm.createDirectory(
      at: root, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    // Only one listener and one set of registered shortcuts per user.
    let lockFD = Darwin.open(
      root.appendingPathComponent("instance.lock").path, O_RDWR | O_CREAT | O_CLOEXEC, 0o600)
    if lockFD < 0 { throw AppIssue("无法创建词匣数据目录。") }
    if flock(lockFD, LOCK_EX | LOCK_NB) != 0 {
      if !smoke { DistributedNotificationCenter.default().postNotificationName(
        DesktopApp.reopenNotification, object: nil, userInfo: nil, deliverImmediately: true) }
      exit(0)
    }
    guard let resources = Bundle.main.resourceURL else { throw AppIssue("应用资源缺失，请从安装包重新复制。") }
    let store = try Archive(root: root)
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    let appDelegate = DesktopApp(
      archive: store, webRoot: resources.appendingPathComponent("Web", isDirectory: true),
      smoke: smoke)
    app.delegate = appDelegate
    app.run()
    withExtendedLifetime(appDelegate) {}
  } catch {
    fputs(error.localizedDescription + "\n", stderr)
    exit(1)
  }
}
