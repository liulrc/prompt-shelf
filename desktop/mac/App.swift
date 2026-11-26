import AppKit
import CryptoKit
import WebKit

private let defaults = ["capture": "Alt+A", "shelf": "Alt+Q", "pin": "Alt+Z", "templates": "Alt+X"]
@MainActor
final class DesktopApp: NSObject, NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandler,
  WKNavigationDelegate, WKUIDelegate
{
  let archive: Archive
  let native: NativeServices
  let promptAI: PromptAI
  let webRoot: URL
  var windows = [String: NSWindow](), views = [String: WKWebView]()
  var ready = Set<String>(), pendingArea: String?
  var mainArea = "", mainEditing = false
  var latestCaptureEditor: String?
  var pendingEditors = [String: Object]()
  var returnAfterClosing = [String: NSRunningApplication]()
  var captureReturnApp: NSRunningApplication?
  var hiddenForCapture = [String](), captureOriginWindow: String?
  var shelf: ShelfPanel?, statusItem: NSStatusItem?, returnApp: NSRunningApplication?,
    lastExternal: NSRunningApplication?
  var hotkeys = defaults, monitoring = true, showTrayIcon = true, lastIssue = "",
    hotkeyIssue = ""
  var settingsFile: URL { archive.root.appendingPathComponent("Settings.json") }
  let smoke: Bool
  init(archive: Archive, webRoot: URL, smoke: Bool = false) {
    self.archive = archive
    self.webRoot = webRoot
    self.smoke = smoke
    promptAI = PromptAI(root: archive.root, keychainService: smoke
      ? "com.promptshelf.smoke." + UUID().uuidString : "com.promptshelf.desktop.ai")
    native = NativeServices(
      pasteboard: smoke
        ? NSPasteboard(name: .init("PromptShelf.Test." + smokePasteboardToken)) : .general)
    super.init()
    if let data = try? Data(contentsOf: settingsFile),
      let dict = (try? JSONSerialization.jsonObject(with: data)) as? Object
    {
      if let map = dict["hotkeys"] as? [String: String], Set(map.keys) == Set(defaults.keys) {
        hotkeys = map
      }
      monitoring = dict["monitoring"] as? Bool ?? true
      showTrayIcon = dict["showTrayIcon"] as? Bool ?? true
    }
  }
  func applicationDidFinishLaunching(_ notification: Notification) {
    buildMenus()
    if !smoke {
      DistributedNotificationCenter.default().addObserver(
        self, selector: #selector(reopenWorkspace), name: Self.reopenNotification, object: nil)
    }
    native.onClipboard = { [weak self] item in
      guard let self else { return }
      do { _ = try archive.add(item, trustedFileReference: true) } catch {
        report(error.localizedDescription)
      }
    }
    native.onHotkey = { [weak self] action in self?.handleShortcut(action) }
    native.onStatus = { [weak self] text in self?.report(text) }
    native.onCaptureEnded = { [weak self] success in self?.restoreAfterCapture(success: success) }
    native.onCapture = { [weak self] image, destination in
      self?.completeCapture(image, destination: destination)
    }
    archive.onChange = { [weak self] in
      self?.shelf?.refresh()
      self?.broadcast("history.changed", [:])
    }
    if !smoke {
      do {
        let conflicts = try native.setHotkeys(hotkeys, partial: true)
        if !conflicts.isEmpty {
          hotkeyIssue = "快捷键 " + conflicts.joined(separator: "、") + " 已被占用，请更换组合。"
        }
      } catch { hotkeyIssue = error.localizedDescription }
    }
    if monitoring { native.startMonitoring() }
    NSWorkspace.shared.notificationCenter.addObserver(
      self, selector: #selector(activated(_:)),
      name: NSWorkspace.didActivateApplicationNotification, object: nil)
    if !CommandLine.arguments.contains("--background") { showMain("personal") }
    if !hotkeyIssue.isEmpty {
      showWeb("settings")
      report(hotkeyIssue)
    }
    if smoke {
      if CommandLine.arguments.contains("--background") {
        do {
          try native.setHotkeys(isolatedTestKeys)
          print(
            "READY background listener and shortcuts screen=\(CGPreflightScreenCaptureAccess() ? 1 : 0)"
          )
          fflush(stdout)
        } catch {
          fputs(error.localizedDescription, stderr)
          Darwin.exit(1)
        }
      } else {
        runSmoke()
      }
    }
  }
  @objc func activated(_ note: Notification) {
    if let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
      app.processIdentifier != ProcessInfo.processInfo.processIdentifier,
      app.activationPolicy == .regular
    {
      lastExternal = app
    }
  }
  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool
  {
    if !flag || NSApp.activationPolicy() == .accessory { reopenWorkspace() }
    return true
  }
  static let reopenNotification = Notification.Name("com.promptshelf.desktop.showWorkspace")
  @objc private func reopenWorkspace() {
    if mainEditing { showWeb("main") } else { showMain("personal") }
  }
  private func usesDock(_ key: String) -> Bool {
    key == "main" || key == "settings" || key.hasPrefix("editor-")
  }
  private func updateBackgroundPolicy() {
    guard NSApp.activationPolicy() == .regular,
      !windows.contains(where: { key, window in
        usesDock(key) && (window.isVisible || window.isMiniaturized || hiddenForCapture.contains(key))
      })
    else { return }
    NSApp.setActivationPolicy(.accessory)
  }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
  func applicationWillTerminate(_ notification: Notification) {
    DistributedNotificationCenter.default().removeObserver(self)
    native.shutdown()
    NSWorkspace.shared.notificationCenter.removeObserver(self)
  }
  func buildMenus() {
    let main = NSMenu()
    let appMenu = NSMenu()
    let holder = NSMenuItem()
    main.addItem(holder)
    holder.submenu = appMenu
    let sets = appMenu.addItem(
      withTitle: "设置…", action: #selector(openSettings), keyEquivalent: ",")
    sets.target = self
    appMenu.addItem(.separator())
    appMenu.addItem(
      withTitle: "退出词匣", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    let edit = NSMenu(title: "编辑")
    let top = NSMenuItem()
    main.addItem(top)
    top.submenu = edit
    for (name, selector, key) in [
      ("撤销", "undo:", "z"), ("剪切", "cut:", "x"), ("复制", "copy:", "c"), ("粘贴", "paste:", "v"),
      ("全选", "selectAll:", "a"),
    ] {
      edit.addItem(withTitle: name, action: Selector(selector), keyEquivalent: key)
    }
    let windowMenu = NSMenu(title: "窗口")
    let wh = NSMenuItem()
    main.addItem(wh)
    wh.submenu = windowMenu
    windowMenu.addItem(
      withTitle: "关闭窗口", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
    NSApp.mainMenu = main
    NSApp.windowsMenu = windowMenu
    updateStatusItem()
  }
  func updateStatusItem() {
    guard showTrayIcon else {
      if let statusItem { NSStatusBar.system.removeStatusItem(statusItem) }
      statusItem = nil
      return
    }
    if statusItem == nil {
      statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
      statusItem?.button?.image = NSImage(
        systemSymbolName: "square.stack.3d.up", accessibilityDescription: "词匣")
    }
    statusItem?.button?.toolTip = lastIssue.isEmpty ? "词匣" : lastIssue
    refreshMenu()
  }
  func refreshMenu() {
    guard let statusItem else { return }
    let menu = NSMenu()
    for (name, key) in [
      ("我的模板", "templates"), ("剪贴板历史栏", "shelf"), ("区域截图", "capture"), ("滚动长截图", "long"),
      ("近期截图库…", "pin"), ("设置…", "settings"),
    ] {
      let item = menu.addItem(withTitle: name, action: #selector(menuAction(_:)), keyEquivalent: "")
      item.target = self
      item.representedObject = key
    }
    let monitorItem = menu.addItem(
      withTitle: "自动记录剪贴板", action: #selector(toggleMonitoring), keyEquivalent: "")
    monitorItem.target = self
    monitorItem.state = monitoring ? .on : .off
    if !lastIssue.isEmpty {
      menu.addItem(.separator())
      let item = menu.addItem(
        withTitle: String(lastIssue.prefix(55)), action: #selector(showIssue), keyEquivalent: "")
      item.target = self
    }
    menu.addItem(.separator())
    menu.addItem(
      withTitle: "退出词匣", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    statusItem.menu = menu
  }
  @objc func openSettings() { showWeb("settings") }
  @objc func toggleMonitoring() {
    let enabled = !monitoring
    do {
      try writeSettings(hotkeys, monitoring: enabled, icon: showTrayIcon)
      setMonitoring(enabled)
      refreshMenu()
      broadcast("settings.changed", settings())
    } catch { report(error.localizedDescription) }
  }
  private func setMonitoring(_ enabled: Bool) {
    monitoring = enabled
    if enabled { native.startMonitoring() } else { native.stopMonitoring() }
  }
  private func writeSettings(_ keys: [String: String], monitoring: Bool, icon: Bool) throws {
    let json = try JSONSerialization.data(withJSONObject: [
      "hotkeys": keys, "monitoring": monitoring, "showTrayIcon": icon,
    ])
    try json.write(to: settingsFile, options: .atomic)
  }
  @objc func menuAction(_ sender: NSMenuItem) {
    if let action = sender.representedObject as? String { performAction(action) }
  }
  @objc func showIssue() {
    let a = NSAlert()
    a.messageText = "词匣"
    a.informativeText = lastIssue
    a.runModal()
  }
  func report(_ msg: String) {
    lastIssue = msg
    statusItem?.button?.toolTip = msg
    refreshMenu()
    broadcast("native.status", ["message": msg])
    if !smoke && !windows.values.contains(where: { $0.isVisible })
      && (msg.contains("权限") || msg.contains("请先") || msg.contains("已被占用"))
    {
      let alert = NSAlert()
      alert.messageText = "词匣"
      alert.informativeText = msg
      alert.addButton(withTitle: "知道了")
      DispatchQueue.main.async {
        NSApp.activate(ignoringOtherApps: true)
        alert.runModal()
      }
    }
  }
  func performAction(_ action: String) {
    switch action {
    case "templates": showMain("personal")
    case "capture", "long": startCapture(long: action == "long", automatic: action == "long")
    case "shelf": toggleShelf()
    case "pin": showWeb("gallery")
    case "settings": showWeb("settings")
    default: break
    }
  }
  func handleShortcut(_ action: String) {
    func visible(_ key: String) -> NSWindow? {
      guard let window = windows[key], window.isVisible, !window.isMiniaturized else { return nil }
      return window
    }
    switch action {
    case "capture":
      if native.isCapturing {
        native.cancelCapture()
      } else if let key = latestCaptureEditor, let editor = visible(key) {
        editor.miniaturize(nil)
        restoreShortcutFocus(key)
      } else {
        startCapture(long: false, automatic: false)
      }
    case "pin":
      if let gallery = visible("gallery") {
        restoreShortcutFocus("gallery")
        gallery.close()
      } else {
        showWeb("gallery")
      }
    case "templates":
      let atTemplates = (pendingArea ?? mainArea) == "personal" || mainEditing
      if atTemplates, let main = visible("main") {
        let previous = NSApp.isActive ? returnAfterClosing["main"] ?? lastExternal
          : NSWorkspace.shared.frontmostApplication
        returnAfterClosing.removeValue(forKey: "main")
        if let previous, NSApp.isActive { NSApp.yieldActivation(to: previous) }
        main.orderOut(nil)
        updateBackgroundPolicy()
        if let previous, previous.processIdentifier != ProcessInfo.processInfo.processIdentifier {
          previous.activate(options: [])
        }
      } else {
        if let front = NSWorkspace.shared.frontmostApplication,
          front.processIdentifier != ProcessInfo.processInfo.processIdentifier
        {
          returnAfterClosing["main"] = front
        }
        if atTemplates { showWeb("main") } else { showMain("personal") }
      }
    default: performAction(action)
    }
  }
  private func restoreShortcutFocus(_ key: String) {
    if let app = returnAfterClosing.removeValue(forKey: key), NSApp.isActive, !app.isTerminated {
      NSApp.yieldActivation(to: app)
      app.activate(options: [])
    }
  }
  func startCapture(long: Bool, automatic: Bool) {
    if native.isCapturing {
      native.captureRegion(long: long, automatic: automatic)
      return
    }
    let front = NSWorkspace.shared.frontmostApplication
    captureReturnApp =
      front?.processIdentifier == ProcessInfo.processInfo.processIdentifier ? nil : front
    if shelf?.isVisible == true { dismissShelf() }
    if NSApp.isActive {
      captureOriginWindow = windows.first(where: { $0.value.isKeyWindow })?.key
      hiddenForCapture = windows.filter { $0.value.isVisible && !$0.value.isMiniaturized }.map {
        $0.key
      }
      hiddenForCapture.forEach { windows[$0]?.orderOut(nil) }
      if let lastExternal {
        NSApp.yieldActivation(to: lastExternal)
        lastExternal.activate(options: [])
      }
    }
    native.captureRegion(long: long, automatic: automatic)
  }
  private func completeCapture(_ image: Object, destination: CaptureDestination) {
    var item = image
    do {
      let saved = try archive.add(image, capture: true)
      item["id"] = saved["id"]
    } catch {
      item["archiveError"] = error.localizedDescription
      report("原图归档失败：" + error.localizedDescription)
    }
    if destination == .edit || destination == .copy {
      do { try native.writeClipboard(image) } catch { report(error.localizedDescription) }
    }
    switch destination {
    case .edit:
      latestCaptureEditor = openImageEditor(item, returningTo: captureReturnApp)
    case .copy: break
    case .pin:
      do { try native.pin(item) } catch { report(error.localizedDescription) }
    case .save:
      let previous = captureReturnApp
      saveFile(image, for: nil) { [weak self] result in
        if case .failure(let error) = result { self?.report(error.localizedDescription) }
        if let previous, !previous.isTerminated, NSApp.isActive, NSApp.keyWindow == nil {
          NSApp.yieldActivation(to: previous)
          previous.activate(options: [])
        }
      }
    }
  }
  func restoreAfterCapture(success: Bool) {
    for name in hiddenForCapture { windows[name]?.orderBack(nil) }
    if !success, let name = captureOriginWindow, let window = windows[name] {
      NSApp.activate(ignoringOtherApps: true)
      window.makeKeyAndOrderFront(nil)
    }
    captureOriginWindow = nil
    hiddenForCapture.removeAll()
    captureReturnApp = nil
  }
  @discardableResult
  func openImageEditor(_ item: Object, returningTo app: NSRunningApplication? = nil) -> String {
    let key = "editor-" + UUID().uuidString
    pendingEditors[key] = item
    returnAfterClosing[key] = app
    showWeb(key)
    return key
  }
  func openArchivedImage(_ id: String) throws {
    var item = try archive.publicRow(archive.raw(id))
    guard item["type"] as? String == "image" else { throw AppIssue("仅可编辑图片。") }
    item["data"] = try Data(contentsOf: archive.media(id), options: .mappedIfSafe)
      .base64EncodedString()
    openImageEditor(item)
  }
  func copyRecord(_ id: String) throws {
    var item = try archive.raw(id)
    if item["type"] as? String == "image", item["owned"] as? Bool == true,
      item["fileReference"] as? Bool != true
    {
      item["data"] = try Data(contentsOf: archive.media(id)).base64EncodedString()
      item.removeValue(forKey: "path")
    }
    try native.writeClipboard(item)
  }
  func toggleShelf() {
    if shelf?.isVisible == true {
      dismissShelf()
      return
    }
    let front = NSWorkspace.shared.frontmostApplication
    returnApp = front?.processIdentifier != ProcessInfo.processInfo.processIdentifier ? front : nil
    let panel = ShelfPanel(archive)
    shelf = panel
    panel.delegate = self
    panel.closePanel = { [weak self] in self?.dismissShelf() }
    panel.choose = { [weak self] id in
      guard let self else { return }
      do {
        try copyRecord(id)
        dismissShelf()
      } catch {
        report(error.localizedDescription)
        NSSound.beep()
      }
    }
    NSApp.activate(ignoringOtherApps: true)
    panel.showCards()
  }
  func dismissShelf() {
    shelf?.orderOut(nil)
    shelf = nil
    if let returnApp {
      NSApp.yieldActivation(to: returnApp)
      returnApp.activate(options: [])
    }
    returnApp = nil
  }
  func showMain(_ area: String) {
    pendingArea = area
    showWeb("main")
    flushMain()
  }
  func showWeb(_ name: String) {
    let editor = name.hasPrefix("editor-")
    guard editor || ["main", "settings", "gallery"].contains(name) else { return }
    if usesDock(name), NSApp.activationPolicy() != .regular { NSApp.setActivationPolicy(.regular) }
    if name == "gallery", let front = NSWorkspace.shared.frontmostApplication,
      front.processIdentifier != ProcessInfo.processInfo.processIdentifier
    {
      returnAfterClosing[name] = front
    }
    if let w = windows[name] {
      NSApp.activate(ignoringOtherApps: true)
      if w.isMiniaturized { w.deminiaturize(nil) }
      w.makeKeyAndOrderFront(nil)
      return
    }
    let conf = WKWebViewConfiguration()
    conf.websiteDataStore = smoke ? .nonPersistent() : .default()
    conf.userContentController.add(self, name: "desktop")
    if name == "main" { injectTemplateBackup(conf) }
    conf.setURLSchemeHandler(MediaScheme(archive), forURLScheme: "promptmedia")
    let fileName: String
    let size: NSSize
    let minSize: NSSize
    let title: String
    switch name {
    case "main":
      (fileName, size, minSize, title) = (
        "index.html", NSSize(width: 1100, height: 735), NSSize(width: 650, height: 450),
        "词匣 · 提示词工作台"
      )
    case "settings":
      (fileName, size, minSize, title) = (
        "desktop/ui/settings.html", NSSize(width: 570, height: 600),
        NSSize(width: 440, height: 430), "词匣设置"
      )
    case "gallery":
      (fileName, size, minSize, title) = (
        "desktop/ui/gallery.html", NSSize(width: 720, height: 540), NSSize(width: 395, height: 300),
        "近期截图库"
      )
    default:
      (fileName, size, minSize, title) = (
        "desktop/ui/editor.html", NSSize(width: 940, height: 680), NSSize(width: 440, height: 320),
        "截图编辑"
      )
    }
    let screen =
      NSScreen.screens.first(where: { $0.frame.contains(NSEvent.mouseLocation) }) ?? NSScreen.main
    let visible = screen?.visibleFrame ?? NSRect(origin: .zero, size: size)
    let bounds = NSRect(
      origin: .zero,
      size: NSSize(
        width: min(size.width, visible.width * 0.95),
        height: min(size.height, visible.height * 0.90)))
    let w = NSWindow(
      contentRect: bounds, styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered, defer: false)
    let v = WKWebView(frame: bounds, configuration: conf)
    v.navigationDelegate = self
    v.uiDelegate = self
    v.allowsBackForwardNavigationGestures = false
    w.title = title
    w.minSize = minSize
    w.isReleasedWhenClosed = false
    w.delegate = self
    w.contentView = v
    if editor || name == "gallery" {
      w.level = .floating
      w.collectionBehavior = [.moveToActiveSpace, .fullScreenAuxiliary]
      let offset = CGFloat(windows.keys.filter { $0.hasPrefix("editor-") }.count % 5) * 15
      w.setFrameOrigin(
        NSPoint(
          x: visible.midX - w.frame.width / 2 + offset,
          y: visible.midY - w.frame.height / 2 - offset))
    } else {
      w.center()
      w.setFrameAutosaveName("PromptShelf." + name)
    }
    windows[name] = w
    views[name] = v
    let file = webRoot.appendingPathComponent(fileName)
    v.loadFileURL(file, allowingReadAccessTo: webRoot)
    NSApp.activate(ignoringOtherApps: true)
    w.makeKeyAndOrderFront(nil)
  }
  func windowWillClose(_ note: Notification) {
    if let panel = note.object as? ShelfPanel, panel === shelf {
      dismissShelf()
      return
    }
    guard let w = note.object as? NSWindow, let name = windows.first(where: { $0.value === w })?.key
    else { return }
    views[name]?.configuration.userContentController.removeScriptMessageHandler(forName: "desktop")
    views[name]?.stopLoading()
    views[name]?.navigationDelegate = nil
    w.contentView = nil
    windows.removeValue(forKey: name)
    if usesDock(name) {
      DispatchQueue.main.async { [weak self] in self?.updateBackgroundPolicy() }
    }
    views.removeValue(forKey: name)
    ready.remove(name)
    if latestCaptureEditor == name { latestCaptureEditor = nil }
    if name == "main" {
      mainArea = ""
      mainEditing = false
      pendingArea = nil
    }
    pendingEditors.removeValue(forKey: name)
    if let app = returnAfterClosing.removeValue(forKey: name), NSApp.isActive,
      !windows.keys.contains(where: { $0.hasPrefix("editor-") })
    {
      NSApp.yieldActivation(to: app)
      app.activate(options: [])
    }
  }
  func webView(_ v: WKWebView, didFinish navigation: WKNavigation!) {
    guard let key = views.first(where: { $0.value === v })?.key else { return }
    ready.insert(key)
    if key == "main" { flushMain() }
    if let image = pendingEditors.removeValue(forKey: key) {
      send(v, ["event": "capture.ready", "data": image])
    }
  }
  func flushMain() {
    guard ready.contains("main"), let view = views["main"] else { return }
    if let area = pendingArea {
      pendingArea = nil
      mainArea = area
      mainEditing = false
      send(view, ["event": "route", "data": ["area": area]])
    }

  }
  func send(_ v: WKWebView, _ obj: Object) {
    v.callAsyncJavaScript(
      "window.PromptDesktop?.receive(message)", arguments: ["message": obj], in: nil, in: .page,
      completionHandler: nil)
  }
  func broadcast(_ event: String, _ data: Object) {
    for key in ready { if let v = views[key] { send(v, ["event": event, "data": data]) } }
  }
  func allowed(_ url: URL?) -> Bool {
    guard let url, url.isFileURL else { return false }
    return url.resolvingSymlinksInPath().standardizedFileURL.path.hasPrefix(
      webRoot.resolvingSymlinksInPath().standardizedFileURL.path + "/")
  }
  func webView(
    _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    let url = action.request.url
    if allowed(url) && action.targetFrame?.isMainFrame == true {
      decisionHandler(.allow)
      return
    }
    if action.navigationType == .linkActivated, let url,
      ["http", "https"].contains(url.scheme?.lowercased() ?? "")
    {
      NSWorkspace.shared.open(url)
    }
    decisionHandler(.cancel)
  }
  func webView(
    _ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
    initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void
  ) {
    guard allowed(frame.request.url), let w = webView.window else {
      completionHandler(nil)
      return
    }
    let picker = NSOpenPanel()
    picker.allowsMultipleSelection = parameters.allowsMultipleSelection
    picker.canChooseDirectories = false
    picker.beginSheetModal(for: w) { res in completionHandler(res == .OK ? picker.urls : nil) }
  }
  func userContentController(
    _ controller: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    guard message.frameInfo.isMainFrame, allowed(message.frameInfo.request.url),
      let v = message.webView,
      let body = message.body as? Object, let command = body["command"] as? String
    else { return }
    let p = body["payload"] as? Object ?? [:]
    let rid = body["id"] as? String ?? ""
    func done(_ result: Any) { if !rid.isEmpty { send(v, ["id": rid, "result": result]) } }
    func fail(_ error: Error) {
      if !rid.isEmpty {
        send(v, ["id": rid, "error": error.localizedDescription])
      } else {
        report(error.localizedDescription)
      }
    }
    do {
      switch command {
      case "storage.mutate":
        try mutateBackup(p)
        done(true)
      case "settings.get": done(settings())
      case "ai.settings.get", "ai.settings.set", "ai.models.list", "ai.optimize":
        let settingsWindow = v === views["settings"], mainWindow = v === views["main"]
        let allowed = command == "ai.optimize" ? mainWindow
          : command == "ai.settings.get" ? (settingsWindow || mainWindow) : settingsWindow
        guard allowed else { throw AppIssue("请从模型设置或 AI 优化页执行此操作。") }
        Task { @MainActor in
          do {
            switch command {
            case "ai.settings.get": done(try await promptAI.settings())
            case "ai.settings.set":
              let config = try await promptAI.save(p)
              done(config)
              broadcast("ai.settings.changed", config)
            case "ai.models.list": done(try await promptAI.models(p))
            default: done(try await promptAI.optimize(p))
            }
          } catch { fail(error) }
        }
      case "window.routeChanged":
        if v === views["main"], let area = p["area"] as? String, let editing = p["editing"] as? Bool
        {
          mainArea = area
          mainEditing = editing
        }
        done(true)
      case "app.quit":
        guard v === views["settings"] else { throw AppIssue("请从设置中退出词匣。") }
        done(true)
        NSApp.terminate(nil)
      case "settings.set":
        guard let mapping = p["hotkeys"] as? [String: String],
          Set(mapping.keys) == Set(defaults.keys), let enabled = p["monitoring"] as? Bool
        else { throw AppIssue("快捷键或监听设置不完整。") }
        let old = hotkeys
        let icon = p["showTrayIcon"] as? Bool ?? showTrayIcon
        let conflicts = try native.setHotkeys(mapping, previous: old)
        do {
          try writeSettings(mapping, monitoring: enabled, icon: icon)
        } catch {
          _ = try? native.setHotkeys(old, partial: true)
          throw error
        }
        hotkeys = mapping
        setMonitoring(enabled)
        showTrayIcon = icon
        hotkeyIssue =
          conflicts.isEmpty ? "" : "快捷键 " + conflicts.joined(separator: "、") + " 已被占用，请更换组合。"
        lastIssue = hotkeyIssue
        updateStatusItem()
        done(settings())
        broadcast("settings.changed", settings())
      case "history.list": done(try archive.list())
      case "history.detail": done(try archive.publicRow(archive.raw(p["id"] as? String ?? "")))
      case "history.add": done(try archive.add(p, capture: (p["source"] as? String) == "截图工具"))
      case "history.remove":
        try archive.remove(p["id"] as? String ?? "")
        done(true)
      case "history.copy":
        try copyRecord(p["id"] as? String ?? "")
        done(true)
      case "clipboard.write":
        guard let text = p["text"] as? String, !text.isEmpty else { throw AppIssue("复制内容为空。") }
        let item: Object = ["type": "text", "text": text, "source": "词匣 · 提示词"]
        try native.writeClipboard(item)
        do { _ = try archive.add(item) } catch { report(error.localizedDescription) }
        done(true)
      case "clipboard.read":
        native.readClipboardNow()
        done(true)
      case "capture.start":
        done(true)
        startCapture(long: p["long"] as? Bool ?? false, automatic: p["automatic"] as? Bool ?? true)
      case "capture.list":
        done(try archive.captures())
      case "capture.pinMany":
        guard let ids = p["ids"] as? [String], !ids.isEmpty, ids.count <= 100,
          Set(ids).count == ids.count
        else { throw AppIssue("请选择需要置顶的截图。") }
        let items = try ids.map { try archive.raw($0) }
        guard
          items.allSatisfy({ $0["capture"] as? Bool == true && $0["type"] as? String == "image" })
        else { throw AppIssue("仅可选择图库内的截图。") }
        try native.pinMany(items)
        done(true)
      case "capture.pin":
        if let id = p["id"] as? String {
          try native.pin(archive.raw(id))
        } else if p["data"] is String {
          try native.pin(p)
        } else {
          showWeb("gallery")
        }
        done(true)
      case "capture.copy":
        if let id = p["id"] as? String {
          try copyRecord(id)
          done(true)
        } else {
          guard p["data"] is String else { throw AppIssue("缺少要复制的图片。") }
          var item = p
          item["type"] = "image"
          item["source"] = "截图工具"
          item["mime"] = "image/png"
          try native.writeClipboard(item)
          do {
            _ = try archive.add(item, capture: true)
            done(true)
          } catch {
            let warning = "图片已复制，归档失败：" + error.localizedDescription
            report(warning)
            done(["copied": true, "warning": warning] as Object)
          }
        }
      case "window.open":
        let area = p["area"] as? String ?? "main"
        switch area {
        case "settings", "gallery": showWeb(area)
        case "editor": try openArchivedImage(p["id"] as? String ?? "")
        case "shelf": toggleShelf()
        default: showMain(area == "main" ? "personal" : area)
        }
        done(true)
      case "window.close":
        done(true)
        v.window?.close()
      case "file.save":
        guard let w = v.window else { throw AppIssue("窗口已关闭。") }
        saveFile(p, for: w) { result in
          switch result {
          case .success(true): done(true)
          case .success(false): fail(AppIssue("已取消保存。"))
          case .failure(let error): fail(error)
          }
        }
      default: throw AppIssue("未识别的桌面操作。")
      }
    } catch { fail(error) }
  }
  private func saveFile(_ item: Object, for window: NSWindow?, completion: @escaping (Result<Bool, Error>) -> Void) {
    let picker = NSSavePanel()
    if smoke {
      picker.identifier = NSUserInterfaceItemIdentifier("PromptShelf.SmokeExport")
      picker.directoryURL = archive.root
    }
    picker.nameFieldStringValue = ((item["filename"] as? String ?? "截图.png") as NSString).lastPathComponent
    picker.canCreateDirectories = true
    let respond: (NSApplication.ModalResponse) -> Void = { response in
      guard response == .OK, let url = picker.url else { completion(.success(false)); return }
      do {
        let data: Data
        if let id = item["id"] as? String {
          data = try Data(contentsOf: self.archive.media(id), options: .mappedIfSafe)
        } else if let encoded = item["data"] as? String, let decoded = Data(base64Encoded: encoded) {
          data = decoded
        } else { throw AppIssue("文件内容为空。") }
        try data.write(to: url, options: .atomic)
        completion(.success(true))
      } catch { completion(.failure(error)) }
    }
    if let window {
      picker.beginSheetModal(for: window, completionHandler: respond)
    } else {
      NSApp.activate(ignoringOtherApps: true)
      picker.begin(completionHandler: respond)
    }
  }
  func settings() -> Object {
    [
      "hotkeys": hotkeys, "monitoring": monitoring, "showTrayIcon": showTrayIcon,
      "hotkeyIssue": hotkeyIssue,
    ]
  }
  private var backupDir: URL { archive.root.appendingPathComponent("Templates", isDirectory: true) }
  private func mutateBackup(_ p: Object) throws {
    guard let key = p["key"] as? String, key.hasPrefix("prompt-desk:v1:"), key.count < 256 else {
      throw AppIssue("模板键无效。")
    }
    try FileManager.default.createDirectory(at: backupDir, withIntermediateDirectories: true)
    let hash = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
    let file = backupDir.appendingPathComponent(hash + ".json")
    if let value = p["value"] as? String {
      try JSONSerialization.data(withJSONObject: ["key": key, "value": value]).write(
        to: file, options: .atomic)
    } else if FileManager.default.fileExists(atPath: file.path) {
      try FileManager.default.removeItem(at: file)
    }
  }
  private func injectTemplateBackup(_ config: WKWebViewConfiguration) {
    var saved = [String: String]()
    for file
      in (try? FileManager.default.contentsOfDirectory(
        at: backupDir, includingPropertiesForKeys: nil)) ?? []
    {
      if let d = try? Data(contentsOf: file),
        let r = (try? JSONSerialization.jsonObject(with: d)) as? [String: String], let k = r["key"],
        let v = r["value"]
      {
        saved[k] = v
      }
    }
    let json = String(
      decoding: (try? JSONSerialization.data(withJSONObject: saved)) ?? Data("{}".utf8),
      as: UTF8.self)
    let script = """
      (()=>{const saved=\(json);
      for(const [k,v] of Object.entries(saved))localStorage.setItem(k,v);
      const notify=(key,value)=>{if(String(key).startsWith('prompt-desk:v1:'))webkit.messageHandlers.desktop.postMessage({command:'storage.mutate',payload:{key,value}})};
      const set=Storage.prototype.setItem, rm=Storage.prototype.removeItem;
      Storage.prototype.setItem=function(k,v){set.call(this,k,v);if(this===localStorage)notify(k,String(v))};
      Storage.prototype.removeItem=function(k){rm.call(this,k);if(this===localStorage)notify(k,null)};
      })()
      """
    config.userContentController.addUserScript(
      WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
  }
}
