import AppKit
import Carbon.HIToolbox
import UniformTypeIdentifiers

struct NativeFailure: LocalizedError {
  let reason: String
  init(_ reason: String) { self.reason = reason }
  var errorDescription: String? { reason }
}

private struct Shortcut: Hashable {
  let key: UInt32
  let flags: UInt32
  private static let keys: [String: UInt32] = [
    "A": 0, "S": 1, "D": 2, "F": 3, "H": 4, "G": 5, "Z": 6, "X": 7, "C": 8, "V": 9, "B": 11,
    "Q": 12, "W": 13, "E": 14, "R": 15, "Y": 16, "T": 17, "1": 18, "2": 19, "3": 20, "4": 21,
    "6": 22, "5": 23, "9": 25, "7": 26, "8": 28, "0": 29, "O": 31, "U": 32, "I": 34, "P": 35,
    "L": 37, "J": 38, "K": 40, "N": 45, "M": 46, "SPACE": 49,
    "F1": 122, "F2": 120, "F3": 99, "F4": 118, "F5": 96, "F6": 97, "F7": 98, "F8": 100,
    "F9": 101, "F10": 109, "F11": 103, "F12": 111,
  ]
  init(_ value: String) throws {
    let parts = value.uppercased().components(separatedBy: "+").map {
      $0.trimmingCharacters(in: .whitespaces)
    }
    guard let last = parts.last, let code = Self.keys[last], parts.count > 1 else {
      throw NativeFailure("快捷键需要修饰键和一个字母、数字、功能键或空格。")
    }
    var mods: UInt32 = 0
    for part in parts.dropLast() {
      let raw: Int
      switch part {
      case "ALT", "OPTION", "OPT", "⌥": raw = optionKey
      case "CTRL", "CONTROL", "⌃": raw = controlKey
      case "SHIFT", "⇧": raw = shiftKey
      case "CMD", "COMMAND", "META", "COMMANDORCONTROL", "CMDORCTRL", "SUPER", "⌘": raw = cmdKey
      default: throw NativeFailure("无法识别快捷键修饰键：\(part)")
      }
      guard mods & UInt32(raw) == 0 else { throw NativeFailure("快捷键有重复的修饰键。") }
      mods |= UInt32(raw)
    }
    key = code
    flags = mods
  }
}

private let hotkeySignature: OSType = 0x5053_4846
private func handleNativeShortcut(
  _ next: EventHandlerCallRef?, _ event: EventRef?, _ context: UnsafeMutableRawPointer?
) -> OSStatus {
  guard let event, let context else { return OSStatus(eventNotHandledErr) }
  var id = EventHotKeyID()
  guard
    GetEventParameter(
      event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
      nil, MemoryLayout<EventHotKeyID>.size, nil, &id) == noErr,
    id.signature == hotkeySignature
  else { return OSStatus(eventNotHandledErr) }
  // Carbon's application event target delivers on the main AppKit event loop.
  let service = Unmanaged<NativeServices>.fromOpaque(context).takeUnretainedValue()
  let hotkeyID = id.id
  DispatchQueue.main.async { [weak service] in service?.fire(hotkeyID) }
  return noErr
}

private final class PinnedPanel: NSPanel {
  var didClose: (() -> Void)?
  override func close() {
    super.close()
    contentView = nil
    didClose?()
  }
}

@MainActor final class NativeServices {
  var onClipboard: (([String: Any]) -> Void)?
  var onCapture: (([String: Any]) -> Void)?
  var onCaptureEnded: ((Bool) -> Void)?
  var onHotkey: ((String) -> Void)?
  var onStatus: ((String) -> Void)?
  private let pasteboard: NSPasteboard
  private var lastChange = 0
  private var monitor: Timer?
  private var eventHandler: EventHandlerRef?
  private var registered: [Shortcut: (id: UInt32, ref: EventHotKeyRef)] = [:]
  private var actionForID: [UInt32: String] = [:]
  private var nextID: UInt32 = 1
  private(set) var pinnedWindows = [String: NSPanel]()
  private var session: NativeCaptureSession?

  init(pasteboard: NSPasteboard = .general) {
    self.pasteboard = pasteboard
  }

  func startMonitoring() {
    guard monitor == nil else { return }
    lastChange = pasteboard.changeCount
    let timer = Timer(timeInterval: 0.55, repeats: true) { [weak self] _ in
      MainActor.assumeIsolated {
        guard let self, self.pasteboard.changeCount != self.lastChange else { return }
        self.readClipboardNow()
      }
    }
    timer.tolerance = 0.12
    RunLoop.main.add(timer, forMode: .common)
    monitor = timer
  }
  func stopMonitoring() {
    monitor?.invalidate()
    monitor = nil
  }
  func readClipboardNow() {
    lastChange = pasteboard.changeCount
    let entries = pasteboard.pasteboardItems ?? []
    let privateTypes = [
      "org.nspasteboard.ConcealedType", "org.nspasteboard.TransientType",
      "com.agilebits.onepassword",
    ]
    let source = "系统剪贴板"
    guard
      !entries.contains(where: { item in
        item.types.contains(where: { privateTypes.contains($0.rawValue) })
      })
    else { return }
    for item in entries {
      if let rawURL = item.string(forType: .fileURL), let url = URL(string: rawURL), url.isFileURL {
        let type =
          (try? url.resourceValues(forKeys: [.contentTypeKey]).contentType)
          ?? UTType(filenameExtension: url.pathExtension)
        if let type,
          type.conforms(to: .image) || type.conforms(to: .movie) || type.conforms(to: .video)
        {
          let media = type.conforms(to: .image) ? "image" : "video"
          onClipboard?([
            "type": media, "path": url.path, "filename": url.lastPathComponent,
            "title": url.lastPathComponent,
            "mime": type.preferredMIMEType ?? "application/octet-stream", "source": source,
          ])
        }
        continue
      }
      let imageType = item.types.first { UTType($0.rawValue)?.conforms(to: .image) == true }
      if let png = item.data(forType: .png)
        ?? imageType.flatMap({ item.data(forType: $0) }).flatMap({
          NSBitmapImageRep(data: $0)?.representation(using: .png, properties: [:])
        })
      {
        onClipboard?([
          "type": "image", "data": png.base64EncodedString(), "title": "剪贴板图片",
          "filename": "clipboard.png", "mime": "image/png", "source": source,
        ])
        continue
      }
      if let pasteType = item.types.first(where: {
        UTType($0.rawValue)?.conforms(to: .movie) == true
      }),
        let type = UTType(pasteType.rawValue), let bytes = item.data(forType: pasteType)
      {
        guard bytes.count <= 64 * 1024 * 1024 else {
          onStatus?("视频超过单条 64 MiB 上限。可以复制该视频的文件引用。")
          continue
        }
        onClipboard?([
          "type": "video", "data": bytes.base64EncodedString(), "title": "剪贴板视频",
          "filename": "clipboard." + (type.preferredFilenameExtension ?? "mov"),
          "mime": type.preferredMIMEType ?? "video/quicktime", "source": source,
        ])
        continue
      }
      if let string = item.string(forType: .string), !string.isEmpty {
        onClipboard?([
          "type": "text", "text": string, "title": String(string.prefix(60)), "source": source,
        ])
      }
    }
  }

  func writeClipboard(_ item: [String: Any]) throws {
    let object: NSPasteboardWriting
    let type = item["type"] as? String
    if type == "text", let text = item["text"] as? String {
      object = text as NSString
    } else if let path = item["path"] as? String, !path.isEmpty {
      let url = URL(fileURLWithPath: path)
      guard FileManager.default.fileExists(atPath: url.path) else {
        throw NativeFailure("原文件已移动，请重新选择。")
      }
      if type == "image", item["owned"] as? Bool == true, item["fileReference"] as? Bool != true {
        object = try imageObject(Data(contentsOf: url, options: .mappedIfSafe))
      } else {
        object = url as NSURL
      }
    } else if let encoded = item["data"] as? String, let data = Data(base64Encoded: encoded) {
      if type == "image" {
        object = try imageObject(data)
      } else if type == "video" {
        let base = try FileManager.default.url(
          for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        )
        .appendingPathComponent("PromptShelf/ClipboardExports", isDirectory: true)
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        let component = ((item["filename"] as? String ?? "video.mp4") as NSString).lastPathComponent
        let file = base.appendingPathComponent(
          UUID().uuidString + "-" + String(component.suffix(90)))
        try data.write(to: file, options: .atomic)
        object = file as NSURL
      } else {
        throw NativeFailure("图片或视频的数据格式无法写入剪贴板。")
      }
    } else {
      throw NativeFailure("缺少可复制的文字、图片或文件。")
    }
    pasteboard.clearContents()
    defer { lastChange = pasteboard.changeCount }
    guard pasteboard.writeObjects([object]) else { throw NativeFailure("系统剪贴板写入失败。") }
  }
  private func imageObject(_ data: Data) throws -> NSPasteboardItem {
    guard let rep = NSBitmapImageRep(data: data),
      let png = rep.representation(using: .png, properties: [:])
    else {
      throw NativeFailure("无法解码这张图片。")
    }
    let entry = NSPasteboardItem()
    entry.setData(png, forType: .png)
    if rep.pixelsWide > 0, rep.pixelsHigh <= 12_000_000 / rep.pixelsWide,
      let tiff = rep.tiffRepresentation
    {
      entry.setData(tiff, forType: .tiff)
    }
    return entry
  }

  @discardableResult
  func setHotkeys(_ settings: [String: String], partial: Bool = false) throws -> [String] {
    var desired: [Shortcut: String] = [:]
    var conflicts: [String] = []
    for (action, value) in settings.sorted(by: { $0.key < $1.key }) where !value.isEmpty {
      let shortcut = try Shortcut(value)
      if desired[shortcut] != nil {
        if partial {
          conflicts.append(value)
          continue
        }
        throw NativeFailure("多个动作使用了同一个快捷键。")
      }
      desired[shortcut] = action
    }
    if eventHandler == nil {
      var spec = EventTypeSpec(
        eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
      let result = InstallEventHandler(
        GetApplicationEventTarget(), handleNativeShortcut, 1, &spec,
        Unmanaged.passUnretained(self).toOpaque(), &eventHandler)
      guard result == noErr else { throw NativeFailure("无法安装系统快捷键处理程序（\(result)）。") }
    }
    var added: [Shortcut: (id: UInt32, ref: EventHotKeyRef)] = [:]
    var accepted = desired
    for (shortcut, action) in desired where registered[shortcut] == nil {
      var reference: EventHotKeyRef?
      let id = nextID
      nextID &+= 1
      let result = RegisterEventHotKey(
        shortcut.key, shortcut.flags, EventHotKeyID(signature: hotkeySignature, id: id),
        GetApplicationEventTarget(), UInt32(kEventHotKeyExclusive), &reference)
      guard result == noErr, let reference else {
        if partial {
          conflicts.append(settings[action] ?? action)
          accepted.removeValue(forKey: shortcut)
          continue
        }
        for entry in added.values { UnregisterEventHotKey(entry.ref) }
        throw NativeFailure("快捷键 \(settings[action] ?? action) 已被占用或由系统保留（\(result)）。")
      }
      added[shortcut] = (id, reference)
    }
    for (shortcut, entry) in registered where accepted[shortcut] == nil {
      UnregisterEventHotKey(entry.ref)
    }
    registered = registered.filter { accepted[$0.key] != nil }
    registered.merge(added) { old, _ in old }
    actionForID = Dictionary(
      uniqueKeysWithValues: accepted.compactMap { (key, action) in
        registered[key].map { ($0.id, action) }
      })
    return conflicts.sorted()
  }
  fileprivate func fire(_ id: UInt32) {
    if let action = actionForID[id] { onHotkey?(action) }
  }

  var isCapturing: Bool { session != nil }

  func captureRegion(long: Bool, automatic: Bool = true) {
    if let session {
      if session.hasFrames {
        session.finish()
      } else {
        onStatus?("正在截图，按 Esc 可取消框选。")
      }
      return
    }
    let capture = NativeCaptureSession(isLong: long, automatic: automatic)
    capture.onStatus = { [weak self] in self?.onStatus?($0) }
    capture.onFinish = { [weak self] bitmap in
      guard let self else { return }
      let frameHeight = self.session?.frameHeight ?? bitmap?.height ?? 0
      let capturedLong = self.session?.isLong ?? long
      self.session = nil
      guard let bitmap else {
        self.onCaptureEnded?(false)
        return
      }
      guard
        let data = NSBitmapImageRep(cgImage: bitmap).representation(using: .png, properties: [:])
      else {
        self.onStatus?("截图 PNG 编码失败。")
        self.onCaptureEnded?(false)
        return
      }
      let name = capturedLong ? "滚动长截图" : "区域截图"
      self.onCapture?([
        "type": "image", "data": data.base64EncodedString(), "title": name,
        "filename": name + ".png",
        "mime": "image/png", "source": "截图工具", "width": bitmap.width, "height": bitmap.height,
        "frameHeight": frameHeight,
      ])
      self.onCaptureEnded?(true)
    }
    session = capture
    capture.begin()
  }
  func stopCapture() { session?.finish() }
  func pin(_ item: [String: Any]) throws { try pinMany([item]) }

  func pinMany(_ items: [[String: Any]]) throws {
    // Decode all requested images before showing the first new window.
    var prepared = [(id: String, title: String, image: NSImage)]()
    var existing = [NSPanel]()
    for item in items {
      let id = item["id"] as? String ?? UUID().uuidString
      if let window = pinnedWindows[id] {
        existing.append(window)
        continue
      }
      let image: NSImage?
      if let encoded = item["data"] as? String, let data = Data(base64Encoded: encoded) {
        image = NSImage(data: data)
      } else if let path = item["path"] as? String {
        image = NSImage(contentsOfFile: path)
      } else {
        image = nil
      }
      guard let image, image.size.width > 0, image.size.height > 0 else {
        throw NativeFailure("截图已移除或无法读取。")
      }
      prepared.append((id, item["title"] as? String ?? "置顶截图", image))
    }
    existing.forEach { $0.orderFrontRegardless() }
    let screen =
      NSScreen.screens.first(where: { $0.frame.contains(NSEvent.mouseLocation) }) ?? NSScreen.main
    let visible = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1000, height: 700)
    for (id, title, image) in prepared {
      let scale = min(
        1, min(visible.width * 0.47 / image.size.width, visible.height * 0.65 / image.size.height))
      let size = NSSize(
        width: max(100, image.size.width * scale), height: max(48, image.size.height * scale))
      let offset = CGFloat(pinnedWindows.count % 7) * 25
      let rect = NSRect(
        x: visible.maxX - size.width - 18 - offset,
        y: visible.maxY - size.height - 50 - offset, width: size.width, height: size.height)
      let pin = PinnedPanel(
        contentRect: rect,
        styleMask: [.titled, .closable, .nonactivatingPanel, .resizable, .utilityWindow],
        backing: .buffered, defer: false)
      pin.title = title
      pin.level = .floating
      pin.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
      pin.hidesOnDeactivate = false
      pin.isReleasedWhenClosed = false
      pin.isMovableByWindowBackground = true
      pin.contentMinSize = NSSize(width: 84, height: 42)
      // Extremely long captures need a usable title bar even at fit-to-screen zoom.
      let aspect = image.size.width / image.size.height
      if (0.22...5).contains(aspect) { pin.contentAspectRatio = image.size }
      let view = NSImageView(frame: NSRect(origin: .zero, size: size))
      view.image = image
      view.imageScaling = .scaleProportionallyUpOrDown
      view.imageAlignment = .alignCenter
      view.autoresizingMask = [.width, .height]
      pin.contentView = view
      pin.didClose = { [weak self] in self?.pinnedWindows.removeValue(forKey: id) }
      pinnedWindows[id] = pin
      pin.orderFrontRegardless()
    }
  }
  func unpin() {
    for pin in Array(pinnedWindows.values) { pin.close() }
  }
  func shutdown() {
    stopMonitoring()
    session?.cancel()
    unpin()
    for entry in registered.values { UnregisterEventHotKey(entry.ref) }
    registered.removeAll()
    actionForID.removeAll()
    if let eventHandler { RemoveEventHandler(eventHandler) }
    eventHandler = nil
  }
}
