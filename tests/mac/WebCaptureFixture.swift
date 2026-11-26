import AppKit
import WebKit

@main struct PageTarget {
  @MainActor static func main() {
    let output = URL(fileURLWithPath: CommandLine.arguments[1])
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    let screen = NSScreen.screens.first!
    let rect = NSRect(
      x: screen.visibleFrame.minX + 46, y: screen.visibleFrame.minY + 140, width: 576, height: 280)
    let win = NSPanel(
      contentRect: rect, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered,
      defer: false)
    win.isReleasedWhenClosed = false
    win.hidesOnDeactivate = false
    win.level = .floating
    let cfg = WKWebViewConfiguration()
    cfg.websiteDataStore = .nonPersistent()
    let view = WKWebView(frame: NSRect(origin: .zero, size: rect.size), configuration: cfg)
    var url = URLComponents(
      url: URL(fileURLWithPath: CommandLine.arguments[2]), resolvingAgainstBaseURL: false)!
    if ProcessInfo.processInfo.environment["PS_CAPTURE_TEST_STICKY"] == "1" {
      url.fragment = "sticky"
    }
    view.loadFileURL(url.url!, allowingReadAccessTo: url.url!.deletingLastPathComponent())
    win.contentView = view
    win.orderFrontRegardless()
    app.activate(ignoringOtherApps: true)
    let limit = Date(timeIntervalSinceNow: 95)
    let timer = Timer.scheduledTimer(withTimeInterval: 0.07, repeats: true) { _ in
      MainActor.assumeIsolated {
        if let command = try? String(contentsOfFile: output.path + ".scroll", encoding: .utf8),
          let dest = Int(command)
        {
          view.evaluateJavaScript("window.scrollTo(0,\(dest))")
          try? FileManager.default.removeItem(atPath: output.path + ".scroll")
        }
        view.evaluateJavaScript(
          "[Math.round(scrollY), document.documentElement.scrollHeight-innerHeight]"
        ) { val, _ in
          if let parts = val as? [NSNumber], parts.count == 2 && parts[1].intValue > 0 {
            try? "\(ProcessInfo.processInfo.processIdentifier),\(parts[0]),\(parts[1])".write(
              to: output, atomically: true, encoding: .utf8)
          }
        }
        if Date() > limit || FileManager.default.fileExists(atPath: output.path + ".done") {
          win.close()
          exit(0)
        }
      }
    }
    _ = timer
    app.run()
  }
}
