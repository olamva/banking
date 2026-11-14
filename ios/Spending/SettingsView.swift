import SwiftUI

struct SettingsView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @AppStorage("theme") private var theme = Theme.system
    @AppStorage("tab") private var tab = "summary"
    @State private var confirmBank = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Server", value: store.base?.host() ?? "None")
                    LabeledContent("Session", value: store.isLocal ? "Not needed" : store.cookie == nil ? "Signed out" : "Signed in")
                    if let data = store.data, let generated = try? Date(data.generated, strategy: .iso8601) {
                        LabeledContent("Downloaded") {
                            Text(generated, format: .relative(presentation: .named))
                        }
                        LabeledContent("Transactions", value: data.txns.count.formatted())
                    }
                }
                Section {
                    Button {
                        confirmBank = true
                    } label: {
                        HStack {
                            Label(store.fetchingBank ? "Refreshing…" : "Fetch from the bank", systemImage: "building.columns")
                            Spacer()
                            if store.fetchingBank { ProgressView() }
                        }
                    }
                    .disabled(store.fetchingBank)
                    .confirmationDialog("Fetch new transactions from the bank?", isPresented: $confirmBank, titleVisibility: .visible) {
                        Button("Fetch") {
                            Task { await store.fetchFromBank() }
                        }
                    } message: {
                        Text("The server asks SpareBank 1 for the months that can still change, and fetches new receipts. This uses the request quota.")
                    }
                    if let note = store.refreshNote {
                        Text(note).font(.footnote).foregroundStyle(.secondary)
                    }
                    Button {
                        Task { await store.reload() }
                    } label: {
                        HStack {
                            Label("Download again", systemImage: "arrow.down.circle")
                            Spacer()
                            if store.loading { ProgressView() }
                        }
                    }
                    .disabled(store.loading)
                } footer: {
                    Text("Fetch is the same action as Refresh on the web dashboard. Download again reads the data the server already holds and makes no request to the bank.")
                }
                Section {
                    NavigationLink {
                        RulesView()
                    } label: {
                        Label("Rules", systemImage: "list.bullet.rectangle")
                    }
                    NavigationLink {
                        ReleasesView()
                    } label: {
                        Label("Release notes", systemImage: "sparkles")
                    }
                }
                Section {
                    Picker("Appearance", selection: $theme) {
                        ForEach(Theme.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                }
                Section {
                    if let link = store.link {
                        ShareLink(item: link) { Label("Share this view as a web link", systemImage: "square.and.arrow.up") }
                    }
                    if let app = appLink {
                        ShareLink(item: app) { Label("Share this view as an app link", systemImage: "link") }
                    }
                } footer: {
                    Text("A link holds the period, the filters and the search. The app link opens this tab in the app.")
                }
                if !store.isLocal {
                    Section {
                        if case .signIn = store.problem { SignInButton() }
                        Button("Sign out", role: .destructive) {
                            store.signOut()
                            dismiss()
                        }
                    }
                }
                Section {
                    LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done", systemImage: "checkmark") { dismiss() }
                }
            }
        }
    }

    private var appLink: URL? {
        var parts = URLComponents()
        parts.scheme = Store.scheme
        parts.host = "open"
        parts.path = "/\(tab)"
        let query = Query.encode((store.period.isEmpty ? [] : [("p", store.period)]) + store.filters.query)
        parts.percentEncodedQuery = query.isEmpty ? nil : query
        return parts.url
    }
}

struct Release: Decodable, Identifiable {
    struct Highlight: Decodable, Hashable {
        let title: String
        let detail: String
    }

    let version: String
    let date: String
    let highlights: [Highlight]

    var id: String { version }
}

struct ReleasesView: View {
    @Environment(Store.self) private var store
    @State private var releases: [Release]?
    @State private var failure: String?

    var body: some View {
        List {
            ForEach(Array((releases ?? []).enumerated()), id: \.element.id) { index, release in
                Section {
                    ForEach(release.highlights, id: \.self) { highlight in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(highlight.title).font(.headline)
                            Text(highlight.detail).font(.subheadline).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                    }
                } header: {
                    HStack {
                        Text("Version \(release.version)")
                        Spacer()
                        if index == 0 { Text("Current").foregroundStyle(.green) }
                        Text(Day.date(release.date).shortDay)
                    }
                }
            }
        }
        .overlay {
            if let failure {
                ContentUnavailableView("No release notes", systemImage: "sparkles", description: Text(failure))
            } else if releases == nil {
                ProgressView()
            }
        }
        .navigationTitle("Release notes")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            do {
                releases = try await store.load([Release].self, "api/app/releases")
            } catch {
                failure = error.localizedDescription
            }
        }
    }
}
