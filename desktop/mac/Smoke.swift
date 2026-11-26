import AppKit
import WebKit

extension DesktopApp {
  // Run with an isolated data directory and a named pasteboard. No user history is read.
  func runSmoke() {
    Task { @MainActor in
      do {
        func waitFor(_ predicate: () -> Bool) async throws {
          for _ in 0..<160 {
            if predicate() { return }
            try await Task.sleep(nanoseconds: 100_000_000)
          }
          throw AppIssue("窗口加载超时")
        }
        try await waitFor { self.ready.contains("main") }
        guard let v = views["main"] else { throw AppIssue("主窗口缺失") }
        func js(_ view: WKWebView, _ script: String) async throws -> Any? {
          try await view.callAsyncJavaScript(script, arguments: [:], in: nil, contentWorld: .page)
        }
        let startup =
          try await js(
            v,
            "return {active:PromptDesktop.active,title:document.title,route:location.hash,settings:await PromptDesktop.request('settings.get')}"
          ) as? Object
        guard startup?["active"] as? Bool == true, startup?["route"] as? String == "#personal"
        else { throw AppIssue("主界面未进入我的模板：\(String(describing:startup))") }
        guard let settings = startup?["settings"] as? Object,
          settings["hotkeys"] as? [String: String] == defaultsForSmoke
        else {
          throw AppIssue("四个发布默认快捷键不匹配")
        }
        let keyMap = isolatedTestKeys
        try native.setHotkeys(keyMap)
        try native.setHotkeys([
          "capture": keyMap["templates"]!, "shelf": keyMap["pin"]!, "pin": keyMap["shelf"]!,
          "templates": keyMap["capture"]!,
        ])
        try native.setHotkeys(keyMap)
        hotkeys = keyMap
        _ = try await js(
          v,
          "await PromptDesktop.request('clipboard.write',{type:'text',text:'词匣桥接测试·带换行\\n第二行'}); return true"
        )
        guard let record = try archive.list().first,
          (record["text"] as? String)?.contains("第二行") == true
        else { throw AppIssue("剪贴板归档失败") }
        try copyRecord(record["id"] as! String)
        let board = NSPasteboard(name: .init("PromptShelf.Test." + smokePasteboardToken))
        guard board.string(forType: .string) == record["text"] as? String else {
          throw AppIssue("系统剪贴板回写失败")
        }
        let fixture =
          try await js(
            v,
            "const c=document.createElement('canvas');c.width=112;c.height=75;const g=c.getContext('2d');g.fillStyle='#357';g.fillRect(2,2,90,50);return c.toDataURL().split(',')[1]"
          ) as! String
        native.onCapture?([
          "type": "image", "mime": "image/png", "data": fixture, "title": "截图测试", "frameHeight": 50,
          "source": "截图工具",
        ])
        guard let picID = try archive.lastCapture()?["id"] as? String else {
          throw AppIssue("截图未能写入历史")
        }
        try await waitFor {
          FileManager.default.fileExists(atPath: self.archive.thumbnail(picID).path)
        }
        let opened = try await js(
          v,
          "for(let i=0;i<40;i++){if(location.hash==='#capture' && document.querySelector('.cap-edit')?.hidden===false && document.querySelector('.cap-canvasbox canvas')?.width===112)return true;await new Promise(resolve=>setTimeout(resolve,100))}return false"
        )
        guard opened as? Bool == true, board.data(forType: .png) != nil else {
          throw AppIssue("系统截图无法联动标注器或剪贴板")
        }
        let width = try await js(
          v,
          "const list=await PromptDesktop.request('history.list');const row=list.find(x=>x.type==='image');const img=new Image();img.src=row.url;await img.decode();return img.naturalWidth"
        )
        guard width as? Int == 112 else { throw AppIssue("归档图片在工作台内无法预览") }
        try pinLatest()
        guard
          NSApp.windows.contains(where: {
            $0.isVisible && $0.level == .floating && $0.title == "截图测试"
          })
        else { throw AppIssue("置顶截图不可见") }
        native.unpin()
        let imported = archive.root.appendingPathComponent("带空格 图片.png")
        try Data(base64Encoded: fixture)!.write(to: imported)
        board.clearContents()
        board.writeObjects([imported as NSURL])
        try await waitFor {
          (try? self.archive.list().first?["filename"] as? String) == imported.lastPathComponent
        }
        let importedID = try archive.list().first!["id"] as! String
        try FileManager.default.removeItem(at: imported)
        try copyRecord(importedID)
        guard let copied = board.string(forType: .fileURL).flatMap(URL.init(string:)),
          copied.lastPathComponent == imported.lastPathComponent,
          FileManager.default.fileExists(atPath: copied.path)
        else { throw AppIssue("图片文件历史回写失败") }
        _ = try await js(
          v,
          "const s=PromptModel.createStore();s.savePersonal({title:'回读模板',category:'通用',body:'整理【例：材料】'});return true"
        )
        try await Task.sleep(nanoseconds: 250_000_000)
        showWeb("settings")
        try await waitFor { self.ready.contains("settings") }
        guard let sets = views["settings"] else { throw AppIssue("设置窗口缺失") }
        let controls = try await js(
          sets, "return document.querySelectorAll('#hotkeys select').length")
        guard controls as? Int == 8 else { throw AppIssue("设置页快捷键控件不完整") }
        _ = try await js(
          sets,
          "const s=await PromptDesktop.request('settings.get');s.monitoring=false;await PromptDesktop.request('settings.set',s);return true"
        )
        guard !monitoring, FileManager.default.fileExists(atPath: settingsFile.path) else {
          throw AppIssue("设置未保存")
        }
        toggleShelf()
        guard let popup = shelf, popup.isVisible,
          let search = popup.contentView?.subviews.compactMap({ $0 as? NSSearchField }).first
        else {
          throw AppIssue("原生历史卡片不可见")
        }
        search.stringValue = "第二行"
        popup.refresh()
        _ = popup.control(
          search, textView: NSTextView(), doCommandBy: #selector(NSResponder.insertNewline(_:)))
        guard shelf == nil, board.string(forType: .string) == record["text"] as? String else {
          throw AppIssue("卡片关键词筛选和回车复制失败")
        }
        windows["settings"]?.close()
        windows["main"]?.close()
        guard views.isEmpty else { throw AppIssue("关窗后未释放 WebView") }
        showMain("personal")
        try await waitFor { self.ready.contains("main") }
        let count = try await js(
          views["main"]!,
          "return PromptModel.createStore().listPersonal().filter(x=>x.title==='回读模板').length")
        guard count as? Int == 1 else { throw AppIssue("重新打开后模板丢失") }
        print(
          "PASS WK bridge and media preview, shortcut remapping, pasteboard text and external file monitoring, PNG thumbnail, pinned window, SQLite history, settings, native card shelf, WebView disposal and template recovery"
        )
        native.shutdown()
        fflush(stdout)
        Darwin.exit(0)
      } catch {
        fputs("SMOKE FAILED: " + error.localizedDescription + "\n", stderr)
        native.shutdown()
        Darwin.exit(1)
      }
    }
  }
}
let defaultsForSmoke = ["capture": "Alt+A", "shelf": "Alt+Q", "pin": "Alt+Z", "templates": "Alt+X"]
let isolatedTestKeys = [
  "capture": "Ctrl+Alt+Shift+1", "shelf": "Ctrl+Alt+Shift+2", "pin": "Ctrl+Alt+Shift+3",
  "templates": "Ctrl+Alt+Shift+4",
]
let smokePasteboardToken = UUID().uuidString
