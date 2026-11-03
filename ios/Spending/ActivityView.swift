import SwiftUI

struct ActivityView: View {
    @Environment(Store.self) private var store
    @State private var showExcluded = false
    @State private var incomeOnly = false
    @State private var account: String?
    @State private var category: String?

    var body: some View {
        NavigationStack {
            Group {
                if let data = store.data, let month = store.selected {
                    let rows = data.txns.filter {
                        $0.month == month.month && (showExcluded || $0.excluded == nil) && (!incomeOnly || $0.amount > 0)
                            && (account == nil || $0.account == account) && (category == nil || $0.category == category)
                    }
                    let days = Dictionary(grouping: rows, by: \.date).sorted { $0.key > $1.key }
                    List {
                        SessionBanner()
                        ForEach(days, id: \.key) { day, txns in
                            Section(Day.date(day).dayTitle) {
                                ForEach(txns) { txn in
                                    NavigationLink(value: txn) { TxnRow(txn: txn) }
                                }
                            }
                        }
                    }
                    .overlay {
                        if rows.isEmpty { ContentUnavailableView("No transactions", systemImage: "tray") }
                    }
                    .refreshable { await store.reload() }
                    .navigationDestination(for: Txn.self) { TxnView(txn: $0) }
                    .navigationDestination(for: MerchantRoute.self) { MerchantView(name: $0.name) }
                } else {
                    Loading()
                }
            }
            .monthPicker()
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu("Filter", systemImage: filtered ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle") {
                        Toggle("Income only", systemImage: "arrow.down.circle", isOn: $incomeOnly)
                        Toggle("Show transfers", systemImage: "arrow.left.arrow.right", isOn: $showExcluded)
                        Picker(selection: $account) {
                            Text("All accounts").tag(String?.none)
                            ForEach(accounts, id: \.self) { Text($0).tag(String?.some($0)) }
                        } label: {
                            Label(account ?? "Account", systemImage: "creditcard")
                        }
                        .pickerStyle(.menu)
                        Picker(selection: $category) {
                            Text("All categories").tag(String?.none)
                            ForEach(categories, id: \.self) { Text(store.data?.label($0) ?? $0).tag(String?.some($0)) }
                        } label: {
                            Label(category.map { store.data?.label($0) ?? $0 } ?? "Category", systemImage: "square.grid.2x2")
                        }
                        .pickerStyle(.menu)
                        if filtered {
                            Button("Reset filters", systemImage: "xmark.circle", role: .destructive) {
                                showExcluded = false
                                incomeOnly = false
                                account = nil
                                category = nil
                            }
                        }
                    }
                }
            }
        }
    }

    private var filtered: Bool { showExcluded || incomeOnly || account != nil || category != nil }
    private var accounts: [String] { Set(store.data?.txns.map(\.account) ?? []).sorted() }
    private var categories: [String] {
        let month = store.selected?.month
        return Set(store.data?.txns.filter { $0.month == month }.map(\.category) ?? []).sorted { (store.data?.label($0) ?? $0) < (store.data?.label($1) ?? $1) }
    }
}

struct SearchView: View {
    @Environment(Store.self) private var store
    @State private var query = ""

    var body: some View {
        NavigationStack {
            let found = results
            List {
                if query.isEmpty, let data = store.data {
                    Section("Top merchants this month") {
                        ForEach(store.selected?.merchants.prefix(6) ?? [], id: \.counterparty) { merchant in
                            Button(merchant.counterparty) { query = merchant.counterparty }
                                .tint(.primary)
                        }
                    }
                    Section("Categories") {
                        ForEach(store.selected?.categories ?? [], id: \.category) { share in
                            Button {
                                query = data.label(share.category)
                            } label: {
                                Label { Text(data.label(share.category)) } icon: { CategoryIcon(category: share.category, size: 26) }
                            }
                            .tint(.primary)
                        }
                    }
                } else {
                    ForEach(Dictionary(grouping: found, by: \.month).sorted { $0.key > $1.key }, id: \.key) { month, txns in
                        Section(Day.month(month).monthTitle) {
                            ForEach(txns) { txn in
                                NavigationLink(value: txn) { TxnRow(txn: txn, showDate: true) }
                            }
                        }
                    }
                }
            }
            .overlay {
                if !query.isEmpty && found.isEmpty { ContentUnavailableView.search(text: query) }
            }
            .navigationTitle("Search")
            .searchable(text: $query, prompt: "Merchants, categories, bank text")
            .navigationDestination(for: Txn.self) { TxnView(txn: $0) }
            .navigationDestination(for: MerchantRoute.self) { MerchantView(name: $0.name) }
        }
    }

    private var results: [Txn] {
        let words = query.lowercased().split(separator: " ")
        guard !words.isEmpty, let data = store.data else { return [] }
        return Array(data.txns.lazy.filter { txn in words.allSatisfy { txn.search.contains($0) } }.prefix(300))
    }
}
