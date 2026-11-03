import SwiftUI

struct InsightsView: View {
    @Environment(Store.self) private var store
    @State private var year = ""

    var body: some View {
        NavigationStack {
            Group {
                if let data = store.data {
                    let insights = data.years.first { $0.year == year }?.insights ?? data.insights
                    List {
                        SessionBanner()
                        if insights.transactionCount == 0 {
                            ContentUnavailableView("No spending", systemImage: "tray")
                        } else {
                            Figures(insights: insights)
                            Ranking(title: "Most transactions", rows: insights.topByTransactions) { "\($0.count) txns" }
                            Ranking(title: "Highest spend", rows: insights.topBySpend) { Money.kr($0.total) }
                            Expected(rows: insights.expected)
                            Weekdays(days: insights.weekdays)
                            Habits(rows: insights.merchants)
                        }
                    }
                    .refreshable { await store.reload() }
                    .navigationDestination(for: MerchantRoute.self) { MerchantView(name: $0.name) }
                    .navigationDestination(for: Txn.self) { TxnView(txn: $0) }
                    .toolbarTitleMenu {
                        Picker("Period", selection: $year) {
                            Text("All time").tag("")
                            ForEach(data.years.reversed()) { Text($0.year).tag($0.year) }
                        }
                    }
                } else {
                    Loading()
                }
            }
            .navigationTitle(year.isEmpty ? "All time" : year)
        }
    }
}

private struct Figures: View {
    let insights: Insights

    var body: some View {
        let busiest = insights.topByTransactions.first
        let favorite = insights.weekdays.max { $0.count < $1.count }
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
                        value: favorite.map { $0.count > 0 ? $0.weekday : "None" } ?? "None",
                        detail: favorite.flatMap { $0.count > 0 ? "\($0.count) visits · \(Percent.of($0.share))" : nil }
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
                VStack(alignment: .leading, spacing: 6) {
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
            }
        }
    }
}

private struct Habits: View {
    @Environment(Store.self) private var store
    let rows: [Habit]

    var body: some View {
        Section {
            ForEach(rows, id: \.merchant) { row in
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
                                Text("\(row.count) txns · \(Money.kr(row.average)) on average · \(store.data?.label(row.topCategory) ?? row.topCategory)")
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
            }
        } header: {
            Text("Merchant habits")
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
