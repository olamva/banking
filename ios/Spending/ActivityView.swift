import SwiftUI

enum TxnSort: String, CaseIterable {
    case date = "Date", merchant = "Merchant", category = "Category", account = "Account", amount = "Amount"

    var descendingFirst: Bool { self == .date || self == .amount }
}

enum Sign: String, CaseIterable {
    case all = "All", spending = "Spending", income = "Income"
}

struct ActivityView: View {
    @Environment(Store.self) private var store
    @State private var sort = TxnSort.date
    @State private var descending = true
    @State private var sign = Sign.all
    @State private var selection: Set<Int> = []
    @State private var selecting = false
    @State private var bulk: BulkFile?

    var body: some View {
        @Bindable var store = store
        NavigationStack {
            Group {
                if let data = store.data, store.selected != nil {
                    let rows = sorted(store.rows.filter(signed), data)
                    List(selection: $selection) {
                        SessionBanner()
                        Section {
                            Figures(rows: rows)
                            HStack(spacing: 8) {
                                Menu {
                                    Picker("Sort by", selection: Binding(get: { sort }, set: { choose($0) })) {
                                        ForEach(TxnSort.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                                    }
                                    Picker("Order", selection: $descending) {
                                        Label("Descending", systemImage: "arrow.down").tag(true)
                                        Label("Ascending", systemImage: "arrow.up").tag(false)
                                    }
                                } label: {
                                    Label("\(sort.rawValue) \(descending ? "↓" : "↑")", systemImage: "arrow.up.arrow.down")
                                }
                                Menu {
                                    Picker("Show", selection: $sign) {
                                        ForEach(Sign.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                                    }
                                } label: {
                                    Label(sign.rawValue, systemImage: "plusminus")
                                }
                                Spacer(minLength: 0)
                                Button(selecting ? "Done" : "Select") {
                                    selecting.toggle()
                                    if !selecting { selection = [] }
                                }
                            }
                            .buttonStyle(.bordered)
                            .font(.subheadline)
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 4, trailing: 0))
                        }
                        if sort == .date {
                            ForEach(Dictionary(grouping: rows, by: \.date).sorted { descending ? $0.key > $1.key : $0.key < $1.key }, id: \.key) { day, txns in
                                Section(Day.date(day).dayTitle + " " + day.prefix(4)) {
                                    ForEach(txns) { link($0, showDate: false) }
                                }
                            }
                        } else {
                            Section("\(rows.count) rows") {
                                ForEach(rows) { link($0, showDate: true) }
                            }
                        }
                    }
                    .environment(\.editMode, .constant(selecting ? .active : .inactive))
                    .overlay {
                        if rows.isEmpty { ContentUnavailableView("No transactions", systemImage: "tray", description: Text("No transactions match the current filters.")) }
                    }
                    .refreshable { await store.reload() }
                    .navigationDestination(for: Txn.self) { TxnView(txn: $0) }
                    .navigationDestination(for: MerchantRoute.self) { MerchantView(name: $0.name) }
                    .searchable(text: $store.filters.search, prompt: "Search merchant or description")
                    .toolbar {
                        if selecting {
                            ToolbarItemGroup(placement: .bottomBar) {
                                Button(selection.isEmpty ? "All \(rows.count)" : "\(selection.count) selected") { selection = [] }
                                    .disabled(selection.isEmpty)
                                Spacer()
                                Button("Rename payees", systemImage: "character.cursor.ibeam") { bulk = .payees }
                                Button("Change category", systemImage: "tag") { bulk = .categories }
                            }
                        }
                    }
                    .toolbar(selecting ? .hidden : .visible, for: .tabBar)
                    .sheet(item: $bulk) { file in
                        BulkSheet(file: file, txns: selection.isEmpty ? rows : rows.filter { selection.contains($0.id) })
                    }
                    .onChange(of: rows.map(\.id)) { _, ids in selection.formIntersection(ids) }
                } else {
                    Loading()
                }
            }
            .periodPicker()
            .filtering()
        }
    }

    private func link(_ txn: Txn, showDate: Bool) -> some View {
        NavigationLink(value: txn) { TxnRow(txn: txn, showDate: showDate) }
            .tag(txn.id)
            .contextMenu { TxnFilterActions(txn: txn) }
    }

    private func signed(_ txn: Txn) -> Bool {
        switch sign {
        case .all: true
        case .spending: txn.amount < 0
        case .income: txn.amount > 0
        }
    }

    private func choose(_ option: TxnSort) {
        if option == sort { descending.toggle() } else {
            sort = option
            descending = option.descendingFirst
        }
    }

    private func sorted(_ rows: [Txn], _ data: AppData) -> [Txn] {
        let key: (Txn, Txn) -> ComparisonResult = switch sort {
        case .date: { $0.date.compare($1.date) }
        case .merchant: { $0.merchant.localizedCompare($1.merchant) }
        case .category: { data.label($0.category, $0.subcategory).localizedCompare(data.label($1.category, $1.subcategory)) }
        case .account: { $0.account.localizedCompare($1.account) }
        case .amount: { $0.amount == $1.amount ? .orderedSame : $0.amount < $1.amount ? .orderedAscending : .orderedDescending }
        }
        return rows.enumerated().sorted { a, b in
            let order = key(a.element, b.element)
            return order == .orderedSame ? a.offset < b.offset : (order == .orderedDescending) == descending
        }.map(\.element)
    }
}

extension BulkFile: Identifiable {
    public var id: String { rawValue }
}

struct TxnFilterActions: View {
    @Environment(Store.self) private var store
    let txn: Txn

    var body: some View {
        Section(txn.merchant) { FilterActions(axis: .merchants, value: txn.merchant) }
        Section(store.data?.label(txn.category) ?? txn.category) { FilterActions(axis: .categories, value: txn.category) }
        Section(txn.account) { FilterActions(axis: .accounts, value: txn.account) }
    }
}

private struct Figures: View {
    @Environment(Store.self) private var store
    let rows: [Txn]

    var body: some View {
        let counted = rows.filter { $0.excluded == nil }
        let spent = counted.filter { $0.amount < 0 }.reduce(0) { $0 + (-$1.amount * 100).rounded() } / 100
        let income = counted.filter { $0.amount > 0 }.reduce(0) { $0 + ($1.amount * 100).rounded() } / 100
        let excluded = store.periodRows.filter { $0.excluded != nil && filtersIgnoringExcluded.matches($0) }
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Tile(title: "Spent", value: Money.kr(spent), tint: .primary)
                Tile(title: "Income", value: Money.kr(income), tint: .green)
                Tile(title: "Net", value: Money.kr(income - spent, signed: true), tint: income >= spent ? .green : .red)
            }
            Group {
                Text(rows.count == 1 ? "1 row" : "\(rows.count) rows")
                if !excluded.isEmpty {
                    Text("\(excluded.count) \(excluded.count == 1 ? "transaction" : "transactions") totalling \(Money.kr(excluded.reduce(0) { $0 + abs($1.amount) })) excluded in view (internal transfers, card bill payments).")
                }
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 4)
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
    }

    private var filtersIgnoringExcluded: Filters {
        var f = store.filters
        f.showExcluded = true
        return f
    }
}

private struct Tile: View {
    let title: String
    let value: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(.fill.quaternary, in: .rect(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
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
                    Section("Top merchants in \(store.selected?.title ?? "this period")") {
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
                                    .contextMenu { TxnFilterActions(txn: txn) }
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
