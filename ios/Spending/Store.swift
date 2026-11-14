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

struct Answer: Decodable {
    let rows: Int?
    let fetched: Int?
    let stopped: String?
    let error: String?
    let at: Double?
}

struct RefreshStatus: Decodable {
    let running: Bool
    let last: Answer?
}

@MainActor @Observable final class Store {
    static let scheme = "spending"

    var data: AppData?
    var period = "" {
        didSet { figures() }
    }
    var filters = (UserDefaults.standard.data(forKey: "filters")).flatMap { try? JSONDecoder().decode(Filters.self, from: $0) } ?? Filters() {
        didSet {
            UserDefaults.standard.set(try? JSONEncoder().encode(filters), forKey: "filters")
            if filters.changesFigures || oldValue.changesFigures { figures() }
        }
    }
    private(set) var custom: Period?
    private var cached: [String: Period] = [:]
    private(set) var figuring = false
    private(set) var figureProblem: String?
    private var figureTask: Task<Void, Never>?
    var refreshNote: String?
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
    var selected: Period? { lookup(period) ?? data?.months.last }

    var shown: Period? {
        guard let selected else { return nil }
        return filters.changesFigures ? cached[figureKey(selected.key)] : selected
    }

    var periodRows: [Txn] {
        guard let data, let selected else { return [] }
        return data.txns.filter(selected.contains)
    }

    var rows: [Txn] { periodRows.filter { filters.matches($0) } }

    func lookup(_ key: String) -> Period? { custom?.key == key ? custom : data?.periods.first { $0.key == key } }

    private func figureKey(_ key: String) -> String { Query.encode([("p", key)] + filters.query) }

    func figures() {
        figureTask?.cancel()
        figureProblem = nil
        guard filters.changesFigures, let key = selected?.key, cached[figureKey(key)] == nil else {
            figuring = false
            return
        }
        figuring = true
        let query = figureKey(key)
        figureTask = Task {
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled, let base else { return }
            let mine = session
            do {
                let body = try await Self.get(Self.url(base, "api/app/period", query), cookie: cookie)
                let found = try JSONDecoder().decode(Period.self, from: body)
                guard !Task.isCancelled, mine == session else { return }
                cached[query] = found
                figuring = false
            } catch {
                guard !Task.isCancelled else { return }
                figureProblem = error.localizedDescription
                figuring = false
            }
        }
    }

    private static func url(_ base: URL, _ path: String, _ query: String = "") -> URL {
        var parts = URLComponents(url: base.appending(path: path), resolvingAgainstBaseURL: false)!
        parts.percentEncodedQuery = query.isEmpty ? nil : query
        return parts.url!
    }

    func load<T: Decodable>(_ type: T.Type, _ path: String, _ query: [(String, String)] = []) async throws -> T {
        guard let base else { throw Problem.server("No server.") }
        let body = try await Self.get(Self.url(base, path, Query.encode(query)), cookie: cookie, guarded: "X-Banking-Rules")
        if let error = try? JSONDecoder().decode(Answer.self, from: body).error { throw Problem.server(error) }
        return try JSONDecoder().decode(T.self, from: body)
    }

    func rule(_ action: String, _ query: [(String, String)]) async -> String? {
        do {
            let answer = try await load(Answer.self, "api/rules/\(action)", query)
            await reload()
            return answer.error
        } catch {
            return error.localizedDescription
        }
    }

    func bulk(_ file: String, keys: [String], value: String) async -> String? {
        await rule("bulk", [("file", file), ("value", value)] + keys.map { ("key", $0) })
    }

    private static let views = ["activity": "transactions", "insights": "insights", "items": "items"]

    func link(tab: String) -> URL? {
        guard let base else { return nil }
        let view = Self.views[tab].map { [("view", $0)] } ?? []
        return Self.url(base, "", Query.encode(view + (period.isEmpty ? [] : [("p", period)]) + filters.query))
    }

    func open(_ url: URL) {
        let query = Query.decode(URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedQuery)
        filters = Filters(query: query)
        if let key = query.first(where: { $0.0 == "p" })?.1, !key.isEmpty {
            if key.contains("..") { Task { _ = await show(key) } } else { period = key }
        }
    }

    var signInURL: URL? {
        guard let base, var parts = URLComponents(url: base.appending(path: "oauth2/start"), resolvingAgainstBaseURL: false) else { return nil }
        parts.queryItems = [URLQueryItem(name: "rd", value: "/app/signed-in")]
        return parts.url
    }

    func start() async {
        if data == nil, let cached = try? Data(contentsOf: Self.cacheFile) {
            await use(cached, in: session)
        }
        if signedIn {
            await reload()
            await fetchFromBank(start: false)
        }
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
        custom = nil
        cached = [:]
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
        if period.contains("..") { _ = await show(period) }
    }

    func show(_ key: String) async -> String? {
        guard let base else { return "No server." }
        let mine = session
        do {
            let found = try JSONDecoder().decode(Period.self, from: try await Self.get(Self.url(base, "api/app/period", Query.encode([("p", key)])), cookie: cookie))
            guard mine == session else { return nil }
            custom = found
            period = key
            return nil
        } catch {
            return error.localizedDescription
        }
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

    func fetchFromBank(start: Bool = true) async {
        guard let base, !fetchingBank else { return }
        fetchingBank = true
        defer { fetchingBank = false }
        do {
            var status = try JSONDecoder().decode(
                RefreshStatus.self,
                from: try await Self.get(base.appending(path: start ? "api/refresh/start" : "api/refresh/status"), cookie: cookie, guarded: "X-Banking-Refresh")
            )
            guard start || status.running else { return }
            if start { refreshNote = nil }
            while status.running {
                try await Task.sleep(for: .seconds(2))
                status = try JSONDecoder().decode(RefreshStatus.self, from: try await Self.get(base.appending(path: "api/refresh/status"), cookie: cookie))
            }
            await reload()
            guard let last = status.last else { return }
            if let error = last.error {
                refreshNote = error
                return
            }
            let fetched = last.fetched ?? 0
            let rows = last.rows ?? 0
            let note = "\(fetched) \(fetched == 1 ? "file" : "files") fetched, \(rows) rows rebuilt."
            refreshNote = last.stopped.map { "\(note) Stopped: \($0)" } ?? note
        } catch {
            refreshNote = error.localizedDescription
        }
    }

    @discardableResult
    private func use(_ body: Data, in mine: Int) async -> Bool {
        guard let decoded = try? await Self.decode(body), mine == session else { return false }
        data = decoded
        cached = [:]
        figures()
        if !period.contains(".."), custom?.key != period, !decoded.periods.contains(where: { $0.key == period }) {
            period = decoded.months.last?.key ?? ""
        }
        return true
    }

    private nonisolated static func decode(_ body: Data) async throws -> AppData {
        try await Task.detached(priority: .userInitiated) {
            var decoded = try JSONDecoder().decode(AppData.self, from: body)
            for index in decoded.txns.indices {
                let txn = decoded.txns[index]
                decoded.txns[index].id = index
                decoded.txns[index].itemKeys = Array(Set((txn.purchases ?? []).map(\.key)))
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

    private nonisolated static func get(_ url: URL, cookie: String?, guarded: String? = nil) async throws -> Data {
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let cookie { request.setValue(cookie, forHTTPHeaderField: "Cookie") }
        if let guarded { request.setValue("1", forHTTPHeaderField: guarded) }
        let (body, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 || status == 403 || (300..<400).contains(status) { throw Problem.signIn }
        if status != 200, guarded == nil {
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
