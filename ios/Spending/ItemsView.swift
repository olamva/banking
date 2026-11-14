import SwiftUI

struct ItemRoute: Hashable {
    let key: String
    let bySize: Bool
}

private enum ItemSort: String, CaseIterable, Identifiable {
    case count, qty, spent, price, medianDays, last, name

    var id: Self { self }

    var label: String {
        switch self {
        case .count: "Purchases"
        case .qty: "Quantity"
        case .spent: "Spent"
        case .price: "Average price"
        case .medianDays: "Usual gap"
        case .last: "Last bought"
        case .name: "Item name"
        }
    }

    func compare(_ a: Item, _ b: Item) -> Double {
        switch self {
        case .count: Double(a.count - b.count)
        case .qty: a.qty - b.qty
        case .spent: a.spent - b.spent
        case .price: a.price - b.price
        case .medianDays: (a.medianDays ?? -1) - (b.medianDays ?? -1)
        case .last: Double(a.last.compare(b.last).rawValue)
        case .name: Double(a.name.localizedCompare(b.name).rawValue)
        }
    }
}

private enum ItemText {
    static func quantity(_ item: Item) -> String { quantity(item.qty, item.unit) }
    static func quantity(_ qty: Double, _ unit: String?) -> String { "\(Money.quantity(qty))\(unit == nil ? "" : " kg")" }
    static func gap(_ days: Double?) -> String? { days.map { "\(Int($0.rounded())) days" } }
    static func purchases(_ count: Int) -> String { "\(count) \(count == 1 ? "purchase" : "purchases")" }
    static func sizes(_ item: Item) -> String? { item.sizes.count > 1 ? "\(item.sizes.count) sizes" : item.sizes.first }
}

private extension Store {
    func items(bySize: Bool) -> [Item] {
        var shown = filters
        shown.search = ""
        shown.items = []
        shown.itemsOut = []
        return Item.of(Bought.of(periodRows.filter { shown.matches($0) }), bySize: bySize)
    }
}

struct ItemsView: View {
    @Environment(Store.self) private var store
    @State private var query = ""
    @State private var bySize = false
    @State private var sort = ItemSort.count
    @State private var descending = true

    var body: some View {
        NavigationStack {
            Group {
                if store.data != nil {
                    content
                } else {
                    Loading()
                }
            }
            .periodPicker()
            .filtering()
        }
    }

    private var content: some View {
        let items = store.items(bySize: bySize)
        let words = query.lowercased().replacing(#/(\d),(\d)/#) { "\($0.1).\($0.2)" }.split(whereSeparator: \.isWhitespace)
        let picks = store.filters.items.map(Filters.nameKey)
        let drops = store.filters.itemsOut.map(Filters.nameKey)
        let shown = items.filter { item in
            let first = item.bought.first?.purchase.key ?? ""
            return words.allSatisfy { item.key.contains($0) } && (picks.isEmpty || picks.contains(first)) && !drops.contains(first)
        }
        let sorted = shown.sorted { a, b in
            let order = sort.compare(a, b)
            let directed = descending ? -order : order
            return directed != 0 ? directed < 0 : a.count > b.count
        }
        return List {
            SessionBanner()
            Section {
                Toggle("Split by size", isOn: $bySize)
                Picker("Sort by", selection: Binding(get: { sort }, set: { descending = $0 != .name; sort = $0 })) {
                    ForEach(ItemSort.allCases) { Text($0.label).tag($0) }
                }
                Picker("Order", selection: $descending) {
                    Text("Highest first").tag(true)
                    Text("Lowest first").tag(false)
                }
            }
            Section {
                Grid(horizontalSpacing: 12, verticalSpacing: 12) {
                    GridRow {
                        Tile(title: "Items", value: shown.count.formatted())
                        Tile(title: "Purchases", value: shown.reduce(0) { $0 + $1.count }.formatted())
                    }
                    GridRow {
                        Tile(title: "Shopping trips", value: Set(shown.flatMap { $0.bought.map(\.txn.id) }).count.formatted())
                        Tile(title: "Spent", value: Money.kr(shown.reduce(0) { $0 + $1.spent }))
                    }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
            Section {
                if items.isEmpty {
                    empty("No receipts with item lines match the current filters.")
                } else if shown.isEmpty {
                    empty(query.isEmpty ? "No items match the item filter." : "No items match “\(query)”.")
                } else {
                    ForEach(sorted) { item in
                        NavigationLink(value: ItemRoute(key: item.key, bySize: bySize)) { ItemRow(item: item) }
                            .contextMenu { actions(item) }
                            .swipeActions(edge: .leading) {
                                Button("Show only this item", systemImage: "line.3.horizontal.decrease") { store.filters.only(.items, item.name) }
                                    .tint(.blue)
                            }
                            .swipeActions(edge: .trailing) {
                                Button("Hide this item", systemImage: "eye.slash") { store.filters.hide(.items, item.name) }
                                    .tint(.orange)
                            }
                    }
                }
            } header: {
                Text("Bought items")
            } footer: {
                Text("Items come from store receipts with item lines. Email receipts have no item lines. Tap an item to see each purchase and its receipt, or to rename it.")
            }
        }
        .searchable(text: $query, prompt: "Search items")
        .refreshable { await store.reload() }
        .navigationDestination(for: ItemRoute.self) { ItemView(route: $0) }
        .navigationDestination(for: Txn.self) { TxnView(txn: $0) }
        .navigationDestination(for: MerchantRoute.self) { MerchantView(name: $0.name) }
    }

    @ViewBuilder private func actions(_ item: Item) -> some View {
        Button("Show only this item", systemImage: "line.3.horizontal.decrease") { store.filters.only(.items, item.name) }
        Button("Hide this item", systemImage: "eye.slash") { store.filters.hide(.items, item.name) }
    }

    private func empty(_ text: String) -> some View {
        ContentUnavailableView {
            Label("No items", systemImage: "basket")
        } description: {
            Text(text)
        }
    }
}

private struct ItemRow: View {
    let item: Item

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name).lineLimit(1)
                Text([ItemText.sizes(item), ItemText.purchases(item.count), ItemText.quantity(item)].compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Text([
                    "\(Money.kr(item.price, exact: true)) each",
                    ItemText.gap(item.medianDays).map { "every \($0)" },
                    "last \(Day.date(item.last).dayMonth)",
                ].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .monospacedDigit()
            Spacer(minLength: 8)
            Text(Money.kr(item.spent))
                .monospacedDigit()
                .layoutPriority(1)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct Tile: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title3.weight(.semibold))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .padding(12)
        .background(.fill.quaternary, in: .rect(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

private struct ItemView: View {
    @Environment(Store.self) private var store
    @State private var key: String
    @State private var name = ""
    @State private var shown: String?
    @State private var saving = false
    @State private var failure: String?
    let bySize: Bool

    init(route: ItemRoute) {
        _key = State(initialValue: route.key)
        bySize = route.bySize
    }

    var body: some View {
        let items = store.items(bySize: bySize)
        if let item = items.first(where: { $0.key == key }) {
            detail(item, names: items.map(\.name))
        } else {
            ContentUnavailableView("No purchases", systemImage: "basket", description: Text("This item has no purchases in the current period and filters."))
        }
    }

    private func detail(_ item: Item, names: [String]) -> some View {
        let next = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let suggestions = next.isEmpty || next == item.name ? [] : Array(Set(names)).filter { $0 != next && $0.localizedCaseInsensitiveContains(next) }.sorted().prefix(5)
        return List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.name).font(.title3.weight(.semibold))
                    Text(item.sizes.isEmpty ? "No size on the receipt" : item.sizes.joined(separator: " · "))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                LabeledContent("Purchases", value: item.count.formatted())
                LabeledContent("Quantity", value: ItemText.quantity(item))
                LabeledContent("Spent", value: Money.kr(item.spent, exact: true))
                LabeledContent("Average price", value: Money.kr(item.price, exact: true))
                LabeledContent("Usual gap", value: ItemText.gap(item.medianDays) ?? "–")
                LabeledContent("Last bought", value: Day.date(item.last).shortDay)
            }
            .monospacedDigit()
            Section {
                HStack {
                    TextField("Name", text: $name)
                        .textInputAutocapitalization(.sentences)
                        .submitLabel(.done)
                        .onSubmit { rename(item, to: next) }
                    if saving {
                        ProgressView()
                    } else {
                        Button("Rename") { rename(item, to: next) }
                            .disabled(next.isEmpty || next == item.name)
                    }
                }
                ForEach(suggestions, id: \.self) { suggestion in
                    Button(suggestion, systemImage: "text.badge.checkmark") { name = suggestion }
                }
            } header: {
                Text("Name")
            } footer: {
                Text(failure ?? "Give two items the same name to show them as one item.")
                    .foregroundStyle(failure == nil ? Color.secondary : Color.red)
            }
            Section("Purchases") {
                ForEach(item.bought) { bought in
                    Button {
                        withAnimation { shown = shown == bought.id ? nil : bought.id }
                    } label: {
                        PurchaseRow(bought: bought, open: shown == bought.id)
                    }
                    .tint(.primary)
                    if shown == bought.id {
                        if let receipt = bought.txn.receipt { Slip(receipt: receipt, marked: bought.purchase.raw) }
                        NavigationLink(value: bought.txn) {
                            Label("Show the transaction", systemImage: "list.bullet.rectangle")
                        }
                    }
                }
            }
        }
        .navigationTitle(item.name)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { if name.isEmpty { name = item.name } }
    }

    private func rename(_ item: Item, to next: String) {
        guard !next.isEmpty, next != item.name, !saving else { return }
        let special = Set(#".*+?^${}()|[]\"#)
        var keys: [String] = []
        for raw in item.bought.map(\.purchase.raw) {
            let escaped = raw.lowercased().map { special.contains($0) ? "\\\($0)" : String($0) }.joined()
            let pattern = "/^\(escaped)$/"
            if !keys.contains(pattern) { keys.append(pattern) }
        }
        Task {
            saving = true
            failure = await store.bulk("items", keys: keys, value: next)
            saving = false
            if failure == nil {
                key = key.replacing(#/^[^\n]*/#) { _ in Filters.nameKey(next) }
            }
        }
    }
}

private struct PurchaseRow: View {
    let bought: Bought
    let open: Bool

    var body: some View {
        let purchase = bought.purchase
        let each = purchase.qty > 0 ? purchase.amount / purchase.qty : 0
        let price = purchase.unit == nil ? Money.kr(each, exact: true) : "\(Money.kr(each, exact: true))/kg"
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(Day.date(bought.date).shortDay) · \(bought.store)").lineLimit(1)
                Text([purchase.size.flatMap { $0.isEmpty ? nil : $0 }, "\(ItemText.quantity(purchase.qty, purchase.unit)) × \(price)"].compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(Money.kr(purchase.amount, exact: true)).layoutPriority(1)
            Image(systemName: "chevron.down")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .rotationEffect(.degrees(open ? 180 : 0))
        }
        .monospacedDigit()
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityHint(open ? "Hides the receipt" : "Shows the receipt")
    }
}
