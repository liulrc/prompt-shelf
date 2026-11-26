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
        let library = try await js(
          v,
          """
          const nav=area=>document.querySelector('[data-nav="'+area+'"]').click();
          nav('builtin');
          for (const name of ['视频','文案','开发','办公','研究']) {
            document.querySelector('[data-filter="'+name+'"]').click();
            if (document.querySelectorAll('.card[data-open]').length<20) return false;
          }
          document.querySelector('[data-filter="视频"]').click();
          const sample=window.PROMPT_LIBRARY.find(t=>t.category==='视频' && t.source?.url?.includes('//design.minimax.'));
          if (!sample) return false;
          document.querySelector('.card[data-open="'+sample.id+'"]').click();
          const source=document.querySelector('.pe-source-credit a');
          if (!source || !source.href.includes('minimax.') || !document.querySelector('#pe-raw')?.value.includes('【例：')) return false;
          document.querySelector('[data-ed="cancel"]').click();nav('personal');
          return document.querySelectorAll('.card[data-open]').length===0;
          """)
        guard library as? Bool == true else { throw AppIssue("分类模板、来源或个人库隔离检查失败") }
        guard let settings = startup?["settings"] as? Object,
          settings["hotkeys"] as? [String: String] == defaultsForSmoke,
          settings["showTrayIcon"] as? Bool == true, statusItem != nil
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
        if CGPreflightScreenCaptureAccess() {
          handleShortcut("capture")
          guard native.isCapturing else { throw AppIssue("截图快捷键未打开选区") }
          handleShortcut("capture")
          guard !native.isCapturing, try archive.captures().isEmpty else {
            throw AppIssue("截图快捷键未取消选区")
          }
          print("PASS screenshot selection opened and cancelled without archiving a frame")
        }
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
        guard let picID = try archive.captures().first?["id"] as? String else {
          throw AppIssue("截图未能写入历史")
        }
        try await waitFor {
          FileManager.default.fileExists(atPath: self.archive.thumbnail(picID).path)
        }
        try await waitFor { self.ready.contains(where: { $0.hasPrefix("editor-") }) }
        let editor = views[ready.first(where: { $0.hasPrefix("editor-") })!]!
        let opened = try await js(
          editor,
          """
          for (let i=0;i<50;i++){
            if(document.querySelector('#photo')?.naturalWidth===112 && !document.querySelector('#copy').disabled) return true;
            await new Promise(r=>setTimeout(r,80))
          }
          return false
          """)
        guard opened as? Bool == true, board.data(forType: .png) != nil,
          try await js(v, "return location.hash") as? String == "#personal"
        else { throw AppIssue("独立截图编辑窗未正确打开") }
        let annotated = try await js(
          editor,
          """
          const canvas=document.querySelector('#canvas'), box=canvas.getBoundingClientRect();
          document.querySelector('[data-tool="text"]').click();
          canvas.dispatchEvent(new PointerEvent('pointerdown',{isPrimary:true,button:0,clientX:box.left+8,clientY:box.top+12,bubbles:true}));
          document.querySelector('#text-entry').value='图注';
          document.querySelector('#text-apply').click();
          const hasText=document.querySelector('#marks').textContent.includes('图注');
          setTimeout(()=>document.querySelector('#copy').click(),40);
          return hasText
          """)
        try await waitFor { self.views.values.allSatisfy { $0 !== editor } }
        guard annotated as? Bool == true, try archive.captures().count == 2,
          let edited = try archive.captures().first?["id"] as? String, edited != picID,
          let editedData = board.data(forType: .png),
          let editedRep = NSBitmapImageRep(data: editedData)
        else { throw AppIssue("文字标注未保留在剪贴板与截图历史中") }
        var redPixels = 0
        for y in 0..<editedRep.pixelsHigh {
          for x in 0..<editedRep.pixelsWide {
            if let c = editedRep.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB),
              c.alphaComponent > 0.6 && c.redComponent > 0.60
                && c.redComponent > c.blueComponent + 0.25
            {
              redPixels += 1
            }
          }
        }
        guard redPixels > 16 else { throw AppIssue("导出的 PNG 没有红色文字像素") }
        performAction("pin")
        try await waitFor { self.ready.contains("gallery") }
        let gallery = views["gallery"]!
        let selected = try await js(
          gallery,
          """
          for(let i=0;i<50 && document.querySelectorAll('#list [data-id]').length<2;i++) await new Promise(r=>setTimeout(r,80));
          const cards=Array.from(document.querySelectorAll('#list [data-id]'));
          if(cards.length!==2) return false;
          cards.forEach(card=>card.click());setTimeout(()=>document.getElementById('pin').click(),40);
          return true
          """)
        try await waitFor { self.native.pinnedWindows.count == 2 && self.windows["gallery"] == nil }
        guard selected as? Bool == true, let first = native.pinnedWindows[picID],
          let second = native.pinnedWindows[edited],
          let imageView = first.contentView as? NSImageView,
          first.level == .floating && second.isVisible
        else { throw AppIssue("图库多选置顶失败") }
        @MainActor func visibleInkWidth(_ view: NSImageView) throws -> Int {
          guard let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) else {
            throw AppIssue("无法检查钉图像素")
          }
          view.cacheDisplay(in: view.bounds, to: bitmap)
          let y = bitmap.pixelsHigh / 2
          return (0..<bitmap.pixelsWide).filter { x in
            guard let c = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else {
              return false
            }
            return c.alphaComponent > 0.7 && c.blueComponent > c.redComponent + 0.12
          }.count
        }
        let initialInk = try visibleInkWidth(imageView)
        let old = imageView.bounds.size
        first.setContentSize(NSSize(width: old.width * 1.8, height: old.height * 1.8))
        let enlargedInk = try visibleInkWidth(imageView)
        guard
          imageView.bounds.width > old.width * 1.4 && imageView.bounds.height > old.height * 1.4,
          imageView.imageScaling == .scaleProportionallyUpOrDown && initialInk > 0
            && enlargedInk > initialInk * 14 / 10
        else { throw AppIssue("钉图未跟随窗口缩放") }
        first.close()
        guard native.pinnedWindows.count == 1 && second.isVisible else {
          throw AppIssue("关闭一张钉图影响了其他图")
        }
        native.unpin()
        let tall =
          try await js(
            v,
            """
            const c=document.createElement('canvas');c.width=310;c.height=2980;
            const g=c.getContext('2d');g.fillStyle='#fefefe';g.fillRect(0,0,310,2980);
            g.fillStyle='green';g.fillRect(0,2950,310,30);return c.toDataURL().split(',')[1];
            """) as! String
        native.onCapture?([
          "type": "image", "mime": "image/png", "data": tall, "title": "整张长图", "height": 2980,
          "width": 310, "frameHeight": 552, "source": "截图工具",
        ])
        try await waitFor { self.ready.contains(where: { $0.hasPrefix("editor-") }) }
        let tallKey = ready.first(where: { $0.hasPrefix("editor-") })!
        let whole = try await js(
          views[tallKey]!,
          """
          for(let i=0;i<50;i++){
            const img=document.querySelector('#photo'),stage=document.querySelector('#stage');
            if(img?.naturalHeight===2980 && document.querySelector('#zoom').value==='fit' && !document.querySelector('#copy').disabled){
              const b=img.getBoundingClientRect(),r=stage.getBoundingClientRect();
              return b.height>60 && b.top>=r.top-1 && b.bottom<=r.bottom+1 && b.left>=r.left-1 && b.right<=r.right+1
            }
            await new Promise(r=>setTimeout(r,80))
          }return false;
          """)
        guard whole as? Bool == true else { throw AppIssue("长图在编辑窗中首次显示不完整") }
        handleShortcut("capture")
        try await waitFor { self.windows[tallKey]?.isMiniaturized == true }
        showWeb(tallKey)
        try await waitFor { self.windows[tallKey]?.isKeyWindow == true }
        let reopened = try await js(
          v,
          """
          document.querySelector('[data-nav="capture"]').click();
          for (let i=0;i<50;i++) {
            const card=document.querySelector('.capture-card[data-id="\(picID)"]');
            if(card){card.click();return true}
            await new Promise(resolve=>setTimeout(resolve,80))
          }
          return false
          """)
        guard reopened as? Bool == true else { throw AppIssue("工作台的最近截图未能重新打开") }
        try await waitFor { self.ready.filter { $0.hasPrefix("editor-") }.count == 2 }
        guard views[tallKey] != nil else { throw AppIssue("第二张截图覆盖了已有编辑窗") }
        for key in Array(windows.keys) where key.hasPrefix("editor-") { windows[key]?.close() }
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
          "const s=await PromptDesktop.request('settings.get');s.monitoring=false;s.showTrayIcon=false;await PromptDesktop.request('settings.set',s);return true"
        )
        let savedSettings =
          try JSONSerialization.jsonObject(with: Data(contentsOf: settingsFile)) as? Object
        guard !monitoring, statusItem == nil, savedSettings?["showTrayIcon"] as? Bool == false
        else {
          throw AppIssue("设置未保存")
        }
        handleShortcut("templates")
        try await waitFor { self.mainArea == "personal" }
        _ = try await js(
          v,
          """
          document.querySelector('[data-act="new"]').click();
          const field=document.querySelector('#pe-raw');field.value='测试未保存的改写';
          field.dispatchEvent(new Event('input',{bubbles:true}));return true
          """)
        try await waitFor { self.mainEditing }
        handleShortcut("templates")
        guard windows["main"]?.isVisible == false else { throw AppIssue("模板快捷键未收起编辑器") }
        handleShortcut("templates")
        guard windows["main"]?.isVisible == true,
          try await js(v, "return document.querySelector('#pe-raw')?.value") as? String
            == "测试未保存的改写"
        else { throw AppIssue("模板快捷键切换丢失草稿") }
        handleShortcut("pin")
        handleShortcut("pin")
        guard windows["gallery"] == nil else { throw AppIssue("图库快捷键未关闭") }
        _ = try await js(
          sets,
          "const s=await PromptDesktop.request('settings.get');s.showTrayIcon=true;await PromptDesktop.request('settings.set',s);return true"
        )
        guard statusItem?.menu != nil else { throw AppIssue("菜单栏图标未恢复") }
        guard let menu = statusItem?.menu, let item = menu.item(withTitle: "自动记录剪贴板"),
          item.state == .off
        else { throw AppIssue("菜单栏缺少监听开关") }
        menu.performActionForItem(at: menu.index(of: item))
        guard monitoring, statusItem?.menu?.item(withTitle: "自动记录剪贴板")?.state == .on else {
          throw AppIssue("菜单栏切换监听失败")
        }
        let synchronized = try await js(
          sets,
          """
          for(let i=0;i<20;i++){if(document.querySelector('#monitoring').checked)return true;
          await new Promise(r=>setTimeout(r,50))}return false
          """)
        guard synchronized as? Bool == true else { throw AppIssue("监听开关未同步到设置窗口") }
        handleShortcut("shelf")
        handleShortcut("shelf")
        guard shelf == nil else { throw AppIssue("剪贴板快捷键未收起") }
        handleShortcut("shelf")
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
        performAction("pin")
        try await waitFor { self.ready.contains("gallery") }
        guard views.count == 1, views["main"] == nil else { throw AppIssue("从后台唤出图库时打开了工作台") }
        windows["gallery"]?.close()
        showMain("personal")
        try await waitFor { self.ready.contains("main") }
        let count = try await js(
          views["main"]!,
          "return PromptModel.createStore().listPersonal().filter(x=>x.title==='回读模板').length")
        guard count as? Int == 1 else { throw AppIssue("重新打开后模板丢失") }
        print(
          "PASS standalone screenshot editor, Chinese annotation exported to system PNG, multi-selection screenshot gallery, independently resizable pins, clipboard monitoring, shortcuts, settings, shelf and template recovery"
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
