import SwiftUI

struct SettingsView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
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
                    Text("Reads the data the server already holds. This makes no request to the bank.")
                }
                Section {
                    Button {
                        confirmBank = true
                    } label: {
                        HStack {
                            Label("Fetch from the bank", systemImage: "building.columns")
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
                        Text("The server asks SpareBank 1 for the months that can still change. This uses the request quota.")
                    }
                    if let note = store.refreshNote {
                        Text(note).font(.footnote).foregroundStyle(.secondary)
                    }
                } footer: {
                    Text("The same action as Refresh on the web dashboard.")
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
}
