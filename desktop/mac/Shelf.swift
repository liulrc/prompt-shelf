import AppKit

private final class CardsTable: NSTableView {
  var accept: (() -> Void)?
  var dismiss: (() -> Void)?
  override func keyDown(with event: NSEvent) {
    switch event.keyCode {
    case 36, 76: accept?()
    case 53: dismiss?()
    default: super.keyDown(with: event)
    }
  }
}
@MainActor
final class ShelfPanel: NSPanel, NSTableViewDataSource, NSTableViewDelegate, NSSearchFieldDelegate {
  private let archive: Archive
  private let search = NSSearchField()
  private let table = CardsTable()
  private var rows = [Object]()
  var choose: ((String) -> Void)?
  var closePanel: (() -> Void)?
  override var canBecomeKey: Bool { true }
  init(_ archive: Archive) {
    self.archive = archive
    super.init(
      contentRect: NSRect(x: 0, y: 0, width: 440, height: 420),
      styleMask: [.titled, .closable, .utilityWindow, .fullSizeContentView], backing: .buffered,
      defer: false)
    title = "剪贴板历史"
    isReleasedWhenClosed = false
    level = .floating
    titlebarAppearsTransparent = true
    isMovableByWindowBackground = true
    hidesOnDeactivate = false
    collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    let pane = NSView()
    contentView = pane
    search.placeholderString = "搜索文字、文件名或来源"
    search.delegate = self
    search.sendsSearchStringImmediately = true
    let scroll = NSScrollView()
    scroll.hasVerticalScroller = true
    scroll.autohidesScrollers = true
    let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("card"))
    column.resizingMask = [.autoresizingMask]
    table.addTableColumn(column)
    table.columnAutoresizingStyle = .lastColumnOnlyAutoresizingStyle
    table.headerView = nil
    table.rowHeight = 52
    table.intercellSpacing = NSSize(width: 0, height: 3)
    table.style = .inset
    table.selectionHighlightStyle = .regular
    table.delegate = self
    table.dataSource = self
    table.target = self
    table.action = #selector(clicked)
    table.accept = { [weak self] in self?.accept() }
    table.dismiss = { [weak self] in self?.closePanel?() }
    scroll.documentView = table
    let hint = NSTextField(labelWithString: "↑ ↓  选择      ↩  复制到剪贴板      esc  关闭")
    hint.font = .systemFont(ofSize: 11)
    hint.textColor = .secondaryLabelColor
    for view in [search, scroll, hint] as [NSView] {
      view.translatesAutoresizingMaskIntoConstraints = false
      pane.addSubview(view)
    }
    NSLayoutConstraint.activate([
      search.topAnchor.constraint(equalTo: pane.topAnchor, constant: 35),
      search.leadingAnchor.constraint(equalTo: pane.leadingAnchor, constant: 14),
      search.trailingAnchor.constraint(equalTo: pane.trailingAnchor, constant: -14),
      scroll.topAnchor.constraint(equalTo: search.bottomAnchor, constant: 8),
      scroll.leadingAnchor.constraint(equalTo: pane.leadingAnchor, constant: 5),
      scroll.trailingAnchor.constraint(equalTo: pane.trailingAnchor, constant: -5),
      scroll.bottomAnchor.constraint(equalTo: hint.topAnchor, constant: -7),
      hint.leadingAnchor.constraint(equalTo: pane.leadingAnchor, constant: 17),
      hint.bottomAnchor.constraint(equalTo: pane.bottomAnchor, constant: -11),
    ])
  }
  func showCards() {
    search.stringValue = ""
    refresh()
    let screen =
      NSScreen.screens.first { $0.frame.contains(NSEvent.mouseLocation) } ?? NSScreen.main
    if let r = screen?.visibleFrame {
      setFrameOrigin(NSPoint(x: r.midX - frame.width / 2, y: r.midY - frame.height / 2))
    }
    makeKeyAndOrderFront(nil)
    makeFirstResponder(search)
  }
  func refresh() {
    let selected =
      rows.indices.contains(table.selectedRow) ? rows[table.selectedRow]["id"] as? String : nil
    let words = search.stringValue.lowercased().split(whereSeparator: { $0.isWhitespace })
    rows = ((try? archive.list()) ?? []).filter { row in
      let joined = ["title", "text", "source", "filename"].compactMap { row[$0] as? String }.joined(
        separator: " "
      ).lowercased()
      return words.allSatisfy { joined.contains($0) }
    }
    table.reloadData()
    if !rows.isEmpty {
      let i = rows.firstIndex(where: { ($0["id"] as? String) == selected }) ?? 0
      table.selectRowIndexes(IndexSet(integer: i), byExtendingSelection: false)
    }
    title = rows.isEmpty ? "剪贴板历史 · 没有匹配的记录" : "剪贴板历史"
  }
  func numberOfRows(in tableView: NSTableView) -> Int { rows.count }
  func tableView(_ tableView: NSTableView, viewFor column: NSTableColumn?, row: Int) -> NSView? {
    let entry = rows[row]
    let view = NSView()
    let pic = NSImageView()
    pic.imageScaling = .scaleProportionallyUpOrDown
    let type = entry["type"] as? String ?? "text"
    let image = entry["id"].flatMap {
      NSImage(contentsOf: archive.thumbnail(String(describing: $0)))
    }
    pic.image =
      image
      ?? NSImage(
        systemSymbolName: type == "text" ? "text.alignleft" : type == "video" ? "film" : "photo",
        accessibilityDescription: nil)
    let name = NSTextField(
      labelWithString: (entry["title"] as? String ?? "").replacingOccurrences(of: "\n", with: " "))
    name.font = .systemFont(ofSize: 13, weight: .medium)
    name.lineBreakMode = .byTruncatingTail
    let meta = NSTextField(
      labelWithString: [
        type == "text" ? "文本" : type == "image" ? "图片" : "视频", entry["source"] as? String ?? "",
      ].joined(separator: " · "))
    meta.font = .systemFont(ofSize: 11)
    meta.textColor = .secondaryLabelColor
    for el in [pic, name, meta] as [NSView] {
      el.translatesAutoresizingMaskIntoConstraints = false
      view.addSubview(el)
    }
    NSLayoutConstraint.activate([
      pic.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 8),
      pic.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      pic.widthAnchor.constraint(equalToConstant: 42),
      pic.heightAnchor.constraint(equalToConstant: 36),
      name.leadingAnchor.constraint(equalTo: pic.trailingAnchor, constant: 10),
      name.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -7),
      name.topAnchor.constraint(equalTo: view.topAnchor, constant: 7),
      meta.leadingAnchor.constraint(equalTo: name.leadingAnchor),
      meta.trailingAnchor.constraint(equalTo: name.trailingAnchor),
      meta.topAnchor.constraint(equalTo: name.bottomAnchor, constant: 3),
    ])
    return view
  }
  @objc private func clicked() { if table.clickedRow >= 0 { accept() } }
  private func accept() {
    let i = table.selectedRow
    if rows.indices.contains(i), let id = rows[i]["id"] as? String { choose?(id) }
  }
  func controlTextDidChange(_ obj: Notification) { refresh() }
  func control(_ control: NSControl, textView: NSTextView, doCommandBy command: Selector) -> Bool {
    let name = NSStringFromSelector(command)
    if name == "insertNewline:" {
      accept()
      return true
    }
    if name == "cancelOperation:" {
      closePanel?()
      return true
    }
    if name == "moveDown:" || name == "moveUp:" {
      if !rows.isEmpty {
        let i = min(rows.count - 1, max(0, table.selectedRow + (name == "moveDown:" ? 1 : -1)))
        table.selectRowIndexes(IndexSet(integer: i), byExtendingSelection: false)
        table.scrollRowToVisible(i)
      }
      return true
    }
    return false
  }
}
