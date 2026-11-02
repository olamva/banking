import AuthenticationServices
import SwiftUI

@main
struct SpendingApp: App {
    @State private var store = Store()
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .task { await store.start() }
                .onChange(of: phase) { _, now in
                    if now == .active, store.data != nil, store.signedIn { Task { await store.reload() } }
                }
        }
    }
}

struct RootView: View {
    @Environment(Store.self) private var store
    @AppStorage("tab") private var tab = "summary"

    var body: some View {
        if store.data == nil && !store.signedIn || store.base == nil {
            WelcomeView()
        } else {
            TabView(selection: $tab) {
                Tab("Summary", systemImage: "chart.pie.fill", value: "summary") {
                    SummaryView()
                }
                Tab("Trends", systemImage: "chart.bar.xaxis", value: "trends") {
                    TrendsView()
                }
                Tab("Activity", systemImage: "list.bullet", value: "activity") {
                    ActivityView()
                }
                Tab(value: "search", role: .search) {
                    SearchView()
                }
            }
            .tabViewSearchActivation(.searchTabSelection)
            .tabBarMinimizeBehavior(.onScrollDown)
        }
    }
}

struct SignInButton: View {
    @Environment(Store.self) private var store
    @Environment(\.webAuthenticationSession) private var webAuth
    @State private var failure: String?

    var body: some View {
        Button {
            Task { await signIn() }
        } label: {
            Label(store.isLocal ? "Continue" : "Sign in with Google", systemImage: store.isLocal ? "arrow.right" : "person.badge.key.fill")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.glassProminent)
        .controlSize(.large)
        .disabled(store.base == nil)
        .alert("Sign-in failed", isPresented: .constant(failure != nil)) {
            Button("OK") { failure = nil }
        } message: {
            Text(failure ?? "")
        }
    }

    private func signIn() async {
        if store.isLocal { return await store.reload() }
        guard let url = store.signInURL else { return }
        do {
            let callback = try await webAuth.authenticate(
                using: url,
                callback: .customScheme(Store.scheme),
                preferredBrowserSession: .shared,
                additionalHeaderFields: [:]
            )
            await store.finishSignIn(callback)
        } catch ASWebAuthenticationSessionError.canceledLogin {
        } catch {
            failure = error.localizedDescription
        }
    }
}

struct WelcomeView: View {
    @Environment(Store.self) private var store

    var body: some View {
        @Bindable var store = store
        VStack(spacing: 28) {
            Spacer()
            Image(systemName: "chart.pie.fill")
                .font(.system(size: 64))
                .foregroundStyle(.tint)
                .symbolRenderingMode(.hierarchical)
            VStack(spacing: 8) {
                Text("Spending")
                    .font(.largeTitle.bold())
                Text("Your accounts and card, sorted and summed. Sign in with the Google account that you use for the dashboard.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            if Store.bundled.isEmpty {
                TextField("Server address", text: $store.server, prompt: Text(verbatim: "https://example.com"))
                    .textContentType(.URL)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(14)
                    .background(.fill.tertiary, in: .rect(cornerRadius: 14, style: .continuous))
                if !store.server.isEmpty && store.base == nil {
                    Text("Use an https address.")
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }
            Spacer()
            SignInButton()
        }
        .padding(24)
    }
}
