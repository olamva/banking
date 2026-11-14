import Charts
import SwiftUI

struct TrendsView: View {
    @Environment(Store.self) private var store
    @State private var picked: Date?
    @State private var showIncome = false

    var body: some View {
        NavigationStack {
            Group {
                if let data = store.data {
                    List {
                        Section {
                            VStack(alignment: .leading, spacing: 12) {
                                Picker("Show", selection: $showIncome) {
                                    Text("Spent").tag(false)
                                    Text("Income").tag(true)
                                }
                                .pickerStyle(.segmented)
                                MonthsChart(months: data.months, showIncome: showIncome, picked: $picked)
                                    .frame(height: 240)
                            }
                            .padding(.vertical, 6)
                        } footer: {
                            Text("Drag the chart to see earlier months. Touch a bar to see its figures.")
                        }
                        Section("Years") {
                            ForEach(data.years.reversed()) { year in
                                NavigationLink(value: year) {
                                    LabeledContent {
                                        VStack(alignment: .trailing, spacing: 2) {
                                            Text(Money.kr(year.totalOut)).monospacedDigit()
                                            if let average = year.averageOut {
                                                Text("\(Money.kr(average)) a month")
                                                    .font(.caption)
                                                    .foregroundStyle(.secondary)
                                                    .monospacedDigit()
                                            }
                                        }
                                    } label: {
                                        Text(year.key).font(.headline)
                                        Text("Income \(Money.kr(year.totalIn))").monospacedDigit()
                                    }
                                }
                            }
                        }
                    }
                    .refreshable { await store.reload() }
                    .navigationDestination(for: Period.self) { YearView(year: $0) }
                    .navigationDestination(for: CategoryRoute.self) { CategoryView(route: $0) }
                    .navigationDestination(for: MerchantRoute.self) { MerchantView(name: $0.name) }
                    .navigationDestination(for: Txn.self) { TxnView(txn: $0) }
                } else {
                    Loading()
                }
            }
            .navigationTitle("Trends")
            .filtering(false)
        }
    }
}

private struct MonthsChart: View {
    let months: [Period]
    let showIncome: Bool
    @Binding var picked: Date?

    var body: some View {
        let value: (Period) -> Double = { showIncome ? $0.totalIn : $0.totalOut }
        let tint: Color = showIncome ? .green : .accentColor
        let chosen = picked.flatMap { date in months.first { Day.calendar.isDate($0.date, equalTo: date, toGranularity: .month) } }
        Chart {
            ForEach(months) { month in
                BarMark(x: .value("Month", month.date, unit: .month), y: .value("Amount", value(month)))
                    .foregroundStyle(tint.opacity(chosen == nil || chosen == month ? 1 : 0.4))
                    .cornerRadius(3)
            }
            if let chosen {
                RuleMark(x: .value("Month", chosen.date, unit: .month))
                    .foregroundStyle(.clear)
                    .annotation(position: .top, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(chosen.date.monthTitle).font(.caption.weight(.semibold))
                            Text("Spent \(Money.kr(chosen.totalOut))").font(.caption).monospacedDigit()
                            Text("Income \(Money.kr(chosen.totalIn))").font(.caption).monospacedDigit()
                        }
                        .padding(8)
                        .background(.regularMaterial, in: .rect(cornerRadius: 10))
                    }
            }
        }
        .chartXSelection(value: $picked)
        .chartScrollableAxes(.horizontal)
        .chartXVisibleDomain(length: 3600 * 24 * 366)
        .chartScrollPosition(initialX: Day.calendar.date(byAdding: .month, value: -11, to: months.last?.date ?? .now) ?? .now)
        .chartXAxis {
            AxisMarks(values: .stride(by: .month)) { value in
                if let date = value.as(Date.self), Day.calendar.component(.month, from: date) == 1 {
                    AxisGridLine()
                    AxisValueLabel(format: .dateTime.year(), centered: true)
                } else {
                    AxisValueLabel(format: .dateTime.month(.narrow), centered: true)
                }
            }
        }
        .chartYAxis {
            AxisMarks(position: .trailing) { value in
                AxisGridLine()
                AxisValueLabel { Text(Money.short(value.as(Double.self) ?? 0)) }
            }
        }
    }
}

struct YearView: View {
    @Environment(Store.self) private var store
    let year: Period

    var body: some View {
        let months = (store.data?.months ?? []).filter { $0.key.hasPrefix(year.key) }
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Spent").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                    Text(Money.kr(year.totalOut))
                        .font(.system(size: 36, weight: .bold, design: .rounded))
                        .monospacedDigit()
                    if let average = year.averageOut {
                        Text("\(Money.kr(average)) a month on average")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 6)
                LabeledContent("Income") { Text(Money.kr(year.totalIn)).monospacedDigit().foregroundStyle(.green) }
                LabeledContent("Net") { Text(Money.kr(year.net, signed: true)).monospacedDigit().foregroundStyle(year.net >= 0 ? .green : .red) }
                Button(store.period == year.key ? "Shown in Summary" : "Show the whole year", systemImage: "calendar") { store.period = year.key }
                    .disabled(store.period == year.key)
            }
            Section("Categories") {
                ForEach(year.categories, id: \.category) { share in
                    ShareRow(category: share.category, title: store.data?.label(share.category) ?? share.category, total: share.total, share: share.share)
                }
            }
            Section {
                ForEach(months.reversed()) { month in
                    Button {
                        store.period = month.key
                    } label: {
                        LabeledContent(month.date.monthName) {
                            HStack {
                                Text(Money.kr(month.totalOut)).monospacedDigit()
                                if store.period == month.key { Image(systemName: "checkmark").foregroundStyle(.green) }
                            }
                        }
                    }
                    .tint(.primary)
                }
            } header: {
                Text("Months")
            } footer: {
                Text("Choose a month to show it in Summary, Insights and Activity.")
            }
        }
        .navigationTitle(year.key)
        .navigationBarTitleDisplayMode(.inline)
    }
}
