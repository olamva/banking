import Charts
import SwiftUI

struct SummaryView: View {
    @Environment(Store.self) private var store

    var body: some View {
        NavigationStack {
            Group {
                if let selected = store.selected {
                    let rows = store.rows
                    List {
                        SessionBanner()
                        if rows.isEmpty {
                            Section {
                                ContentUnavailableView("No transactions match the current filters.", systemImage: "line.3.horizontal.decrease.circle")
                            }
                            ExcludedNote(excluded: selected.excluded)
                        } else {
                            if let shown = store.shown {
                                Section { Tiles(period: shown) }
                                    .listRowBackground(Color.clear)
                                    .listRowInsets(EdgeInsets())
                            } else {
                                Figuring()
                            }
                            SpendingChart(rows: rows, period: store.shown ?? selected)
                            if let shown = store.shown {
                                Breakdowns(period: shown)
                                SubscriptionsSection(subscriptions: shown.subscriptions)
                                ExcludedNote(excluded: shown.excluded)
                            }
                        }
                        Section {
                            NavigationLink {
                                TrendsView()
                            } label: {
                                Label("Trends and years", systemImage: "chart.bar.xaxis")
                            }
                        } footer: {
                            Text("Every month and year on record, without filters.")
                        }
                    }
                    .contentTransition(.opacity)
                    .animation(.snappy, value: selected.key)
                    .refreshable { await store.reload() }
                    .navigationDestination(for: CategoryRoute.self) { CategoryView(route: $0) }
                    .navigationDestination(for: MerchantRoute.self) { MerchantView(name: $0.name) }
                    .navigationDestination(for: Txn.self) { TxnView(txn: $0) }
                } else {
                    Loading()
                }
            }
            .periodPicker()
            .filtering()
        }
    }
}

struct CategoryRoute: Hashable {
    let period: String
    let category: String
}

struct MerchantRoute: Hashable {
    let name: String
}

struct Figuring: View {
    @Environment(Store.self) private var store

    var body: some View {
        Section {
            if let problem = store.figureProblem {
                VStack(alignment: .leading, spacing: 10) {
                    Label("The filtered figures did not load", systemImage: "exclamationmark.triangle")
                        .font(.headline)
                    Text(problem)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Button("Try again") { store.figures() }
                        .buttonStyle(.bordered)
                }
                .padding(.vertical, 4)
            } else {
                HStack(spacing: 10) {
                    ProgressView()
                    Text(store.figuring ? "Calculating the filtered figures" : "The filtered figures need a connection.")
                        .foregroundStyle(.secondary)
                    if !store.figuring {
                        Spacer()
                        Button("Try again") { store.figures() }
                            .buttonStyle(.borderless)
                    }
                }
            }
        }
    }
}

struct ExcludedNote: View {
    let excluded: Excluded

    var body: some View {
        if excluded.count > 0 {
            Section {
                Label {
                    Text("\(excluded.count) transaction(s) totalling \(Money.kr(excluded.total)) excluded in this period (internal transfers, card bill payments).")
                } icon: {
                    Image(systemName: "info.circle")
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
        }
    }
}

struct Drill: Hashable {
    let axis: Axis
    let value: String
    let name: String
    var only = true
    var hide = true
}

private struct DrillMenu: ViewModifier {
    @Environment(Store.self) private var store
    let drills: [Drill]

    func body(content: Content) -> some View {
        content.contextMenu {
            ForEach(drills, id: \.self) { drill in
                if drill.only {
                    Button(
                        store.filters[drill.axis, false] == [drill.value] ? "Show all \(drill.axis.title.lowercased())" : "Show only \(drill.name)",
                        systemImage: "line.3.horizontal.decrease.circle"
                    ) { store.filters.only(drill.axis, drill.value) }
                }
                if drill.hide {
                    Button("Hide \(drill.name)", systemImage: "eye.slash") { store.filters.hide(drill.axis, drill.value) }
                }
            }
        }
    }
}

extension View {
    func drill(_ drills: Drill...) -> some View { modifier(DrillMenu(drills: drills)) }
}

private struct TileSpec: Identifiable {
    let title: String
    let value: Double
    let average: Double?
    let delta: Double?
    let goodIfUp: Bool

    var id: String { title }
}

private struct Tiles: View {
    let period: Period

    var body: some View {
        let tiles = specs
        let pairs = stride(from: 0, to: tiles.count, by: 2).map { Array(tiles[$0..<min($0 + 2, tiles.count)]) }
        Grid(horizontalSpacing: 12, verticalSpacing: 12) {
            ForEach(pairs.indices, id: \.self) { row in
                GridRow {
                    ForEach(pairs[row]) { tile in
                        StatTile(tile: tile, compared: period.compared)
                            .gridCellColumns(pairs[row].count == 1 ? 2 : 1)
                    }
                }
            }
        }
    }

    private var specs: [TileSpec] {
        let average = { (a: Double?, b: Double?) in a.flatMap { a in b.map { (($0 - a) * 100).rounded() / 100 } } }
        var out: [TileSpec] = []
        if period.totalOut > 0 {
            out.append(TileSpec(title: "Spent", value: period.totalOut, average: period.averageOut, delta: period.delta?.totalOut, goodIfUp: false))
        }
        if period.totalIn > 0 {
            out.append(TileSpec(title: "Income", value: period.totalIn, average: period.averageIn, delta: period.delta?.totalIn, goodIfUp: true))
        }
        if period.totalIn > 0, period.totalOut > 0 {
            out.append(TileSpec(title: "Net", value: period.net, average: average(period.averageOut, period.averageIn), delta: period.delta?.net, goodIfUp: true))
        }
        return out
    }
}

private struct StatTile: View {
    let tile: TileSpec
    let compared: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(tile.title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(Money.kr(tile.value))
                .font(.title3.weight(.semibold))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .contentTransition(.numericText(value: tile.value))
            if let average = tile.average {
                Text("\(Money.kr(average)) / month")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .lineLimit(1)
            }
            if let delta = tile.delta, let compared {
                let previous = tile.value - delta
                let percent = previous > 0 && tile.value >= 0 ? delta / previous : nil
                let tone: Color = abs(delta) < 0.5 ? .secondary : (tile.goodIfUp == (delta > 0) ? .green : .red)
                Label {
                    Text(Money.kr(delta, signed: true) + (percent.map { " (\($0.formatted(.percent.precision(.fractionLength(0)).sign(strategy: .always(includingZero: false)))))" } ?? ""))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                } icon: {
                    Image(systemName: delta > 0 ? "arrow.up.right" : delta < 0 ? "arrow.down.right" : "equal")
                }
                .font(.caption.weight(.medium))
                .monospacedDigit()
                .foregroundStyle(tone)
                Text("vs \(compared)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .padding(12)
        .background(.fill.quaternary, in: .rect(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

private struct Breakdowns: View {
    @Environment(Store.self) private var store
    let period: Period

    var body: some View {
        let single = store.filters.categories.count == 1
        if !single, !period.categories.isEmpty {
            Section {
                Donut(period: period)
                CategoryRows(period: period, shares: period.categories, subs: period.subcategories, income: false)
            } header: {
                Text("Spending by category")
            } footer: {
                Text("Tap a category to open it. Touch and hold a row to show only it or to hide it.")
            }
        }
        if !single { ChangesSection(period: period) }
        MerchantsSection(title: "Spending by merchant", income: false, merchants: period.merchants)
        AccountsSection(title: "Spending by account", accounts: period.accounts)
        if !single, !period.incomeCategories.isEmpty {
            Section("Income by category") {
                CategoryRows(period: period, shares: period.incomeCategories, subs: period.incomeSubcategories ?? [], income: true)
            }
        }
        MerchantsSection(title: "Income by merchant", income: true, merchants: period.incomeMerchants)
        AccountsSection(title: "Income by account", accounts: period.incomeAccounts ?? [])
    }
}

private struct Donut: View {
    @Environment(Store.self) private var store
    let period: Period
    @State private var picked: Double?

    var body: some View {
        Chart(period.categories, id: \.category) { share in
            SectorMark(angle: .value("Spent", share.total), innerRadius: .ratio(0.64), angularInset: 1.5)
                .cornerRadius(4)
                .foregroundStyle(CategoryStyle.of(share.category).color)
                .opacity(selected == nil || selected == share.category ? 1 : 0.35)
        }
        .chartAngleSelection(value: $picked)
        .chartBackground { _ in
            VStack(spacing: 2) {
                let share = period.categories.first { $0.category == selected }
                Text(share.map { store.data?.label($0.category) ?? $0.category } ?? "Total")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(Money.kr(share?.total ?? period.totalOut))
                    .font(.title3.bold())
                    .monospacedDigit()
                if let share {
                    Text(Percent.of(share.share))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(height: 220)
        .padding(.vertical, 8)
    }

    private var selected: String? {
        guard let picked else { return nil }
        var running = 0.0
        return period.categories.first { share in
            running += share.total
            return picked <= running
        }?.category
    }
}

private struct CategoryRows: View {
    @Environment(Store.self) private var store
    let period: Period
    let shares: [Share]
    let subs: [SubShare]
    let income: Bool
    @State private var open: Set<String> = []

    var body: some View {
        ForEach(shares, id: \.category) { share in
            let parts = subs.filter { $0.category == share.category }
            if parts.count > 1 {
                DisclosureGroup(isExpanded: Binding { open.contains(share.category) } set: { if $0 { open.insert(share.category) } else { open.remove(share.category) } }) {
                    ForEach(parts, id: \.self) { sub in
                        let name = store.data?.label(sub.category, sub.subcategory) ?? sub.subcategory ?? sub.category
                        LabeledContent(name) {
                            Text(Money.kr(sub.total)).monospacedDigit()
                        }
                        .drill(Drill(axis: .categories, value: "\(sub.category)/\(sub.subcategory ?? "")", name: name))
                    }
                } label: {
                    row(share)
                }
            } else {
                row(share)
            }
        }
    }

    @ViewBuilder private func row(_ share: Share) -> some View {
        let name = store.data?.label(share.category) ?? share.category
        let content = ShareRow(category: share.category, title: name, total: share.total, share: share.share)
        Group {
            if income {
                content
            } else {
                NavigationLink(value: CategoryRoute(period: period.key, category: share.category)) { content }
            }
        }
        .drill(Drill(axis: .categories, value: share.category, name: name))
    }
}

private struct ChangesSection: View {
    @Environment(Store.self) private var store
    let period: Period

    var body: some View {
        if let compared = period.compared, !period.changes.isEmpty {
            Section("Biggest changes vs \(compared)") {
                ForEach(period.changes, id: \.category) { change in
                    let name = store.data?.label(change.category) ?? change.category
                    NavigationLink(value: CategoryRoute(period: period.key, category: change.category)) {
                        HStack(spacing: 12) {
                            CategoryIcon(category: change.category)
                            ValueRow(
                                title: name,
                                detail: "\(Money.kr(change.current)) now, \(Money.kr(change.previous)) before",
                                value: Money.kr(change.delta, signed: true),
                                tint: change.delta <= 0 ? .green : .red
                            )
                        }
                    }
                    .drill(Drill(axis: .categories, value: change.category, name: name))
                }
            }
        }
    }
}

private struct MerchantsSection: View {
    let title: String
    let income: Bool
    let merchants: [Merchant]

    var body: some View {
        if !merchants.isEmpty {
            Section {
                ForEach(merchants.prefix(10), id: \.counterparty) { MerchantRow(merchant: $0, income: income) }
                if merchants.count > 10 {
                    NavigationLink("Show all \(merchants.count)") { MerchantList(title: title, income: income) }
                }
            } header: {
                Text(title)
            } footer: {
                Text("Touch and hold a merchant to show only it or to hide it.")
            }
        }
    }
}

private struct MerchantList: View {
    @Environment(Store.self) private var store
    let title: String
    let income: Bool

    var body: some View {
        let merchants = (income ? store.shown?.incomeMerchants : store.shown?.merchants) ?? []
        List(merchants, id: \.counterparty) { MerchantRow(merchant: $0, income: income) }
            .overlay {
                if merchants.isEmpty { ContentUnavailableView("No merchants", systemImage: "storefront") }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
    }
}

private struct MerchantRow: View {
    let merchant: Merchant
    let income: Bool

    var body: some View {
        NavigationLink(value: MerchantRoute(name: merchant.counterparty)) {
            ValueRow(
                title: merchant.counterparty,
                detail: merchant.count == 1 ? "1 payment" : "\(merchant.count) payments",
                value: Money.kr(merchant.total),
                tint: income ? .green : .secondary
            )
        }
        .drill(Drill(axis: .merchants, value: merchant.counterparty, name: merchant.counterparty))
    }
}

private struct AccountsSection: View {
    @Environment(Store.self) private var store
    let title: String
    let accounts: [AccountTotal]

    var body: some View {
        if accounts.count > 1 {
            Section {
                ForEach(accounts, id: \.account) { account in
                    Button {
                        store.filters.only(.accounts, account.account)
                    } label: {
                        HStack(spacing: 8) {
                            ValueRow(title: account.account, detail: Percent.of(account.share), value: Money.kr(account.total))
                            Image(systemName: "checkmark")
                                .foregroundStyle(Color.accentColor)
                                .opacity(store.filters.accounts == [account.account] ? 1 : 0)
                                .accessibilityHidden(true)
                        }
                    }
                    .tint(.primary)
                    .accessibilityAddTraits(store.filters.accounts == [account.account] ? .isSelected : [])
                    .drill(Drill(axis: .accounts, value: account.account, name: account.account, only: false))
                }
            } header: {
                Text(title)
            } footer: {
                Text("Tap an account to show only its transactions.")
            }
        }
    }
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
