import Charts
import SwiftUI

struct SummaryView: View {
    @Environment(Store.self) private var store
    @State private var settings = false

    var body: some View {
        NavigationStack {
            Group {
                if let data = store.data, let month = store.selected {
                    List {
                        SessionBanner()
                        Section { Hero(month: month, lastYear: lastYear(data, month)) }
                        CategoriesSection(month: month)
                        MerchantsSection(month: month)
                        IncomeSection(month: month)
                        SubscriptionsSection(month: month)
                    }
                    .contentTransition(.opacity)
                    .animation(.snappy, value: month)
                    .refreshable { await store.reload() }
                    .navigationDestination(for: CategoryRoute.self) { CategoryView(route: $0) }
                    .navigationDestination(for: MerchantRoute.self) { MerchantView(name: $0.name) }
                    .navigationDestination(for: Txn.self) { TxnView(txn: $0) }
                } else {
                    Loading()
                }
            }
            .monthPicker()
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Settings", systemImage: "gearshape") { settings = true }
                }
            }
            .sheet(isPresented: $settings) { SettingsView() }
        }
    }

    private func lastYear(_ data: AppData, _ month: Month) -> Month? {
        let back = "\(Int(month.month.prefix(4))! - 1)\(month.month.dropFirst(4))"
        return data.months.first { $0.month == back }
    }
}

struct CategoryRoute: Hashable {
    let month: String
    let category: String
}

struct MerchantRoute: Hashable {
    let name: String
}

private struct Hero: View {
    let month: Month
    let lastYear: Month?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Spent")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(Money.kr(month.totalOut))
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .contentTransition(.numericText(value: month.totalOut))
                if let delta = month.delta, let compared = month.compared {
                    DeltaLabel(delta: delta.totalOut, compared: compared)
                }
            }
            DayChart(month: month, lastYear: lastYear)
                .frame(height: 170)
            HStack(spacing: 12) {
                Figure(title: "Income", value: month.totalIn, tint: .green)
                Figure(title: "Net", value: month.net, tint: month.net >= 0 ? .green : .red)
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

private struct DayChart: View {
    let month: Month
    let lastYear: Month?
    @State private var day: Int?

    var body: some View {
        Chart {
            if let lastYear {
                ForEach(Array(lastYear.spentByDay.enumerated()), id: \.offset) { index, value in
                    LineMark(x: .value("Day", index + 1), y: .value("Spent", value), series: .value("Series", "Last year"))
                        .foregroundStyle(Color.gray.opacity(0.6))
                        .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [3, 3]))
                }
            }
            ForEach(Array(month.spentByDay.enumerated()), id: \.offset) { index, value in
                AreaMark(x: .value("Day", index + 1), y: .value("Spent", value))
                    .foregroundStyle(.linearGradient(colors: [.accentColor.opacity(0.3), .accentColor.opacity(0)], startPoint: .top, endPoint: .bottom))
                    .interpolationMethod(.monotone)
                LineMark(x: .value("Day", index + 1), y: .value("Spent", value), series: .value("Series", "This month"))
                    .foregroundStyle(Color.accentColor)
                    .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round))
                    .interpolationMethod(.monotone)
            }
            if let day, let value = month.spentByDay[safe: day - 1] {
                RuleMark(x: .value("Day", day))
                    .foregroundStyle(.secondary.opacity(0.4))
                    .annotation(position: .top, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                        VStack(spacing: 2) {
                            Text("Day \(day)").font(.caption2).foregroundStyle(.secondary)
                            Text(Money.kr(value)).font(.caption.weight(.semibold)).monospacedDigit()
                            if let before = lastYear?.spentByDay[safe: day - 1] {
                                Text("Last year \(Money.kr(before))").font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                        .padding(6)
                        .background(.regularMaterial, in: .rect(cornerRadius: 8))
                    }
            }
        }
        .chartXScale(domain: 1...max(month.spentByDay.count, lastYear?.spentByDay.count ?? 0, 28))
        .chartXSelection(value: $day)
        .chartYAxis {
            AxisMarks(position: .trailing) { value in
                AxisGridLine()
                AxisValueLabel { Text(Money.short(value.as(Double.self) ?? 0)) }
            }
        }
        .chartXAxis {
            AxisMarks(values: [1, 8, 15, 22, 29]) { AxisValueLabel() }
        }
        .accessibilityLabel("Spending through the month")
    }
}

private struct CategoriesSection: View {
    @Environment(Store.self) private var store
    let month: Month
    @State private var picked: Double?

    var body: some View {
        if !month.categories.isEmpty {
            Section("Categories") {
                Chart(month.categories, id: \.category) { share in
                    SectorMark(angle: .value("Spent", share.total), innerRadius: .ratio(0.64), angularInset: 1.5)
                        .cornerRadius(4)
                        .foregroundStyle(CategoryStyle.of(share.category).color)
                        .opacity(selected == nil || selected == share.category ? 1 : 0.35)
                }
                .chartAngleSelection(value: $picked)
                .chartBackground { _ in
                    VStack(spacing: 2) {
                        let share = month.categories.first { $0.category == selected }
                        Text(share.map { store.data?.label($0.category) ?? $0.category } ?? "Total")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(Money.kr(share?.total ?? month.totalOut))
                            .font(.title3.bold())
                            .monospacedDigit()
                        if let share {
                            Text(share.share.formatted(.percent.precision(.fractionLength(0))))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .frame(height: 220)
                .padding(.vertical, 8)

                ForEach(month.categories, id: \.category) { share in
                    NavigationLink(value: CategoryRoute(month: month.month, category: share.category)) {
                        ShareRow(category: share.category, title: store.data?.label(share.category) ?? share.category, total: share.total, share: share.share)
                    }
                }
            }
        }
    }

    private var selected: String? {
        guard let picked else { return nil }
        var running = 0.0
        return month.categories.first { share in
            running += share.total
            return picked <= running
        }?.category
    }
}

private struct MerchantsSection: View {
    let month: Month

    var body: some View {
        if !month.merchants.isEmpty {
            Section("Top merchants") {
                ForEach(month.merchants.prefix(8), id: \.counterparty) { merchant in
                    NavigationLink(value: MerchantRoute(name: merchant.counterparty)) {
                        LabeledContent {
                            Text(Money.kr(merchant.total)).monospacedDigit()
                        } label: {
                            Text(merchant.counterparty).lineLimit(1)
                            Text(merchant.count == 1 ? "1 payment" : "\(merchant.count) payments")
                        }
                    }
                }
            }
        }
    }
}

private struct IncomeSection: View {
    @Environment(Store.self) private var store
    let month: Month

    var body: some View {
        if !month.incomeCategories.isEmpty {
            Section("Income") {
                ForEach(month.incomeCategories, id: \.category) { share in
                    ShareRow(category: share.category, title: store.data?.label(share.category) ?? share.category, total: share.total, share: nil)
                }
            }
        }
    }
}

private struct SubscriptionsSection: View {
    let month: Month

    var body: some View {
        Section {
            ForEach(month.subscriptions, id: \.name) { sub in
                NavigationLink(value: MerchantRoute(name: sub.name)) {
                    HStack(spacing: 12) {
                        CategoryIcon(category: sub.category)
                        LabeledContent {
                            Text(Money.kr(sub.latest)).monospacedDigit()
                        } label: {
                            Text(sub.name).lineLimit(1)
                            Text("Last \(Day.date(sub.last).shortDay)")
                        }
                    }
                }
            }
        } header: {
            if !month.subscriptions.isEmpty { Text("Subscriptions") }
        } footer: {
            if month.excluded.count > 0 {
                Text("\(month.excluded.count) internal transfers and card bill payments for \(Money.kr(month.excluded.total)) are not counted.")
            }
        }
    }
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
