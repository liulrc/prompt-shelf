import Foundation
import Security

private struct ProviderSettings: Codable {
  var baseURL = ""
  var models: [String] = []
  var credential: String?

  var publicFields: Object {
    ["baseURL": baseURL, "models": models, "hasKey": credential != nil]
  }
}

private final class NoProviderRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }
}

actor PromptAI {
  private let configFile: URL
  private let keychainService: String
  private let session: URLSession
  private let redirectPolicy = NoProviderRedirect()

  init(root: URL, keychainService: String = "com.promptshelf.desktop.ai") {
    configFile = root.appendingPathComponent("AISettings.json")
    self.keychainService = keychainService
    let options = URLSessionConfiguration.ephemeral
    options.urlCredentialStorage = nil
    options.httpCookieStorage = nil
    options.httpShouldSetCookies = false
    options.urlCache = nil
    options.timeoutIntervalForRequest = 90
    options.timeoutIntervalForResource = 150
    session = URLSession(configuration: options)
  }

  func settings() throws -> Object { try load().publicFields }

  func save(_ payload: Object) throws -> Object {
    let old = try load()
    guard let supplied = payload["baseURL"] as? String, let ids = payload["models"] as? [String]
    else {
      throw AppIssue("请填写模型接口地址并选择模型。")
    }
    let base =
      supplied.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      ? "" : try Self.base(supplied)
    var seen = Set<String>()
    let models = ids.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty && seen.insert($0).inserted }
    let newKey = try explicitKey(payload)
    guard !base.isEmpty || (models.isEmpty && (newKey ?? "").isEmpty) else {
      throw AppIssue("请先填写接口地址。")
    }
    var updated = ProviderSettings(
      baseURL: base, models: models,
      credential: base == old.baseURL ? old.credential : nil)
    var created: String?
    if let newKey {
      created = newKey.isEmpty ? nil : try putSecret(newKey)
      updated.credential = created
    }
    do {
      try JSONEncoder().encode(updated).write(to: configFile, options: .atomic)
    } catch {
      if let created { deleteSecret(created) }
      throw AppIssue("模型设置未能写入本机。")
    }
    if let previous = old.credential, previous != updated.credential { deleteSecret(previous) }
    return updated.publicFields
  }

  func models(_ payload: Object) async throws -> Object {
    let base = try Self.base(payload["baseURL"] as? String ?? "")
    let saved = try load()
    let key =
      try explicitKey(payload) ?? (base == saved.baseURL ? try secret(saved.credential) : "")
    let reply = try await request(base: base, route: "models", key: key)
    guard let data = reply["data"] as? [Object] else {
      throw AppIssue("模型接口应返回含 data 数组的模型列表。也可在设置中手动输入模型名。")
    }
    let ids = data.compactMap { $0["id"] as? String }.filter { !$0.isEmpty }
    return ["models": Array(Set(ids)).sorted()]
  }

  func optimize(_ payload: Object) async throws -> Object {
    let saved = try load()
    guard !saved.baseURL.isEmpty, let model = payload["model"] as? String,
      saved.models.contains(model)
    else { throw AppIssue("请在设置中选择并保存要使用的模型。") }
    guard let text = payload["text"] as? String,
      !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else { throw AppIssue("请先输入需要优化的提示词。") }
    let body: Object = [
      "model": model, "stream": false,
      "messages": [
        [
          "role": "system",
          "content":
            "你是提示词编辑。将输入重写成清晰、可执行的提示词。默认用中文撰写整条优化后的提示词，即使输入为英文或其他语言。只有用户明确指定优化后的提示词本身使用另一种语言时，才按指定语言改写。原任务对邮件、报告、对白等最终产出的语种要求要保留，并在中文提示词中写清。保留目的、事实、约束、【】示例槽位、原样引用、代码、URL 和必要的专名。只输出优化后的提示词正文，不执行原任务，不编造材料。",
        ],
        ["role": "user", "content": text],
      ],
    ]
    let reply = try await request(
      base: saved.baseURL, route: "chat/completions", key: secret(saved.credential), body: body)
    let message = (reply["choices"] as? [Object])?.first?["message"] as? Object
    let content: String
    if let answer = message?["content"] as? String {
      content = answer
    } else {
      content =
        (message?["content"] as? [Object])?.compactMap { $0["text"] as? String }.joined() ?? ""
    }
    guard !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw AppIssue("模型未返回提示词正文，请检查所选模型是否支持对话。")
    }
    return ["model": model, "text": content]
  }

  private func load() throws -> ProviderSettings {
    do {
      return try JSONDecoder().decode(ProviderSettings.self, from: Data(contentsOf: configFile))
    } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
      return ProviderSettings()
    } catch { throw AppIssue("无法读取本机模型设置。") }
  }

  private static func base(_ raw: String) throws -> String {
    let input = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !input.contains("\\"), let first = URLComponents(string: input),
      let scheme = first.scheme?.lowercased(), ["https", "http"].contains(scheme),
      let host = first.host, !host.isEmpty, first.user == nil, first.password == nil,
      first.query == nil, first.fragment == nil
    else { throw AppIssue("请输入含 http:// 或 https:// 的接口地址，密钥请填在单独的输入框中。") }
    var parts = first
    parts.scheme = scheme
    parts.host = host.lowercased()
    if (scheme == "https" && parts.port == 443) || (scheme == "http" && parts.port == 80) {
      parts.port = nil
    }
    var path = parts.percentEncodedPath
    while path.hasSuffix("/") { path.removeLast() }
    for suffix in ["/chat/completions", "/models"] where path.hasSuffix(suffix) {
      path.removeLast(suffix.count)
      break
    }
    parts.percentEncodedPath = path.isEmpty ? "/v1" : path
    guard let url = parts.url else { throw AppIssue("模型接口地址无效。") }
    return url.absoluteString
  }

  private func request(base: String, route: String, key: String, body: Object? = nil) async throws
    -> Object
  {
    guard let url = URL(string: base + "/" + route) else { throw AppIssue("模型接口地址无效。") }
    var req = URLRequest(url: url)
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    if !key.isEmpty { req.setValue("Bearer " + key, forHTTPHeaderField: "Authorization") }
    if let body {
      req.httpMethod = "POST"
      req.setValue("application/json", forHTTPHeaderField: "Content-Type")
      req.httpBody = try JSONSerialization.data(withJSONObject: body)
    }
    let limit = 8 * 1024 * 1024
    let (bytes, response) = try await session.bytes(for: req, delegate: redirectPolicy)
    guard let http = response as? HTTPURLResponse else { throw AppIssue("模型接口没有返回 HTTP 响应。") }
    guard (200..<300).contains(http.statusCode) else {
      let hint: String
      switch http.statusCode {
      case 300..<400: hint = "请直接填写服务最终地址。"
      case 401, 403: hint = "请检查 API 密钥和模型权限。"
      case 404: hint = "请检查接口地址的路径、版本及模型名。"
      case 429: hint = "服务已限流或额度不足，请稍后重试。"
      default: hint = "请检查服务状态和所选模型。"
      }
      throw AppIssue("模型服务返回 HTTP \(http.statusCode)。" + hint)
    }
    guard response.expectedContentLength <= limit else { throw AppIssue("模型响应过大。") }
    var data = Data()
    for try await byte in bytes {
      guard data.count < limit else { throw AppIssue("模型响应过大。") }
      data.append(byte)
    }
    guard let object = (try? JSONSerialization.jsonObject(with: data)) as? Object else {
      throw AppIssue("接口返回的内容不是 JSON，请检查接口地址。")
    }
    return object
  }

  private func explicitKey(_ payload: Object) throws -> String? {
    guard payload["apiKey"] != nil else { return nil }
    guard let value = payload["apiKey"] as? String else { throw AppIssue("密钥格式无效。") }
    let key = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard key.rangeOfCharacter(from: .controlCharacters) == nil else {
      throw AppIssue("密钥中含有换行或控制字符。")
    }
    return key
  }

  private func keyQuery(_ id: String) -> [CFString: Any] {
    [kSecClass: kSecClassGenericPassword, kSecAttrService: keychainService, kSecAttrAccount: id]
  }

  private func putSecret(_ value: String) throws -> String {
    let id = UUID().uuidString
    var item = keyQuery(id)
    item[kSecValueData] = Data(value.utf8)
    item[kSecAttrLabel] = "词匣 · 模型 API 密钥"
    item[kSecAttrAccessible] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    let status = SecItemAdd(item as CFDictionary, nil)
    guard status == errSecSuccess else { throw AppIssue("无法把密钥保存到 Mac 钥匙串（\(status)）。") }
    return id
  }

  private func secret(_ id: String?) throws -> String {
    guard let id else { return "" }
    var query = keyQuery(id)
    query[kSecReturnData] = true
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess, let data = result as? Data,
      let key = String(data: data, encoding: .utf8)
    else { throw AppIssue("无法读取 Mac 钥匙串中的模型密钥，请在设置中重新输入。") }
    return key
  }

  private func deleteSecret(_ id: String) { SecItemDelete(keyQuery(id) as CFDictionary) }
}
