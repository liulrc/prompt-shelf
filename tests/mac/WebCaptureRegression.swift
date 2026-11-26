import AppKit
import ApplicationServices

@main struct QA {
  @MainActor static func main() {
    _ = NSApplication.shared
    NSApp.setActivationPolicy(.accessory)
    guard CGPreflightScreenCaptureAccess() && AXIsProcessTrusted() else {
      print("MISSING permissions")
      exit(12)
    }
    let stateFile = URL(fileURLWithPath: CommandLine.arguments[1])
    func state() -> [Int] {
      (try? String(contentsOf: stateFile, encoding: .utf8))?.split(separator: ",").compactMap {
        Int($0)
      } ?? []
    }
    let screen = NSScreen.screens.first!
    let rect: NSRect
    if let viewport = ProcessInfo.processInfo.environment["PS_TEST_CHROME_VIEWPORT"] {
      let rc = viewport.split(separator: ",").compactMap { Double($0) }
      guard rc.count == 4 else { exit(2) }
      rect = NSRect(x: rc[0], y: screen.frame.maxY - rc[1] - rc[3], width: rc[2], height: rc[3])
    } else {
      rect = NSRect(
        x: screen.visibleFrame.minX + 46, y: screen.visibleFrame.minY + 140, width: 576, height: 280
      )
    }
    let selection = rect.insetBy(dx: 3, dy: 2)
    let local = selection.offsetBy(dx: -screen.frame.minX, dy: -screen.frame.minY)
    let displayID =
      (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as! NSNumber).uint32Value
    let quartz = CGDisplayBounds(displayID)
    let center = CGPoint(
      x: quartz.minX + rect.midX - screen.frame.minX, y: quartz.minY + screen.frame.maxY - rect.midY
    )
    func pump(_ secs: Double) {
      let end = Date(timeIntervalSinceNow: secs)
      while Date() < end {
        if let e = NSApp.nextEvent(
          matching: .any, until: Date(timeIntervalSinceNow: 0.004), inMode: .default, dequeue: true)
        {
          NSApp.sendEvent(e)
        }
        RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.004))
        NSApp.updateWindows()
      }
    }
    func check(_ ok: Bool, _ msg: String) {
      if !ok {
        print("FAILED", msg, "state", state())
        exit(8)
      }
    }
    func wait(_ secs: Double, _ condition: () -> Bool) -> Bool {
      let end = Date(timeIntervalSinceNow: secs)
      while !condition() && Date() < end { pump(0.04) }
      return condition()
    }
    func walk(_ v: NSView) -> [NSView] { [v] + v.subviews.flatMap { walk($0) } }
    func tools() -> [NSView] {
      NSApp.windows.filter { $0.level == .statusBar && $0.isVisible }.compactMap { $0.contentView }
        .flatMap { walk($0) }
    }
    func button(_ text: String) -> NSButton? {
      tools().compactMap { $0 as? NSButton }.first {
        $0.title == text && $0.isEnabled && !$0.isHidden
      }
    }
    func click(_ text: String) {
      check(wait(5) { button(text) != nil }, "missing button " + text)
      button(text)!.performClick(nil)
    }
    func label() -> String {
      tools().compactMap { $0 as? NSTextField }.map { $0.stringValue }.joined(separator: " ")
    }
    func select(_ session: NativeCaptureSession) {
      check(
        state().count == 3 && ownerAtPoint() == state()[0],
        "external test page is obscured before selection")
      session.begin()
      let w = NSApp.windows.first {
        $0.isVisible && $0.level == .screenSaver && $0.frame == screen.frame
      }!
      let v = w.contentView!
      for (type, point) in [
        (NSEvent.EventType.leftMouseDown, NSPoint(x: local.minX, y: local.minY)),
        (.leftMouseDragged, NSPoint(x: local.maxX, y: local.maxY)),
        (.leftMouseUp, NSPoint(x: local.maxX, y: local.maxY)),
      ] {
        let e = NSEvent.mouseEvent(
          with: type, location: point, modifierFlags: [],
          timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: w.windowNumber,
          context: nil, eventNumber: 1, clickCount: 1, pressure: 1)!
        switch type {
        case .leftMouseDown: v.mouseDown(with: e)
        case .leftMouseDragged: v.mouseDragged(with: e)
        default: v.mouseUp(with: e)
        }
      }
    }
    func ownerAtPoint() -> Int? {
      let list =
        CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
        as? [[String: Any]] ?? []
      return list.first(where: { row in
        guard (row[kCGWindowAlpha as String] as? Double ?? 1) > 0.02,
          row[kCGWindowOwnerPID as String] as? Int32 != ProcessInfo.processInfo.processIdentifier,
          let layer = row[kCGWindowLayer as String] as? Int, (0...8).contains(layer),
          let dict = row[kCGWindowBounds as String] as? [String: Any],
          let r = CGRect(dictionaryRepresentation: dict as CFDictionary)
        else { return false }
        return r.contains(center)
      })?[kCGWindowOwnerPID as String] as? Int
    }
    func setScroll(_ y: Int) {
      try! String(y).write(toFile: stateFile.path + ".scroll", atomically: true, encoding: .utf8)
      check(wait(4) { state().count == 3 && state()[1] == y }, "fixture scroll " + String(y))
    }
    check(state().count == 3 && ownerAtPoint() == state()[0], "isolated test page is obscured")
    let maxY = state()[2]
    var result: CGImage?
    var ended = false
    var destination: CaptureDestination?
    var s = NativeCaptureSession(isLong: false, automatic: false)
    func attach() {
      s.onStatus = { print("status:", $0) }
      s.onFinish = { image, action in
        result = image
        destination = action
        ended = true
      }
      select(s)
    }
    func simulate(_ mode: String) {
      setScroll(0)
      pump(0.22)
      result = nil
      ended = false
      s = NativeCaptureSession(isLong: false, automatic: false)
      attach()
      click("滚动长截图")
      click("完成并编辑")
      pump(0.5)
      check(!ended, "first frame must not be a long result")
      print("first-frame guard", label())
      if mode == "manual" {
        // Seeking beyond the overlap must keep the capture open, then recover when the page returns.
        setScroll(maxY)
        pump(0.4)
        click("完成并编辑")
        pump(0.45)
        check(!ended && label().contains("未拼入"), "unmatched page rejected")
        setScroll(0)
        pump(0.35)
        for target in stride(from: 80, to: maxY, by: 80) {
          setScroll(target)
          pump(0.30)
        }
        setScroll(maxY)
        click("置顶")
      } else {
        check(
          ownerAtPoint() == state()[0], "external test page was obscured before automatic wheel")
        click("自动滚动")
      }
      let receipt = wait(35) { ended }
      if !receipt { print("last status:", label()) }
      check(receipt && result != nil, "long capture completion " + mode)
      check(destination == (mode == "manual" ? .pin : .edit), "stitched result kept chosen destination")
      let img = result!
      let scale = Double(s.frameHeight) / Double(selection.height)
      let expected = s.frameHeight + Int(Double(maxY) * scale)
      let bytes = NSBitmapImageRep(cgImage: img)
      let last = bytes.colorAt(x: 12, y: img.height - 10)?.usingColorSpace(.sRGB)
      let top = bytes.colorAt(x: 12, y: 4)?.usingColorSpace(.sRGB)
      print(
        mode, "image", img.width, "x", img.height, "expected", expected, "bottom offset", state(),
        "footer", last as Any, "header", top as Any)
      check(
        abs(expected - img.height) <= 2 && abs(state()[1] - maxY) <= 1,
        "all scroll displacement included")
      check(
        (top?.redComponent ?? 0) > 0.75 && (top?.greenComponent ?? 1) < 0.62, "start page pixels")
      check(
        (last?.greenComponent ?? 0) > 0.5 && (last?.redComponent ?? 1) < 0.25,
        "end page footer pixels")
      if ProcessInfo.processInfo.environment["PS_CAPTURE_TEST_STICKY"] == "1" {
        var orangeRows = 0
        for row in 0..<img.height {
          guard let color = bytes.colorAt(x: 12, y: row)?.usingColorSpace(.sRGB) else { continue }
          if color.redComponent > 0.75 && color.greenComponent < 0.62 { orangeRows += 1 }
        }
        check(
          orangeRows > Int(25 * scale) && orangeRows < Int(70 * scale),
          "fixed header should appear only once")
      }
      if let out = ProcessInfo.processInfo.environment["PS_CAPTURE_TEST_OUTPUT"] {
        let file = URL(fileURLWithPath: out, isDirectory: true).appendingPathComponent(
          mode + ".png")
        try! bytes.representation(using: .png, properties: [:])!.write(to: file)
      }
    }
    for (title, action) in [("编辑截图", CaptureDestination.edit), ("复制", .copy), ("保存", .save), ("置顶", .pin)] {
      result = nil
      ended = false
      s = NativeCaptureSession(isLong: false, automatic: false)
      attach()
      check(wait(5) { button("编辑截图") != nil } && !ended, "normal selection stays open")
      click(title)
      check(ended && result?.height == s.frameHeight && destination == action, "ordinary capture " + title)
      print("normal", title, result!.width, result!.height)
    }
    for long in [false, true] {
      result = nil
      ended = false
      s = NativeCaptureSession(isLong: false, automatic: false)
      attach()
      check(wait(5) { button("复制") != nil }, "toolbar ready for Escape")
      if long { click("滚动长截图"); setScroll(55); pump(0.25) }
      let fixturePID = pid_t(state()[0])
      NSRunningApplication(processIdentifier: fixturePID)?.activate(options: [])
      check(wait(2) { NSWorkspace.shared.frontmostApplication?.processIdentifier == fixturePID },
        "external page holds focus before Escape")
      for down in [true, false] {
        CGEvent(keyboardEventSource: nil, virtualKey: 53, keyDown: down)?.post(tap: .cghidEventTap)
      }
      check(wait(2) { ended } && result == nil && tools().isEmpty, "Escape cancelled live capture")
      print("Escape cancelled with external fixture focused, long", long)
      setScroll(0)
    }
    simulate("manual")
    simulate("auto")
    print(
      "PASS independent browser process, text page, manual auto-acquisition, injected automatic wheel, exact page extent and last-row footer"
    )
  }
}
