import AppKit
import ApplicationServices
import Carbon.HIToolbox
import ScreenCaptureKit

@_silgen_name("ps_scroll_match")
private func scrollMatch(
  _ previous: UnsafePointer<UInt8>, _ next: UnsafePointer<UInt8>,
  _ width: UInt32, _ height: UInt32, _ stride: UInt32, _ seam: UnsafeMutablePointer<UInt32>
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
  func match(_ newer: CapturedPixels) -> (overlap: Int, seam: Int) {
    guard width == newer.width, height == newer.height else { return (0, 0) }
    var seam: UInt32 = 0
    let overlap = data.withUnsafeBytes { old in
      newer.data.withUnsafeBytes { new in
        scrollMatch(
          old.bindMemory(to: UInt8.self).baseAddress!, new.bindMemory(to: UInt8.self).baseAddress!,
          UInt32(width), UInt32(height), UInt32(stride), &seam)
      }
    }
    return (Int(overlap), Int(seam))
  }
  static func makeImage(_ bytes: Data, width: Int, height: Int) -> CGImage? {
    guard let provider = CGDataProvider(data: bytes as CFData) else { return nil }
    return CGImage(
      width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
      space: colorSpace, bitmapInfo: format, provider: provider, decode: nil,
      shouldInterpolate: false, intent: .defaultIntent)
  }
}

enum CaptureDestination {
  case edit, copy, save, pin
}

@MainActor final class NativeCaptureSession: NSObject {
  private(set) var isLong: Bool
  var onStatus: ((String) -> Void)?
  var onFinish: ((CGImage?, CaptureDestination) -> Void)?
  var hasFrames: Bool { firstImage != nil }
  private(set) var frameHeight = 0
  private var automatic: Bool
  private var done = false
  private var working = false
  private var overlays: [NSPanel] = []
  private var toolbar: NSPanel?
  private var statusField: NSTextField?
  private var modeButton: NSButton?
  private var border: NSPanel?
  private var frozenPreview: NSImageView?
  private var firstImage: CGImage?
  private var pendingFinish: CaptureDestination?
  private var missedOverlap = false
  private var canScroll = false
  private var autoButton: NSButton?
  private var finishButton: NSButton?
  private var quickButtons: [NSButton] = []
  private var escapeHandler: EventHandlerRef?
  private var escapeKey: EventHotKeyRef?
  private var task: Task<Void, Never>?
  private var filter: SCContentFilter?
  private var configuration: SCStreamConfiguration?
  private var scrollCenter = CGPoint.zero
  private var scrollTarget: CGWindowID?
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
    self.automatic = isLong && automatic
  }
  func begin() {
    guard CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess() else {
      fail("需要屏幕录制权限。请在「系统设置 → 隐私与安全性 → 屏幕与系统录音」中允许词匣，必要时退出并重新打开。")
      return
    }
    registerEscape()
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
  // Register only Escape, and only for the lifetime of this capture. The source
  // application keeps keyboard focus and can still receive scrolling gestures.
  private func registerEscape() {
    let target = GetApplicationEventTarget()
    var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
    let signature: OSType = 0x5053_4553  // PSES
    guard InstallEventHandler(target, { _, event, context in
      guard let event, let context else { return OSStatus(eventNotHandledErr) }
      var key = EventHotKeyID()
      guard GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
        nil, MemoryLayout<EventHotKeyID>.size, nil, &key) == noErr,
        key.signature == 0x5053_4553, key.id == 1
      else { return OSStatus(eventNotHandledErr) }
      let session = Unmanaged<NativeCaptureSession>.fromOpaque(context).takeUnretainedValue()
      DispatchQueue.main.async { [weak session] in session?.cancel() }
      return noErr
    }, 1, &spec, Unmanaged.passUnretained(self).toOpaque(), &escapeHandler) == noErr else { return }
    if RegisterEventHotKey(UInt32(kVK_Escape), 0, EventHotKeyID(signature: signature, id: 1),
      target, UInt32(kEventHotKeyExclusive), &escapeKey) != noErr {
      releaseEscape()
    }
  }
  private func releaseEscape() {
    if let escapeKey { UnregisterEventHotKey(escapeKey) }
    if let escapeHandler { RemoveEventHandler(escapeHandler) }
    escapeKey = nil
    escapeHandler = nil
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
    let globalRect = localRect.offsetBy(dx: screen.frame.minX, dy: screen.frame.minY)
    canScroll = localRect.width >= 40 && localRect.height >= 48
    if automatic && !AXIsProcessTrusted() { automatic = false }
    showBorder(selection: globalRect)
    showToolbar(screen: screen, selection: globalRect)
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
        let decorationIDs = Set(
          [toolbar, border].compactMap { $0 }.map { CGWindowID($0.windowNumber) })
        let excluded = content.windows.filter { decorationIDs.contains($0.windowID) }
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
        scrollTarget = windowAtScrollPoint()
        takeFrame()
      } catch {
        if !done { fail(error.localizedDescription) }
      }
    }
  }
  private func showBorder(selection: NSRect) {
    // Draw outside the selected pixels; mouse and scroll events keep going to the source window.
    let border = NSPanel(
      contentRect: selection.insetBy(dx: -2, dy: -2),
      styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    border.isOpaque = false
    border.backgroundColor = .clear
    border.hasShadow = false
    border.ignoresMouseEvents = true
    border.level = .floating
    border.hidesOnDeactivate = false
    border.isReleasedWhenClosed = false
    border.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    let edge = NSView()
    edge.wantsLayer = true
    edge.layer?.borderWidth = 2
    edge.layer?.borderColor = NSColor.systemTeal.cgColor
    let preview = NSImageView(
      frame: NSRect(x: 2, y: 2, width: selection.width, height: selection.height))
    preview.imageScaling = .scaleAxesIndependently
    edge.addSubview(preview)
    frozenPreview = preview
    border.contentView = edge
    self.border = border
    border.orderFrontRegardless()
  }
  private func showToolbar(screen: NSScreen, selection: CGRect) {
    let visible = screen.visibleFrame
    let mode = NSButton(title: "返回普通截图", target: self, action: #selector(changeMode))
    let auto = NSButton(title: "切换手动滚动", target: self, action: #selector(toggleAuto))
    let finish = NSButton(title: "完成并编辑", target: self, action: #selector(finish))
    let quit = NSButton(title: "取消", target: self, action: #selector(cancel))
    quit.keyEquivalent = "\u{1b}"
    quit.keyEquivalentModifierMask = []
    let copy = NSButton(title: "复制", target: self, action: #selector(copyCapture))
    let save = NSButton(title: "保存", target: self, action: #selector(saveCapture))
    let pin = NSButton(title: "置顶", target: self, action: #selector(pinCapture))
    modeButton = mode
    autoButton = auto
    finishButton = finish
    quickButtons = [copy, save, pin]
    let controls = [finish, mode, auto, quit] + quickButtons
    for button in controls {
      button.bezelStyle = .rounded
      button.controlSize = .regular
    }
    let spacing: CGFloat = 4
    let desiredWidth = controls.reduce(CGFloat(20)) { $0 + $1.intrinsicContentSize.width }
      + CGFloat(controls.count - 1) * spacing
    let width = min(visible.width - 12, max(420, desiredWidth))
    let rows = desiredWidth > width ? [[finish, mode, auto, quit], quickButtons] : [controls]
    let h: CGFloat = rows.count == 1 ? 66 : 94
    var origin = NSPoint(
      x: min(visible.maxX - width - 6, max(visible.minX + 6, selection.midX - width / 2)),
      y: selection.minY - h - 6)
    if origin.y < visible.minY + 5 { origin.y = min(visible.maxY - h - 6, selection.maxY + 6) }
    let panel = SelectionPanel(
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
    label.frame = NSRect(x: 12, y: h - 29, width: width - 24, height: 20)
    label.font = .systemFont(ofSize: 12, weight: .medium)
    label.lineBreakMode = .byTruncatingTail
    view.addSubview(label)
    statusField = label
    for (i, row) in rows.enumerated() {
      let stack = NSStackView(views: row)
      stack.spacing = spacing
      stack.alignment = .centerY
      stack.translatesAutoresizingMaskIntoConstraints = false
      view.addSubview(stack)
      NSLayoutConstraint.activate([
        stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 10),
        stack.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -6 - CGFloat(rows.count - 1 - i) * 28),
      ])
    }
    panel.contentView = view
    toolbar = panel
    panel.orderFrontRegardless()
    if escapeKey == nil { panel.makeKey() }
    setStatus("准备截取首帧…")
  }
  private func setStatus(_ text: String) {
    statusField?.stringValue = text
    statusField?.toolTip = text
    modeButton?.title = isLong ? "返回普通截图" : "滚动长截图"
    modeButton?.isEnabled = hasFrames && pendingFinish == nil && (isLong || canScroll)
    autoButton?.isHidden = !isLong
    autoButton?.isEnabled = hasFrames && pendingFinish == nil
    autoButton?.title = automatic ? "切换手动滚动" : "自动滚动"
    finishButton?.title = isLong ? "完成并编辑" : "编辑截图"
    finishButton?.isEnabled = hasFrames && pendingFinish == nil
    for button in quickButtons { button.isEnabled = hasFrames && pendingFinish == nil }
  }
  private func takeFrame() {
    guard !done, !working, let filter, let configuration else { return }
    let requestedAfterFinishClick = pendingFinish != nil
    working = true
    task = Task { [weak self] in
      guard let self else { return }
      do {
        let image = try await SCScreenshotManager.captureImage(
          contentFilter: filter, configuration: configuration)
        guard !done else { return }
        working = false
        if firstImage == nil {
          firstImage = image
          frameHeight = image.height
          if !isLong { frozenPreview?.image = NSImage(cgImage: image, size: .zero) }
        }
        if !isLong {
          setStatus("普通截图 · \(image.width) × \(frameHeight) px")
          return
        }
        // A capture that was already in flight when Finish was clicked can show
        // the page before the last wheel step. Include a fresh sample as well.
        let finalAction = requestedAfterFinishClick ? nil : pendingFinish
        if finalAction != nil { pendingFinish = nil }
        try ingest(CapturedPixels(image))
        if let finalAction, !done {
          scheduled?.cancel()
          pendingFinish = finalAction
          takeFrame()
        }
      } catch {
        guard !done else { return }
        working = false
        pendingFinish = nil
        if hasFrames {
          automatic = false
          missedOverlap = true
          setStatus("本帧采集失败，稍后重试或返回普通截图。")
          scheduleNext()
        } else {
          fail("截图失败。" + error.localizedDescription)
        }
      }
    }
  }
  @objc private func changeMode() {
    guard let firstImage, !done else { return }
    scheduled?.cancel()
    pendingFinish = nil
    automatic = false
    unchanged = 0
    missedOverlap = false
    if isLong {
      isLong = false
      previous = nil
      combined = Data()
      frames = 0
      totalRows = 0
      frozenPreview?.image = NSImage(cgImage: firstImage, size: .zero)
      setStatus("普通截图 · \(firstImage.width) × \(frameHeight) px")
    } else {
      guard canScroll else {
        setStatus("选区太小，请取消后框选更大的滚动区域。")
        return
      }
      isLong = true
      frozenPreview?.image = nil
      do { try ingest(CapturedPixels(firstImage)) } catch { fail(error.localizedDescription) }
    }
  }
  private func ingest(_ next: CapturedPixels) throws {
    if let previous {
      let (overlap, seam) = previous.match(next)
      if overlap == next.height {
        unchanged += 1
        if missedOverlap { setStatus("已回到上一帧，可继续向下滚动 · \(totalRows) px") }
        missedOverlap = false
        if pendingFinish != nil || (automatic && unchanged >= 3) {
          if frames > 1 {
            finishImage()
            return
          }
          pendingFinish = nil
          automatic = false
          setStatus("仅采到首屏。请在框内向下滚动，或返回普通截图。")
        }
        scheduleNext()
        return
      }
      guard overlap > 0, overlap < next.height else {
        automatic = false
        pendingFinish = nil
        missedOverlap = true
        setStatus("这段未拼入。向上回滚至上一屏附近，再缓慢向下滚动。")
        scheduleNext()
        return
      }
      let extra = next.height - overlap
      guard totalRows + extra <= min(32000, 32_000_000 / next.width) else {
        automatic = false
        if frames > 1 {
          onStatus?("已达长图尺寸上限，使用已成功拼接的部分。")
          finishImage()
        } else {
          pendingFinish = nil
          setStatus("已达尺寸上限。请缩小选区，或返回普通截图。")
          scheduleNext()
        }
        return
      }
      // Join inside the shared content. Keeping only the previous top and new
      // bottom prevents fixed headers and footers recurring at each seam.
      let start = seam
      combined.removeLast((overlap - start) * next.stride)
      combined.append(next.data.suffix((next.height - start) * next.stride))
      totalRows += extra
    } else {
      combined = next.data
      totalRows = next.height
    }
    previous = next
    frames += 1
    missedOverlap = false
    unchanged = 0
    let gesture = automatic ? "自动滚动中" : "请在框内向下滚动，正在自动采集"
    setStatus("\(gesture) · 已拼 \(frames) 帧 / \(totalRows) px")
    if pendingFinish != nil {
      if frames > 1 {
        finishImage()
        return
      }
      pendingFinish = nil
      setStatus("仅采到首屏。请在框内向下滚动，或返回普通截图。")
    }
    scheduleNext()
  }
  private func scheduleNext() {
    scheduled?.cancel()
    guard isLong, !done else { return }
    let job = DispatchWorkItem { [weak self] in
      guard let self else { return }
      if self.automatic { self.scrollOnce() } else { self.takeFrame() }
    }
    scheduled = job
    // Sampling runs only during an active long capture. Polling also sees keyboard,
    // scrollbar dragging and momentum without requiring global input monitoring.
    let pixels = (configuration?.width ?? 1) * (configuration?.height ?? 1)
    let delay = automatic ? 0.24 : min(0.38, max(0.105, Double(pixels) / 23_000_000))
    DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: job)
  }
  private func windowAtScrollPoint() -> CGWindowID? {
    let windows =
      CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
      as? [[String: Any]] ?? []
    for window in windows {
      guard let id = window[kCGWindowNumber as String] as? NSNumber,
        id.intValue != toolbar?.windowNumber, id.intValue != border?.windowNumber,
        let layer = window[kCGWindowLayer as String] as? NSNumber,
        layer.intValue >= NSWindow.Level.normal.rawValue,
        layer.intValue <= NSWindow.Level.modalPanel.rawValue,
        (window[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 1 > 0.02,
        let box = window[kCGWindowBounds as String] as? [String: Any],
        let bounds = CGRect(dictionaryRepresentation: box as CFDictionary),
        bounds.contains(scrollCenter)
      else { continue }
      return id.uint32Value
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
      setStatus("自动滚动需要辅助功能权限。可直接在框内手动滚动。")
      scheduleNext()
      return
    }
    guard let target = scrollTarget, windowAtScrollPoint() == target else {
      automatic = false
      setStatus("选区上方的窗口已改变。请恢复原窗口，再继续滚动。")
      scheduleNext()
      return
    }
    if cursorBeforeAutomatic == nil {
      cursorBeforeAutomatic = CGEvent(source: nil)?.location
      CGWarpMouseCursorPosition(scrollCenter)
    } else if let mouse = CGEvent(source: nil)?.location,
      hypot(mouse.x - scrollCenter.x, mouse.y - scrollCenter.y) > 10
    {
      automatic = false
      cursorBeforeAutomatic = nil
      setStatus("鼠标已移开，自动滚动暂停。可继续手动滚动或完成。")
      scheduleNext()
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
  @objc private func toggleAuto() {
    scheduled?.cancel()
    if automatic {
      automatic = false
      setStatus("请在框内向下滚动，正在自动采集。")
      scheduleNext()
    } else {
      let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
      guard AXIsProcessTrustedWithOptions([key: true] as CFDictionary) else {
        setStatus("请在辅助功能设置中允许词匣，或在框内手动滚动。")
        scheduleNext()
        return
      }
      automatic = true
      cursorBeforeAutomatic = nil
      unchanged = 0
      setStatus("正在自动滚动…")
      scheduleNext()
    }
  }
  @objc func finish() { complete(.edit) }
  @objc private func copyCapture() { complete(.copy) }
  @objc private func saveCapture() { complete(.save) }
  @objc private func pinCapture() { complete(.pin) }
  private func complete(_ destination: CaptureDestination) {
    guard !done, pendingFinish == nil, let firstImage else { return }
    if !isLong {
      end(with: firstImage, destination: destination)
      return
    }
    scheduled?.cancel()
    automatic = false
    pendingFinish = destination
    setStatus("正在拼接最后一帧…")
    // Include a change immediately before the user pressed Finish.
    if !working { takeFrame() }
  }
  private func finishImage() {
    guard !missedOverlap, frames > 1, let previous else { return }
    guard let image = CapturedPixels.makeImage(combined, width: previous.width, height: totalRows)
    else {
      fail("无法生成长图。")
      return
    }
    end(with: image, destination: pendingFinish ?? .edit)
  }
  @objc func cancel() { end(with: nil) }
  private func fail(_ reason: String) {
    onStatus?(reason)
    end(with: nil)
  }
  private func end(with image: CGImage?, destination: CaptureDestination = .edit) {
    guard !done else { return }
    done = true
    releaseEscape()
    scheduled?.cancel()
    task?.cancel()
    removeOverlays()
    toolbar?.orderOut(nil)
    toolbar?.close()
    toolbar = nil
    border?.orderOut(nil)
    border?.close()
    border = nil
    frozenPreview = nil
    firstImage = nil
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
    completed?(image, destination)
  }
}
