import Foundation
import Observation
import Security

enum Problem: LocalizedError {
    case signIn
    case server(String)

    var errorDescription: String? {
        switch self {
        case .signIn: "Sign in again to get new data."
        case .server(let text): text
        }
    }
}

struct Refreshed: Decodable {
    let rows: Int?
    let fetched: Int?
    let stopped: String?
    let error: String?
}

@MainActor @Observable final class Store {
    static let scheme = "spending"

    var data: AppData?
    var month = ""
    var loading = false
    var fetchingBank = false
    var problem: Problem?
    static let bundled = Bundle.main.url(forResource: "server", withExtension: "txt")
        .flatMap { try? String(contentsOf: $0, encoding: .utf8) }?
        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

    var server: String = UserDefaults.standard.string(forKey: "server").flatMap { $0.isEmpty ? nil : $0 } ?? Store.bundled {
        didSet { UserDefaults.standard.set(server, forKey: "server") }
    }
    private(set) var cookie: String? = Keychain.read()

    var base: URL? {
        let text = server.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty, let url = URL(string: text.contains("://") ? text : "https://\(text)") else { return nil }
        return url.scheme == "https" || Self.loopback.contains(url.host() ?? "") ? url : nil
    }

    private static let loopback = ["127.0.0.1", "localhost"]

    var isLocal: Bool { Self.loopback.contains(base?.host() ?? "") }
    var signedIn: Bool { isLocal || cookie != nil }
    var selected: Month? { data?.months.first { $0.month == month } ?? data?.months.last }

    var signInURL: URL? {
        guard let base, var parts = URLComponents(url: base.appending(path: "oauth2/start"), resolvingAgainstBaseURL: false) else { return nil }
        parts.queryItems = [URLQueryItem(name: "rd", value: "/app/signed-in")]
        return parts.url
    }

    func start() async {
        if data == nil, let cached = try? Data(contentsOf: Self.cacheFile) {
            await use(cached, in: session)
        }
        if signedIn { await reload() }
    }

    func finishSignIn(_ callback: URL) async {
        let value = URLComponents(url: callback, resolvingAgainstBaseURL: false)?
            .queryItems?.first { $0.name == "cookie" }?.value
        guard let value, !value.isEmpty else {
            problem = .server("The server did not return a session.")
            return
        }
        Keychain.write(value)
        cookie = value
        problem = nil
        await reload()
    }

    private var session = 0

    func signOut() {
        session += 1
        Keychain.write(nil)
        cookie = nil
        data = nil
        try? FileManager.default.removeItem(at: Self.cacheFile)
    }

    private var again = false

    func reload() async {
        guard base != nil else { return }
        if loading {
            again = true
            return
        }
        loading = true
        defer { loading = false }
        repeat {
            again = false
            await download()
        } while again
    }

    private func download() async {
        guard let base else { return }
        let mine = session
        do {
            let body = try await Self.get(base.appending(path: "api/app"), cookie: cookie)
            guard await use(body, in: mine) else { return }
            try? body.write(to: Self.cacheFile, options: .atomic)
            problem = nil
        } catch {
            guard mine == session else { return }
            problem = error as? Problem ?? .server(error.localizedDescription)
        }
    }

    func fetchFromBank() async -> String {
        guard let base, !fetchingBank else { return "" }
        fetchingBank = true
        defer { fetchingBank = false }
        do {
            let body = try await Self.get(base.appending(path: "api/refresh"), cookie: cookie, bank: true)
            let answer = try JSONDecoder().decode(Refreshed.self, from: body)
            if let error = answer.error { return error }
            await reload()
            let fetched = answer.fetched ?? 0
            let note = fetched == 1 ? "1 file from the bank." : "\(fetched) files from the bank."
            return answer.stopped.map { "\(note) Stopped: \($0)" } ?? note
        } catch {
            return error.localizedDescription
        }
    }

    @discardableResult
    private func use(_ body: Data, in mine: Int) async -> Bool {
        guard let decoded = try? await Self.decode(body), mine == session else { return false }
        data = decoded
        if !decoded.months.contains(where: { $0.month == month }) {
            month = decoded.months.last?.month ?? ""
        }
        return true
    }

    private nonisolated static func decode(_ body: Data) async throws -> AppData {
        try await Task.detached(priority: .userInitiated) {
            var decoded = try JSONDecoder().decode(AppData.self, from: body)
            for index in decoded.txns.indices {
                let txn = decoded.txns[index]
                decoded.txns[index].id = index
                decoded.txns[index].search = "\(txn.merchant) \(txn.description) \(decoded.label(txn.category)) \(decoded.label(txn.category, txn.subcategory))".lowercased()
            }
            return decoded
        }.value
    }

    private static let cacheFile = URL.applicationSupportDirectory.appending(path: "app.json")

    private static let session: URLSession = {
        try? FileManager.default.createDirectory(at: .applicationSupportDirectory, withIntermediateDirectories: true)
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.httpCookieStorage = nil
        config.timeoutIntervalForRequest = 300
        return URLSession(configuration: config, delegate: NoRedirects(), delegateQueue: nil)
    }()

    private nonisolated static func get(_ url: URL, cookie: String?, bank: Bool = false) async throws -> Data {
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let cookie { request.setValue(cookie, forHTTPHeaderField: "Cookie") }
        if bank { request.setValue("1", forHTTPHeaderField: "X-Banking-Refresh") }
        let (body, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 || status == 403 || (300..<400).contains(status) { throw Problem.signIn }
        if status != 200, !bank {
            throw Problem.server(String(data: body, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "HTTP \(status)")
        }
        return body
    }
}

private final class NoRedirects: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest) async -> URLRequest? {
        nil
    }
}

enum Keychain {
    private static var query: [String: Any] { [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.olavassbotn.Spending",
        kSecAttrAccount as String: "session",
    ] }

    static func read() -> String? {
        var item: CFTypeRef?
        var search = query
        search[kSecReturnData as String] = true
        guard SecItemCopyMatching(search as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func write(_ value: String?) {
        SecItemDelete(query as CFDictionary)
        guard let value else { return }
        var add = query
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }
}
