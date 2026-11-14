import SwiftUI

struct InsightsView: View {
    @Environment(Store.self) private var store

    var body: some View {
        NavigationStack {
            Group {
                if store.selected != nil {
                    List {
                        SessionBanner()
                        if let insights = store.shown?.insights {
                            if insights.transactionCount == 0 {
                                ContentUnavailableView("No spending matches the current filters.", systemImage: "tray")
                            } else {
                                Figures(insights: insights)
                                Ranking(title: "Most transactions", rows: insights.topByTransactions) { "\($0.count) txns" }
                                Ranking(title: "Highest spend", rows: insights.topBySpend) { Money.kr($0.total) }
                                Expected(rows: insights.expected)
                                Weekdays(days: insights.weekdays)
                                Habits(rows: insights.merchants)
                            }
                        } else {
                            Figuring()
                        }
                    }
                    .refreshable { await store.reload() }
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

private extension View {
    func merchantDrill(_ merchant: String) -> some View { drill(Drill(axis: .merchants, value: merchant, name: merchant)) }
}

private struct Figures: View {
    let insights: Insights

    var body: some View {
        let busiest = insights.topByTransactions.first
        let favorite = insights.weekdays.max { $0.count < $1.count }
        let visited = (favorite?.count ?? 0) > 0
        Section {
            Grid(horizontalSpacing: 12, verticalSpacing: 12) {
                GridRow {
                    Tile(title: "Spending transactions", value: insights.transactionCount.formatted())
                    Tile(title: "Merchants", value: insights.merchantCount.formatted())
                }
                GridRow {
                    Tile(title: "Most transactions", value: busiest?.merchant ?? "None", detail: busiest.map { "\($0.count) txns · \(Money.kr($0.total))" })
                    Tile(
                        title: "Favorite card weekday",
                        value: visited ? favorite?.weekday ?? "" : "Not available",
                        detail: visited ? favorite.map { "\($0.count) merchant visits · \(Percent.of($0.share))" } : "No card purchase dates"
                    )
                }
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
        } footer: {
            Text("Timing uses card purchase dates. Rankings use all spending transactions.")
        }
    }
}

private struct Tile: View {
    let title: String
    let value: String
    var detail: String?

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
            if let detail {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .topLeading)
        .padding(12)
        .background(.fill.quaternary, in: .rect(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

private struct Ranking: View {
    let title: String
    let rows: [Habit]
    let value: (Habit) -> String

    var body: some View {
        Section(title) {
            ForEach(Array(rows.enumerated()), id: \.element.merchant) { index, row in
                NavigationLink(value: MerchantRoute(name: row.merchant)) {
                    LabeledContent {
                        Text(value(row)).monospacedDigit()
                    } label: {
                        HStack(spacing: 10) {
                            Text("\(index + 1)")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                                .frame(minWidth: 18, alignment: .trailing)
                            Text(row.merchant).lineLimit(1)
                        }
                    }
                }
                .merchantDrill(row.merchant)
            }
        }
    }
}

private struct Expected: View {
    let rows: [Habit]

    var body: some View {
        Section("Expected returns") {
            if rows.isEmpty {
                Text("At least three recent card visit days are needed.")
                    .foregroundStyle(.secondary)
            }
            ForEach(rows, id: \.merchant) { row in
                if let pattern = row.returnPattern {
                    NavigationLink(value: MerchantRoute(name: row.merchant)) {
                        LabeledContent {
                            VStack(alignment: .trailing, spacing: 2) {
                                Text(Day.date(pattern.expectedNext).shortDay)
                                Text("every \(pattern.medianDays) days").font(.caption)
                            }
                        } label: {
                            Text(row.merchant).lineLimit(1)
                        }
                    }
                    .merchantDrill(row.merchant)
                }
            }
        }
    }
}

private struct Weekdays: View {
    let days: [Weekday]

    var body: some View {
        let most = max(days.map(\.count).max() ?? 1, 1)
        Section("Card visits by weekday") {
            ForEach(days, id: \.weekday) { day in
                let row = VStack(alignment: .leading, spacing: 6) {
                    LabeledContent {
                        Text("\(day.count) · \(Percent.of(day.share))").monospacedDigit()
                    } label: {
                        Text(day.weekday)
                        Text(day.topMerchant ?? "No visits")
                    }
                    ProgressView(value: Double(day.count), total: Double(most))
                        .accessibilityHidden(true)
                }
                .accessibilityElement(children: .combine)
                if let merchant = day.topMerchant {
                    NavigationLink(value: MerchantRoute(name: merchant)) { row }
                        .merchantDrill(merchant)
                } else {
                    row
                }
            }
        }
    }
}

private enum HabitSort: String, CaseIterable, Identifiable {
    case count, total, average, favoriteWeekday, medianDays, last

    var id: String { rawValue }

    var label: String {
        switch self {
        case .count: "Transactions"
        case .total: "Spent"
        case .average: "Average"
        case .favoriteWeekday: "Favorite time"
        case .medianDays: "Usual return"
        case .last: "Last card visit"
        }
    }

    func ascending(_ a: Habit, _ b: Habit) -> Bool {
        switch self {
        case .count: a.count < b.count
        case .total: a.total < b.total
        case .average: a.average < b.average
        case .favoriteWeekday: (a.favoriteWeekday ?? "").localizedCompare(b.favoriteWeekday ?? "") == .orderedAscending
        case .medianDays: (a.returnPattern?.medianDays ?? -1) < (b.returnPattern?.medianDays ?? -1)
        case .last: (a.last ?? "") < (b.last ?? "")
        }
    }
}

private struct Habits: View {
    @Environment(Store.self) private var store
    let rows: [Habit]
    @State private var sort = HabitSort.count
    @State private var descending = true

    var body: some View {
        let sorted = rows.enumerated().sorted { a, b in
            let (x, y) = descending ? (b.element, a.element) : (a.element, b.element)
            if sort.ascending(x, y) { return true }
            if sort.ascending(y, x) { return false }
            return a.offset < b.offset
        }.map(\.element)
        Section {
            ForEach(sorted, id: \.merchant) { row in
                let category = store.data?.label(row.topCategory) ?? row.topCategory
                NavigationLink(value: MerchantRoute(name: row.merchant)) {
                    HStack(alignment: .top, spacing: 12) {
                        CategoryIcon(category: row.topCategory)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack {
                                Text(row.merchant).lineLimit(1)
                                Spacer()
                                Text(Money.kr(row.total)).monospacedDigit()
                            }
                            Group {
                                Text("\(row.count) txns · \(Money.kr(row.average)) on average · \(category)")
                                Text("Favorite time: \(favorite(row))")
                                Text("Usual return: \(usual(row))")
                                Text("Last card visit: \(row.last.map { Day.date($0).shortDay } ?? "None")")
                                if let pattern = row.returnPattern {
                                    Text("Expected next: \(pattern.active ? Day.date(pattern.expectedNext).shortDay : "Inactive pattern")")
                                }
                            }
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                        }
                    }
                }
                .drill(
                    Drill(axis: .merchants, value: row.merchant, name: row.merchant),
                    Drill(axis: .categories, value: row.topCategory, name: category, hide: false)
                )
            }
        } header: {
            HStack {
                Text("Merchant habits")
                Spacer()
                Menu {
                    ForEach(HabitSort.allCases) { key in
                        Button {
                            if sort == key {
                                descending.toggle()
                            } else {
                                sort = key
                                descending = true
                            }
                        } label: {
                            if sort == key {
                                Label(key.label, systemImage: descending ? "chevron.down" : "chevron.up")
                            } else {
                                Text(key.label)
                            }
                        }
                    }
                    Divider()
                    Button(descending ? "Lowest first" : "Highest first", systemImage: "arrow.up.arrow.down") { descending.toggle() }
                } label: {
                    Label(sort.label, systemImage: "arrow.up.arrow.down")
                        .font(.caption.weight(.semibold))
                        .textCase(nil)
                }
                .accessibilityLabel("Sort merchant habits by \(sort.label)")
            }
        } footer: {
            Text("The \(rows.count) merchants with the most transactions.")
        }
    }

    private func favorite(_ row: Habit) -> String {
        guard row.activeDays > 0 else { return "No card visits" }
        let weekend = Double(row.weekendVisitCount) / Double(row.activeDays)
        if weekend > 0.5 { return "Weekend (\(Percent.of(weekend)))" }
        return "\(row.favoriteWeekday ?? "") (\(Percent.of(Double(row.favoriteWeekdayCount) / Double(row.activeDays))))"
    }

    private func usual(_ row: Habit) -> String {
        guard let pattern = row.returnPattern else { return "Not enough card visits" }
        return "\(pattern.medianDays) days (\(pattern.lowDays)–\(pattern.highDays))"
    }
}
