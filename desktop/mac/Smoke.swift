import AppKit
import WebKit

extension DesktopApp {
  // Run with an isolated data directory and a named pasteboard. No user history is read.
  func runSmoke() {
    Task { @MainActor in
      do {
        func waitFor(_ predicate: () -> Bool, line: Int = #line) async throws {
          for _ in 0..<160 {
            if predicate() { return }
            try await Task.sleep(nanoseconds: 100_000_000)
          }
          throw AppIssue("等待桌面操作超时（测试第 \(line) 行）")
        }
        try await waitFor { self.ready.contains("main") }
        guard NSApp.activationPolicy() == .regular else { throw AppIssue("工作台未进入前台应用模式") }
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
        ], .edit)
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
        ], .edit)
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
        if let port = ProcessInfo.processInfo.environment["PS_SMOKE_AI_PORT"].flatMap(UInt16.init) {
          try await checkProviderBridge(port: port, main: v, settingsView: sets)
        }
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
        try await waitFor { NSApp.activationPolicy() == .accessory }
        board.clearContents()
        board.setString("词匣后台监听验收", forType: .string)
        try await waitFor { (try? self.archive.list().first?["text"] as? String) == "词匣后台监听验收" }
        handleShortcut("shelf")
        guard shelf?.isVisible == true, NSApp.activationPolicy() == .accessory else {
          throw AppIssue("后台卡片弹窗改变了 Dock 状态")
        }
        handleShortcut("shelf")
        performAction("pin")
        try await waitFor { self.ready.contains("gallery") }
        guard views.count == 1, views["main"] == nil else { throw AppIssue("从后台唤出图库时打开了工作台") }
        windows["gallery"]?.close()
        showMain("personal")
        guard NSApp.activationPolicy() == .regular else { throw AppIssue("重新打开工作台未恢复 Dock") }
        try await waitFor { self.ready.contains("main") }
        let count = try await js(
          views["main"]!,
          "return PromptModel.createStore().listPersonal().filter(x=>x.title==='回读模板').length")
        guard count as? Int == 1 else { throw AppIssue("重新打开后模板丢失") }
        let fileName = "直接截图测试-" + UUID().uuidString + ".png"
        let quick: Object = ["type": "image", "mime": "image/png", "data": fixture,
          "title": "直接截图测试", "filename": fileName, "frameHeight": 75, "source": "截图工具"]
        native.onCapture?(quick, .copy)
        guard let copiedImage = board.data(forType: .png), NSBitmapImageRep(data: copiedImage)?.pixelsWide == 112,
          let quickID = try archive.captures().first?["id"] as? String, latestCaptureEditor == nil
        else { throw AppIssue("直接复制截图未归档、写剪贴板，或意外打开编辑器") }
        let boardVersion = board.changeCount
        native.onCapture?(quick, .pin)
        guard native.pinnedWindows[quickID]?.isVisible == true, board.changeCount == boardVersion
        else { throw AppIssue("直接置顶截图失败或意外改写剪贴板") }
        native.unpin()
        if CGPreflightPostEventAccess() {
          print("PASS direct copy and pin. Checking system save panel")
          native.onCapture?(quick, .save)
          let destination = archive.root.appendingPathComponent(fileName).standardizedFileURL
          let readyToSave = {
            NSWorkspace.shared.frontmostApplication?.processIdentifier == ProcessInfo.processInfo.processIdentifier
              && (NSApp.keyWindow as? NSSavePanel)?.url?.standardizedFileURL == destination
          }
          try await waitFor(readyToSave)
          print("PASS isolated Save window opened")
          // The system save dialog runs its controls in a separate process. Send
          // the normal Return only while our own dialog and temporary path are active.
          try await Task.sleep(nanoseconds: 750_000_000)
          guard readyToSave() else { throw AppIssue("保存测试窗口焦点已变化") }
          for down in [true, false] {
            CGEvent(keyboardEventSource: nil, virtualKey: 36, keyDown: down)?.post(tap: .cghidEventTap)
          }
          try await waitFor { FileManager.default.fileExists(atPath: destination.path) }
          guard try Data(contentsOf: destination) == Data(base64Encoded: fixture),
            board.changeCount == boardVersion, latestCaptureEditor == nil
          else { throw AppIssue("直接保存的 PNG 与原选区不符，或意外改写剪贴板") }
          print("PASS native Save dialog wrote the original PNG")
        }
        print("PASS quick capture copy and pin, clipboard history and editor-free output")
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

extension DesktopApp {
  private func checkProviderBridge(port: UInt16, main: WKWebView, settingsView: WKWebView) async throws {
    let args = ["server": "http://127.0.0.1:\(port)"]
    let configured = try await settingsView.callAsyncJavaScript("""
      const bridge=window.PromptDesktop;
      const baseURL=server+'/team/v1', apiKey='fixture-only';
      const saved=await bridge.request('ai.settings.set',{baseURL,apiKey,models:['fixture-a','fixture-b']});
      if(!saved.hasKey || saved.apiKey!==undefined) return false;
      const ids=await bridge.request('ai.models.list',{baseURL:baseURL+'/chat/completions'});
      const other=await bridge.request('ai.models.list',{baseURL:server+'/other/v1'});
      let redirected=false;
      try { await bridge.request('ai.models.list',{baseURL:server+'/redirect/v1',apiKey}); }
      catch(e) { redirected=e.message.includes('302'); }
      return ids.models.join(',')==='fixture-a,fixture-b' && other.models[0]==='local' && redirected;
      """, arguments: args, in: nil, contentWorld: .page)
    guard configured as? Bool == true else { throw AppIssue("模型列表、密钥隔离或重定向验证失败") }
    let optimized = try await main.callAsyncJavaScript("""
      document.querySelector('[data-nav=optimize]').click();
      const pause=()=>new Promise(r=>setTimeout(r,50));
      for(let i=0;i<100&&document.querySelectorAll('.ai-choices input:checked').length!==2;i++)await pause();
      const field=document.querySelector('#ai-input');field.value='Summarize the project notes in an English email.';field.dispatchEvent(new Event('input'));
      for(let i=0;i<100&&document.querySelector('#ai-submit').disabled;i++)await pause();
      document.querySelector('#ai-submit').click();
      for(let i=0;i<120;i++){
        const rows=Array.from(document.querySelectorAll('.ai-result'));
        if(rows.length===2 && rows[0].textContent.includes('根据项目记录撰写一封英文邮件，概括进展和下一步。') && rows[1].textContent.includes('429'))return true;
        await pause();
      }
      return '模型控件 ' + document.querySelector('#ai-target')?.textContent + '，结果 ' + document.querySelector('.ai-result-list')?.textContent;
      """, arguments: [:], in: nil, contentWorld: .page)
    let raw = try String(contentsOf: archive.root.appendingPathComponent("AISettings.json"), encoding: .utf8)
    let cleared = try await settingsView.callAsyncJavaScript("""
      const r=await PromptDesktop.request('ai.settings.set',{baseURL:'',models:[]});
      return !r.hasKey && !r.models.length;
      """, arguments: [:], in: nil, contentWorld: .page)
    guard optimized as? Bool == true else { throw AppIssue("优化结果检查失败 " + (optimized as? String ?? "")) }
    guard cleared as? Bool == true, !raw.contains("fixture-only") else { throw AppIssue("密钥清理或存储检查失败") }
    print("PASS provider Keychain round trip, endpoint isolation, redirect refusal and one-click per-model output")
  }
}
