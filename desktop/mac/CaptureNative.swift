import AppKit
import ApplicationServices
import ScreenCaptureKit

@_silgen_name("ps_scroll_overlap")
private func scrollOverlap(
  _ previous: UnsafePointer<UInt8>, _ next: UnsafePointer<UInt8>,
  _ width: UInt32, _ height: UInt32, _ stride: UInt32
) -> UInt32

@MainActor private final class SelectionPanel: NSPanel {
  override var canBecomeKey: Bool { true }
}
@MainActor private final class RegionSelector: NSView {
  var selected: ((NSRect) -> Void)?
  var dismissed: (() -> Void)?
  var hint = ""
  var minimum = NSSize(width: 8, height: 8)
  private var anchor: NSPoint?
  private var current: NSPoint?
  override var acceptsFirstResponder: Bool { true }
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  private var selection: NSRect? {
    guard let a = anchor, let b = current else { return nil }
    return bounds.intersection(
      NSRect(x: min(a.x, b.x), y: min(a.y, b.y), width: abs(b.x - a.x), height: abs(b.y - a.y)))
  }
  override func resetCursorRects() { addCursorRect(bounds, cursor: .crosshair) }
  override func draw(_ dirtyRect: NSRect) {
    NSColor.black.withAlphaComponent(0.36).setFill()
    bounds.fill()
    if let rect = selection {
      NSColor.clear.setFill()
      rect.fill(using: .copy)
      NSColor(calibratedRed: 0.97, green: 0.82, blue: 0.44, alpha: 1).setStroke()
      NSBezierPath(rect: rect).stroke()
    }
    let info = selection.map { "框选区域  \(Int($0.width)) × \(Int($0.height)) pt" } ?? hint
    let attrs: [NSAttributedString.Key: Any] = [
      .font: NSFont.systemFont(ofSize: 15, weight: .medium), .foregroundColor: NSColor.white,
    ]
    let string = info as NSString
    let size = string.size(withAttributes: attrs)
    let label = NSRect(
      x: (bounds.width - size.width) / 2 - 14, y: bounds.height - 88, width: size.width + 28,
      height: size.height + 16)
    NSColor.black.withAlphaComponent(0.78).setFill()
    NSBezierPath(roundedRect: label, xRadius: 8, yRadius: 8).fill()
    string.draw(at: NSPoint(x: label.minX + 14, y: label.minY + 8), withAttributes: attrs)
  }
  override func mouseDown(with event: NSEvent) {
    anchor = convert(event.locationInWindow, from: nil)
    current = anchor
    needsDisplay = true
  }
  override func mouseDragged(with event: NSEvent) {
    current = convert(event.locationInWindow, from: nil)
    needsDisplay = true
  }
  override func mouseUp(with event: NSEvent) {
    current = convert(event.locationInWindow, from: nil)
    guard let rect = selection, rect.width >= minimum.width, rect.height >= minimum.height else {
      anchor = nil
      current = nil
      needsDisplay = true
      hint = "请重新框选至少 \(Int(minimum.width)) × \(Int(minimum.height)) pt 的区域 · Esc 取消"
      return
    }
    selected?(rect.integral.intersection(bounds))
  }
  override func rightMouseDown(with event: NSEvent) { dismissed?() }
  override func keyDown(with event: NSEvent) {
    if event.keyCode == 53 { dismissed?() } else { super.keyDown(with: event) }
  }
  override func cancelOperation(_ sender: Any?) { dismissed?() }
}

private struct CapturedPixels {
  let width: Int
  let height: Int
  var stride: Int { width * 4 }
  let data: Data
  static let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
  static let format = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue).union(
    .byteOrder32Big)
  init(_ image: CGImage) throws {
    width = image.width
    height = image.height
    let w = image.width
    let h = image.height
    guard w > 0, h > 0, h <= 32_000_000 / w else { throw NativeFailure("选区过大，请缩小后重试。") }
    var bytes = Data(count: w * h * 4)
    let rendered = bytes.withUnsafeMutableBytes { raw -> Bool in
      guard
        let ctx = CGContext(
          data: raw.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
          space: Self.colorSpace, bitmapInfo: Self.format.rawValue)
      else { return false }
      ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
      return true
    }
    guard rendered else { throw NativeFailure("无法读取这帧截图。") }
    data = bytes
  }
  func matchingRows(_ newer: CapturedPixels) -> Int {
    guard width == newer.width, height == newer.height else { return 0 }
    return data.withUnsafeBytes { old in
      newer.data.withUnsafeBytes { new in
        Int(
          scrollOverlap(
            old.bindMemory(to: UInt8.self).baseAddress!,
            new.bindMemory(to: UInt8.self).baseAddress!,
            UInt32(width), UInt32(height), UInt32(stride)))
      }
    }
  }
  static func makeImage(_ bytes: Data, width: Int, height: Int) -> CGImage? {
    guard let provider = CGDataProvider(data: bytes as CFData) else { return nil }
    return CGImage(
      width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
      space: colorSpace, bitmapInfo: format, provider: provider, decode: nil,
      shouldInterpolate: false, intent: .defaultIntent)
  }
}

@MainActor final class NativeCaptureSession: NSObject {
  let isLong: Bool
  var onStatus: ((String) -> Void)?
  var onFinish: ((CGImage?) -> Void)?
  var hasFrames: Bool { previous != nil }
  private(set) var frameHeight = 0
  private var automatic: Bool
  private var done = false
  private var working = false
  private var overlays: [NSPanel] = []
  private var toolbar: NSPanel?
  private var statusField: NSTextField?
  private var manualButton: NSButton?
  private var autoButton: NSButton?
  private var finishButton: NSButton?
  private var task: Task<Void, Never>?
  private var filter: SCContentFilter?
  private var configuration: SCStreamConfiguration?
  private var scrollCenter = CGPoint.zero
  private var scrollTarget: pid_t?
  private var cursorBeforeAutomatic: CGPoint?
  private var previous: CapturedPixels?
  private var combined = Data()
  private var totalRows = 0
  private var frames = 0
  private var unchanged = 0
  private var step: Int32 = 0
  private var scheduled: DispatchWorkItem?
  init(isLong: Bool, automatic: Bool) {
    self.isLong = isLong
    self.automatic = automatic
  }
  func begin() {
    guard CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess() else {
      fail("需要屏幕录制权限。请在「系统设置 → 隐私与安全性 → 屏幕与系统录音」中允许词匣，必要时退出并重新打开。")
      return
    }
    let mouse = NSEvent.mouseLocation
    for screen in NSScreen.screens {
      let p = SelectionPanel(
        contentRect: screen.frame, styleMask: [.borderless, .nonactivatingPanel],
        backing: .buffered, defer: false, screen: nil)
      p.setFrame(screen.frame, display: false)
      p.level = .screenSaver
      p.backgroundColor = .clear
      p.isOpaque = false
      p.hasShadow = false
      p.hidesOnDeactivate = false
      p.isReleasedWhenClosed = false
      p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
      let selector = RegionSelector(frame: NSRect(origin: .zero, size: screen.frame.size))
      if isLong { selector.minimum = NSSize(width: 40, height: 48) }
      selector.hint = isLong ? "在同一显示器拖选滚动内容区域，避开固定标题栏 · Esc 取消" : "在任意显示器拖动框选 · Esc 取消"
      selector.selected = { [weak self] rect in self?.choose(screen: screen, localRect: rect) }
      selector.dismissed = { [weak self] in self?.cancel() }
      p.contentView = selector
      overlays.append(p)
      p.orderFrontRegardless()
      if screen.frame.contains(mouse) {
        p.makeKey()
        p.makeFirstResponder(selector)
      }
    }
    if overlays.isEmpty { fail("没有可用的显示器。") }
  }
  private func removeOverlays() {
    for p in overlays {
      p.orderOut(nil)
      p.close()
    }
    overlays.removeAll()
  }
  private func choose(screen: NSScreen, localRect: NSRect) {
    guard !done, !overlays.isEmpty else { return }
    guard
      let displayID =
        (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?
        .uint32Value
    else {
      fail("无法识别当前显示器。")
      return
    }
    removeOverlays()
    let quartzBounds = CGDisplayBounds(displayID)
    let top = screen.frame.height - localRect.maxY
    scrollCenter = CGPoint(
      x: quartzBounds.minX + localRect.midX * quartzBounds.width / screen.frame.width,
      y: quartzBounds.minY + (top + localRect.height / 2) * quartzBounds.height
        / screen.frame.height)
    step = Int32(min(650, max(10, localRect.height * 0.53)))
    if isLong {
      if automatic && !AXIsProcessTrusted() { automatic = false }
      showToolbar(
        screen: screen, selection: localRect.offsetBy(dx: screen.frame.minX, dy: screen.frame.minY))
    }
    task = Task { [weak self] in
      guard let self else { return }
      do {
        try await Task.sleep(nanoseconds: 180_000_000)
        let content = try await SCShareableContent.excludingDesktopWindows(
          false, onScreenWindowsOnly: true)
        guard !done else { return }
        guard let display = content.displays.first(where: { $0.displayID == displayID }) else {
          throw NativeFailure("显示器已断开。")
        }
        let excluded = content.windows.filter { w in
          guard let toolbar = self.toolbar else { return false }
          return w.windowID == CGWindowID(toolbar.windowNumber)
        }
        let filter = SCContentFilter(display: display, excludingWindows: excluded)
        let config = SCStreamConfiguration()
        let sx = CGFloat(display.width) / screen.frame.width
        let sy = CGFloat(display.height) / screen.frame.height
        config.sourceRect = CGRect(
          x: localRect.minX * sx, y: top * sy, width: localRect.width * sx,
          height: localRect.height * sy)
        let scale = CGFloat(filter.pointPixelScale)
        config.width = max(1, Int((config.sourceRect.width * scale).rounded()))
        config.height = max(1, Int((config.sourceRect.height * scale).rounded()))
        guard config.height <= 32_000_000 / config.width else {
          throw NativeFailure("选区超过 3200 万像素，请缩小范围。")
        }
        config.showsCursor = false
        self.filter = filter
        self.configuration = config
        if isLong { scrollTarget = windowAtScrollPoint() }
        takeFrame()
      } catch {
        if !done { fail(error.localizedDescription) }
      }
    }
  }
  private func showToolbar(screen: NSScreen, selection: CGRect) {
    let visible = screen.visibleFrame
    let width = min(490, visible.width - 10)
    let h: CGFloat = 72
    var origin = NSPoint(
      x: min(visible.maxX - width - 6, max(visible.minX + 6, selection.midX - width / 2)),
      y: selection.minY - h - 6)
    if origin.y < visible.minY + 5 { origin.y = min(visible.maxY - h - 6, selection.maxY + 6) }
    let panel = NSPanel(
      contentRect: NSRect(origin: origin, size: NSSize(width: width, height: h)),
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered, defer: false)
    panel.level = .statusBar
    panel.hidesOnDeactivate = false
    panel.isReleasedWhenClosed = false
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    panel.isMovableByWindowBackground = true
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = true
    let view = NSView(frame: NSRect(x: 0, y: 0, width: width, height: h))
    view.wantsLayer = true
    view.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
    view.layer?.cornerRadius = 9
    let label = NSTextField(labelWithString: "准备截取首帧…")
    label.frame = NSRect(x: 12, y: 44, width: width - 24, height: 20)
    label.font = .systemFont(ofSize: 12, weight: .medium)
    label.lineBreakMode = .byTruncatingTail
    view.addSubview(label)
    statusField = label
    let manual = NSButton(title: "采集当前屏", target: self, action: #selector(manualStep))
    let auto = NSButton(title: "自动滚动", target: self, action: #selector(toggleAuto))
    let finish = NSButton(title: "完成", target: self, action: #selector(finish))
    let quit = NSButton(title: "取消", target: self, action: #selector(cancel))
    manualButton = manual
    autoButton = auto
    finishButton = finish
    for b in [manual, auto, finish, quit] {
      b.bezelStyle = .rounded
      b.controlSize = .small
    }
    let stack = NSStackView(views: [manual, auto, finish, quit])
    stack.spacing = 6
    stack.frame = NSRect(x: 9, y: 7, width: min(375, width - 18), height: 28)
    view.addSubview(stack)
    panel.contentView = view
    toolbar = panel
    panel.orderFrontRegardless()
    setStatus("准备截取首帧…")
  }
  private func setStatus(_ text: String) {
    statusField?.stringValue = text
    statusField?.toolTip = text
    manualButton?.isEnabled = hasFrames && !working && !automatic
    autoButton?.isEnabled = hasFrames
    autoButton?.title = automatic ? "切换手动" : "自动滚动"
    finishButton?.isEnabled = hasFrames
  }
  private func takeFrame() {
    guard !done, !working, let filter, let configuration else { return }
    working = true
    manualButton?.isEnabled = false
    task = Task { [weak self] in
      guard let self else { return }
      do {
        let image = try await SCScreenshotManager.captureImage(
          contentFilter: filter, configuration: configuration)
        guard !done else { return }
        working = false
        if frameHeight == 0 { frameHeight = image.height }
        if !isLong {
          end(with: image)
          return
        }
        try ingest(CapturedPixels(image))
      } catch {
        guard !done else { return }
        working = false
        if hasFrames {
          automatic = false
          setStatus("本帧采集失败，可重试或完成已采集内容。")
          onStatus?(error.localizedDescription)
        } else {
          fail("截图失败。" + error.localizedDescription)
        }
      }
    }
  }
  private func ingest(_ next: CapturedPixels) throws {
    if let previous {
      let overlap = previous.matchingRows(next)
      if overlap == next.height {
        unchanged += 1
        if automatic && unchanged >= 3 {
          onStatus?("画面连续无变化，已完成长截图。")
          finish()
          return
        }
        setStatus("画面没有变化 · \(totalRows) px")
        scheduleScroll()
        return
      }
      guard overlap > 0, overlap < next.height else {
        automatic = false
        setStatus("两屏缺少可靠重叠：请向上微调，再采集当前屏。")
        return
      }
      let extra = next.height - overlap
      guard totalRows + extra <= min(32000, 32_000_000 / next.width) else {
        onStatus?("已达到长图尺寸上限，已保存已拼接的部分。")
        finish()
        return
      }
      combined.append(next.data.suffix(extra * next.stride))
      totalRows += extra
    } else {
      combined = next.data
      totalRows = next.height
    }
    previous = next
    frames += 1
    unchanged = 0
    setStatus(
      automatic
        ? "自动滚动 · 已采集 \(frames) 屏，\(totalRows) px" : "手动向下滚动约半屏，再点采集 · \(frames) 屏，\(totalRows) px")
    scheduleScroll()
  }
  private func scheduleScroll() {
    scheduled?.cancel()
    guard automatic, !done else { return }
    let job = DispatchWorkItem { [weak self] in self?.scrollOnce() }
    scheduled = job
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.24, execute: job)
  }
  private func windowAtScrollPoint() -> pid_t? {
    let windows =
      CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
      as? [[String: Any]] ?? []
    for window in windows {
      guard let id = window[kCGWindowNumber as String] as? NSNumber,
        id.intValue != toolbar?.windowNumber,
        let layer = window[kCGWindowLayer as String] as? NSNumber,
        layer.intValue >= NSWindow.Level.normal.rawValue,
        layer.intValue <= NSWindow.Level.modalPanel.rawValue,
        (window[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 1 > 0.02,
        let box = window[kCGWindowBounds as String] as? [String: Any],
        let bounds = CGRect(dictionaryRepresentation: box as CFDictionary),
        bounds.contains(scrollCenter),
        let owner = window[kCGWindowOwnerPID as String] as? NSNumber
      else { continue }
      return owner.int32Value
    }
    return nil
  }
  private func scrollOnce() {
    guard !done, automatic, !working else { return }
    guard AXIsProcessTrusted(),
      let event = CGEvent(
        scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: -step, wheel2: 0,
        wheel3: 0)
    else {
      automatic = false
      setStatus("自动滚动需要辅助功能权限。可手动滚动后点采集。")
      return
    }
    if cursorBeforeAutomatic == nil {
      cursorBeforeAutomatic = CGEvent(source: nil)?.location
      CGWarpMouseCursorPosition(scrollCenter)
    }
    if let target = scrollTarget, windowAtScrollPoint() != target {
      automatic = false
      setStatus("选区上方的窗口已改变。请恢复原窗口，再继续滚动。")
      return
    }
    // A phased, continuous pixel gesture delivers the requested distance.
    // A phase-less event may be rewritten as an accelerated hardware wheel.
    func post(_ event: CGEvent, phase: Int64) {
      event.location = scrollCenter
      event.setIntegerValueField(.scrollWheelEventIsContinuous, value: 1)
      event.setIntegerValueField(.scrollWheelEventScrollPhase, value: phase)
      event.post(tap: .cgSessionEventTap)
    }
    if let edge = CGEvent(
      scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: 0, wheel2: 0, wheel3: 0)
    {
      post(edge, phase: 1)
      post(event, phase: 2)
      post(edge, phase: 4)
    } else {
      post(event, phase: 2)
    }
    let job = DispatchWorkItem { [weak self] in self?.takeFrame() }
    scheduled = job
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.65, execute: job)
  }
  @objc private func manualStep() { if !automatic { takeFrame() } }
  @objc private func toggleAuto() {
    scheduled?.cancel()
    if automatic {
      automatic = false
      setStatus("手动向下滚动约半屏，再点采集。")
    } else {
      let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
      guard AXIsProcessTrustedWithOptions([key: true] as CFDictionary) else {
        setStatus("请在系统辅助功能设置允许词匣，或手动滚动并点采集。")
        return
      }
      automatic = true
      unchanged = 0
      setStatus("正在自动滚动…")
      scheduleScroll()
    }
  }
  @objc func finish() {
    guard let previous else {
      cancel()
      return
    }
    guard let image = CapturedPixels.makeImage(combined, width: previous.width, height: totalRows)
    else {
      fail("无法生成长图。")
      return
    }
    end(with: image)
  }
  @objc func cancel() { end(with: nil) }
  private func fail(_ reason: String) {
    onStatus?(reason)
    end(with: nil)
  }
  private func end(with image: CGImage?) {
    guard !done else { return }
    done = true
    scheduled?.cancel()
    task?.cancel()
    removeOverlays()
    toolbar?.orderOut(nil)
    toolbar?.close()
    toolbar = nil
    if let old = cursorBeforeAutomatic, let current = CGEvent(source: nil)?.location,
      hypot(current.x - scrollCenter.x, current.y - scrollCenter.y) < 5
    {
      CGWarpMouseCursorPosition(old)
    }
    filter = nil
    configuration = nil
    previous = nil
    combined = Data()
    let completed = onFinish
    onFinish = nil
    completed?(image)
  }
}
