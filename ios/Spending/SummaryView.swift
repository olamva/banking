import Charts
import SwiftUI

struct SummaryView: View {
    @Environment(Store.self) private var store
    @State private var settings = false

    var body: some View {
        NavigationStack {
            Group {
                if let period = store.selected {
                    List {
                        SessionBanner()
                        Section { Hero(period: period, compare: period.lastYear.flatMap(store.lookup)) }
                        CategoriesSection(period: period)
                        ChangesSection(period: period)
                        MerchantsSection(period: period)
                        AccountsSection(period: period)
                        IncomeSection(period: period)
                        SubscriptionsSection(period: period)
                    }
                    .contentTransition(.opacity)
                    .animation(.snappy, value: period.key)
                    .refreshable { await store.reload() }
                    .navigationDestination(for: CategoryRoute.self) { CategoryView(route: $0) }
                    .navigationDestination(for: MerchantRoute.self) { MerchantView(name: $0.name) }
                    .navigationDestination(for: Txn.self) { TxnView(txn: $0) }
                } else {
                    Loading()
                }
            }
            .periodPicker()
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Settings", systemImage: "gearshape") { settings = true }
                }
            }
            .sheet(isPresented: $settings) { SettingsView() }
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

private struct Hero: View {
    let period: Period
    let compare: Period?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Spent")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(Money.kr(period.totalOut))
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .contentTransition(.numericText(value: period.totalOut))
                if let average = period.averageOut {
                    Text("\(Money.kr(average)) a month on average")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                if let delta = period.delta, let compared = period.compared {
                    DeltaLabel(delta: delta.totalOut, compared: compared)
                }
            }
            SeriesChart(period: period, compare: compare)
                .frame(height: 170)
            HStack(spacing: 12) {
                Figure(title: "Income", value: period.totalIn, tint: .green)
                Figure(title: "Net", value: period.net, tint: period.net >= 0 ? .green : .red)
            }
        }
        .padding(.vertical, 6)
    }
}

private struct Figure: View {
    let title: String
    let value: Double
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(Money.kr(value, signed: title == "Net"))
                .font(.title3.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(tint)
                .contentTransition(.numericText(value: value))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.fill.quaternary, in: .rect(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

private struct SeriesChart: View {
    let period: Period
    let compare: Period?
    @State private var picked: Date?

    var body: some View {
        let series = period.series
        let running = series.bucket == "day"
        let index = picked.map(series.index)
        Chart {
            if let compare, running {
                ForEach(Array(compare.series.spent.enumerated()), id: \.offset) { offset, value in
                    LineMark(x: .value("Date", series.date(offset)), y: .value("Spent", value), series: .value("Series", "Last year"))
                        .foregroundStyle(Color.gray.opacity(0.6))
                        .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [3, 3]))
                }
            }
            ForEach(Array(series.spent.enumerated()), id: \.offset) { offset, value in
                if running {
                    AreaMark(x: .value("Date", series.date(offset)), y: .value("Spent", value))
                        .foregroundStyle(.linearGradient(colors: [.accentColor.opacity(0.3), .accentColor.opacity(0)], startPoint: .top, endPoint: .bottom))
                        .interpolationMethod(.monotone)
                    LineMark(x: .value("Date", series.date(offset)), y: .value("Spent", value), series: .value("Series", "This period"))
                        .foregroundStyle(Color.accentColor)
                        .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round))
                        .interpolationMethod(.monotone)
                } else {
                    BarMark(x: .value("Date", series.date(offset), unit: .month), y: .value("Spent", value))
                        .foregroundStyle(Color.accentColor.opacity(index == nil || index == offset ? 1 : 0.4))
                }
            }
            if let index, let value = series.spent[safe: index] {
                RuleMark(x: .value("Date", series.date(index)))
                    .foregroundStyle(running ? Color.secondary.opacity(0.4) : .clear)
                    .annotation(position: .top, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                        VStack(spacing: 2) {
                            Text(running ? series.date(index).shortDay : series.date(index).monthTitle).font(.caption2).foregroundStyle(.secondary)
                            Text(Money.kr(value)).font(.caption.weight(.semibold)).monospacedDigit()
                            if running, let before = compare?.series.spent[safe: index] {
                                Text("Last year \(Money.kr(before))").font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                        .padding(6)
                        .background(.regularMaterial, in: .rect(cornerRadius: 8))
                    }
            }
        }
        .chartXSelection(value: $picked)
        .chartYAxis {
            AxisMarks(position: .trailing) { value in
                AxisGridLine()
                AxisValueLabel { Text(Money.short(value.as(Double.self) ?? 0)).fixedSize() }
            }
        }
        .accessibilityLabel(running ? "Running total of spending" : "Spending by month")
    }
}

private struct CategoriesSection: View {
    @Environment(Store.self) private var store
    let period: Period
    @State private var picked: Double?

    var body: some View {
        if !period.categories.isEmpty {
            Section("Categories") {
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

                ForEach(period.categories, id: \.category) { share in
                    NavigationLink(value: CategoryRoute(period: period.key, category: share.category)) {
                        ShareRow(category: share.category, title: store.data?.label(share.category) ?? share.category, total: share.total, share: share.share)
                    }
                }
            }
        }
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

private struct MerchantsSection: View {
    let period: Period

    var body: some View {
        if !period.merchants.isEmpty {
            Section("Top merchants") {
                ForEach(period.merchants.prefix(8), id: \.counterparty) { merchant in
                    NavigationLink(value: MerchantRoute(name: merchant.counterparty)) {
                        ValueRow(
                            title: merchant.counterparty,
                            detail: merchant.count == 1 ? "1 payment" : "\(merchant.count) payments",
                            value: Money.kr(merchant.total)
                        )
                    }
                }
            }
        }
    }
}

private struct ChangesSection: View {
    @Environment(Store.self) private var store
    let period: Period

    var body: some View {
        if let compared = period.compared, !period.changes.isEmpty {
            Section("Biggest changes vs \(compared)") {
                ForEach(period.changes, id: \.category) { change in
                    NavigationLink(value: CategoryRoute(period: period.key, category: change.category)) {
                        HStack(spacing: 12) {
                            CategoryIcon(category: change.category)
                            ValueRow(
                                title: store.data?.label(change.category) ?? change.category,
                                detail: "\(Money.kr(change.current)) now, \(Money.kr(change.previous)) before",
                                value: Money.kr(change.delta, signed: true),
                                tint: change.delta <= 0 ? .green : .red
                            )
                        }
                    }
                }
            }
        }
    }
}

private struct AccountsSection: View {
    let period: Period

    var body: some View {
        if period.accounts.count > 1 {
            Section("Spending by account") {
                ForEach(period.accounts, id: \.account) { account in
                    ValueRow(title: account.account, detail: Percent.of(account.share), value: Money.kr(account.total))
                }
            }
        }
    }
}

private struct IncomeSection: View {
    @Environment(Store.self) private var store
    let period: Period

    var body: some View {
        if !period.incomeCategories.isEmpty {
            Section("Income") {
                ForEach(period.incomeCategories, id: \.category) { share in
                    ShareRow(category: share.category, title: store.data?.label(share.category) ?? share.category, total: share.total, share: nil)
                }
            }
        }
        if !period.incomeMerchants.isEmpty {
            Section("Income by payer") {
                ForEach(period.incomeMerchants, id: \.counterparty) { merchant in
                    NavigationLink(value: MerchantRoute(name: merchant.counterparty)) {
                        ValueRow(
                            title: merchant.counterparty,
                            detail: merchant.count == 1 ? "1 payment" : "\(merchant.count) payments",
                            value: Money.kr(merchant.total),
                            tint: .green
                        )
                    }
                }
            }
        }
    }
}

private struct SubscriptionsSection: View {
    let period: Period

    var body: some View {
        Section {
            ForEach(period.subscriptions, id: \.name) { sub in
                NavigationLink(value: MerchantRoute(name: sub.name)) {
                    HStack(spacing: 12) {
                        CategoryIcon(category: sub.category)
                        ValueRow(title: sub.name, detail: "Last \(Day.date(sub.last).shortDay)", value: Money.kr(sub.latest))
                    }
                }
            }
        } header: {
            if !period.subscriptions.isEmpty { Text("Subscriptions") }
        } footer: {
            if period.excluded.count > 0 {
                Text("\(period.excluded.count) internal transfers and card bill payments for \(Money.kr(period.excluded.total)) are not counted.")
            }
        }
    }
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
