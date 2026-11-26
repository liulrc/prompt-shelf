// From the repository root:
// xcrun swiftc -parse-as-library tests/mac/EditorWebKitRegression.swift -o /tmp/CiXiaEditorWebKit && /tmp/CiXiaEditorWebKit
import AppKit
import WebKit

@main
final class EditorWebKitRegression: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler {
  static var owner: EditorWebKitRegression!
  private var web: WKWebView!
  private var window: NSWindow!
  private var exports = 0

  static func main() {
    let application = NSApplication.shared
    owner = EditorWebKitRegression()
    application.setActivationPolicy(.prohibited)
    application.delegate = owner
    application.run()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .nonPersistent()
    config.userContentController.add(self, name: "desktop")
    web = WKWebView(frame: NSRect(x: 0, y: 0, width: 900, height: 680), configuration: config)
    window = NSWindow(contentRect: web.frame, styleMask: [.borderless], backing: .buffered, defer: false)
    window.contentView = web
    web.navigationDelegate = self
    let root = URL(filePath: FileManager.default.currentDirectoryPath)
    web.loadFileURL(root.appending(path: "desktop/ui/editor.html"), allowingReadAccessTo: root)
    DispatchQueue.main.asyncAfter(deadline: .now() + 45) { print("FAIL: editor timed out"); exit(1) }
  }

  func webView(_ view: WKWebView, didFinish navigation: WKNavigation!) {
    Task { @MainActor in
      do {
        _ = try await view.callAsyncJavaScript("""
          const $ = id => document.getElementById(id);
          const pause = () => new Promise(r=>setTimeout(r,30));
          async function capture(height) {
            const img = document.createElement('canvas'); img.width=192; img.height=height;
            const checker = document.createElement('canvas'); checker.width=checker.height=4;
            const tile = checker.getContext('2d'); tile.fillStyle='white'; tile.fillRect(0,0,4,4);
            tile.fillStyle='#111'; tile.fillRect(0,0,2,2); tile.fillRect(2,2,2,2);
            const ctx=img.getContext('2d'); ctx.fillStyle=ctx.createPattern(checker,'repeat'); ctx.fillRect(0,0,192,height);
            PromptDesktop.receive({event:'capture.ready',data:{mime:'image/png',data:img.toDataURL().split(',')[1],frameHeight:80}});
            while ($('photo').naturalHeight!==height || $('save').disabled) await pause();
            $('zoom').value='1'; $('zoom').dispatchEvent(new Event('change'));
          }
          const canvas = $('canvas');
          // DOM-generated events have no OS pointer. Keep this offscreen regression
          // independent of mouse capture; the Chromium suite sends trusted mouse input.
          canvas.setPointerCapture = ()=>{};
          const tool = name => document.querySelector('[data-tool="'+name+'"]').click();
          function drag(x1,y1,x2,y2,target=canvas) {
            const r=canvas.getBoundingClientRect();
            for (const [i,kind] of ['pointerdown','pointermove','pointerup'].entries()) {
              (i===0 ? target : canvas).dispatchEvent(new PointerEvent(kind,{pointerId:1,isPrimary:true,bubbles:true,
                button:0,clientX:r.x+(i===0?x1:x2),clientY:r.y+(i===0?y1:y2)}));
            }
          }
          async function save() {
            $('save').click();
            while ($('save').disabled) await pause();
            if (!$('status').textContent.includes('已保存')) throw Error($('status').textContent);
          }
          await capture(160);
          tool('rect'); drag(24,20,96,72);
          tool('select'); drag(50,44,70,64);
          drag(116,92,152,104,document.querySelector('[data-handle="se"]'));
          $('color').value='#127c41'; $('color').dispatchEvent(new Event('input'));
          const path=document.querySelector('[data-mark="rect"]').getAttribute('d');
          if (path!=='M 44 40 H 152 V 104 H 44 Z') throw Error('Unexpected edited rectangle: '+path);
          tool('mosaic'); drag(66,76,114,90); await save();
          await capture(16200);
          $('stage').scrollTop=350;
          tool('mosaic'); drag(48,500,132,524); await save();
          return true;
          """, arguments: [:], in: nil, contentWorld: .page)
        guard exports == 2 else { throw NSError(domain: "Missing exports", code: 1) }
        print("WKWebView passed rectangle move/resize/recolor and opaque mosaic pixels for 192×160 and streamed 192×16200 PNGs.")
        exit(0)
      } catch { print("FAIL: \(error)"); exit(1) }
    }
  }

  private func sample(_ image: NSBitmapImageRep, x: Int, y: Int) -> [Int] {
    guard let color = image.colorAt(x: x, y: y)?.usingColorSpace(.sRGB) else { return [] }
    return [color.redComponent, color.greenComponent, color.blueComponent, color.alphaComponent]
      .map { Int(($0 * 255).rounded()) }
  }

  private func checkMosaic(_ image: NSBitmapImageRep, y: Int) -> Bool {
    let first = sample(image, x: 85, y: y)
    guard first.count == 4, (30...225).contains(first[0]), first[0] == first[1],
      first[1] == first[2], first[3] == 255 else { return false }
    return (86...91).allSatisfy { sample(image, x: $0, y: y) == first }
  }

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let m = message.body as? [String: Any], m["command"] as? String == "file.save",
      let id = m["id"] as? String, let p = m["payload"] as? [String: Any],
      let base64 = p["data"] as? String, let bytes = Data(base64Encoded: base64),
      let img = NSBitmapImageRep(data: bytes), img.pixelsWide == 192
    else { print("FAIL: unexpected bridge message or image"); exit(1) }
    if exports == 0 {
      let green = sample(img, x: 152, y: 56)
      // WebKit can attach its display color profile to a PNG. Compare channel
      // relationships after ColorSync conversion to sRGB.
      guard img.pixelsHigh == 160, checkMosaic(img, y: 84), green.count == 4,
        green[1] > green[0] + 75, green[1] > green[2] + 40, green[3] == 255
      else { print("FAIL: edited rectangle or small mosaic", sample(img, x:152, y:56)); exit(1) }
    } else {
      guard img.pixelsHigh == 16200, checkMosaic(img, y: 509), checkMosaic(img, y: 514),
        sample(img, x: 157, y: 350) != sample(img, x: 159, y: 350)
      else { print("FAIL: large mosaic did not survive a PNG strip boundary"); exit(1) }
    }
    exports += 1
    web.callAsyncJavaScript("PromptDesktop.receive({id:requestId,result:true});", arguments: ["requestId": id],
                            in: nil, in: .page, completionHandler: nil)
  }
}
