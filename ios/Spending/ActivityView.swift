import SwiftUI

struct ActivityView: View {
    @Environment(Store.self) private var store
    @State private var showExcluded = false
    @State private var incomeOnly = false

    var body: some View {
        NavigationStack {
            Group {
                if let data = store.data, let month = store.selected {
                    let rows = data.txns.filter {
                        $0.month == month.month && (showExcluded || $0.excluded == nil) && (!incomeOnly || $0.amount > 0)
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
                    Menu("Filter", systemImage: showExcluded || incomeOnly ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle") {
                        Toggle("Income only", systemImage: "arrow.down.circle", isOn: $incomeOnly)
                        Toggle("Show transfers", systemImage: "arrow.left.arrow.right", isOn: $showExcluded)
                    }
                }
            }
        }
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
