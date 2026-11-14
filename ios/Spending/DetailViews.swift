import Charts
import SwiftUI

struct CategoryView: View {
    @Environment(Store.self) private var store
    let route: CategoryRoute

    var body: some View {
        let data = store.data
        let period = store.lookup(route.period)
        let end = String(period?.to.prefix(7) ?? "")
        let start = String(period?.from.prefix(7) ?? "")
        let history = (data?.months ?? []).filter { $0.key <= end }.suffix(12)
        let txns = (data?.txns ?? []).filter { period?.contains($0) == true && $0.category == route.category && $0.excluded == nil }
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 12) {
                        CategoryIcon(category: route.category, size: 44)
                        VStack(alignment: .leading) {
                            Text(period.map { Money.kr($0.categories.first { $0.category == route.category }?.total ?? 0) } ?? "")
                                .font(.title2.bold())
                                .monospacedDigit()
                            Text("in \(period?.title ?? "")")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Chart(Array(history), id: \.key) { m in
                        BarMark(
                            x: .value("Month", m.date, unit: .month),
                            y: .value("Spent", m.categories.first { $0.category == route.category }?.total ?? 0)
                        )
                        .foregroundStyle(m.key >= start && m.key <= end ? CategoryStyle.of(route.category).color : CategoryStyle.of(route.category).color.opacity(0.35))
                        .cornerRadius(3)
                    }
                    .chartXAxis {
                        AxisMarks(values: .stride(by: .month, count: 2)) {
                            AxisValueLabel(format: .dateTime.month(.narrow), centered: true)
                        }
                    }
                    .chartYAxis {
                        AxisMarks(position: .trailing) { value in
                            AxisGridLine()
                            AxisValueLabel { Text(Money.short(value.as(Double.self) ?? 0)) }
                        }
                    }
                    .frame(height: 140)
                }
                .padding(.vertical, 6)
            }
            let subs = period?.subcategories.filter { $0.category == route.category } ?? []
            if subs.count > 1 {
                Section("Subcategories") {
                    ForEach(subs, id: \.subcategory) { sub in
                        LabeledContent(data?.label(sub.category, sub.subcategory) ?? "Other") {
                            Text(Money.kr(sub.total)).monospacedDigit()
                        }
                        .contextMenu { FilterActions(axis: .categories, value: "\(sub.category)/\(sub.subcategory ?? "")") }
                    }
                }
            }
            Section("Transactions") {
                ForEach(txns) { txn in
                    NavigationLink(value: txn) { TxnRow(txn: txn, showDate: true) }
                }
            }
        }
        .navigationTitle(data?.label(route.category) ?? route.category)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu("Filter", systemImage: "line.3.horizontal.decrease.circle") {
                    FilterActions(axis: .categories, value: route.category)
                }
            }
        }
    }
}

struct MerchantView: View {
    @Environment(Store.self) private var store
    let name: String

    var body: some View {
        let txns = (store.data?.txns ?? []).filter { $0.merchant == name }
        let spending = txns.filter { $0.excluded == nil && $0.amount < 0 }
        let start = Day.calendar.date(byAdding: .month, value: -23, to: Day.month(store.data?.today.prefix(7).description ?? "")) ?? .distantPast
        let recent = spending.filter { $0.day >= start }
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    Text(txns.count == 1 ? "1 transaction" : "\(txns.count) transactions")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    if let first = txns.last {
                        Text("Since \(first.day.shortDay)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    if !recent.isEmpty {
                        Chart(recent) { txn in
                            BarMark(x: .value("Month", txn.day, unit: .month), y: .value("Spent", -txn.amount))
                                .foregroundStyle(Color.accentColor)
                        }
                        .chartXScale(domain: start...Day.month(store.data?.today.prefix(7).description ?? "").addingTimeInterval(31 * 86_400))
                        .chartYAxis {
                            AxisMarks(position: .trailing) { value in
                                AxisGridLine()
                                AxisValueLabel { Text(Money.short(value.as(Double.self) ?? 0)) }
                            }
                        }
                        .chartXAxis {
                            AxisMarks(values: .stride(by: .month, count: 6)) {
                                AxisValueLabel(format: .dateTime.month(.abbreviated).year(.twoDigits))
                            }
                        }
                        .frame(height: 150)
                        .accessibilityLabel("Monthly spending at \(name) for two years")
                    }
                }
                .padding(.vertical, 6)
            }
            Section("Transactions") {
                ForEach(txns.prefix(300)) { txn in
                    NavigationLink(value: txn) { TxnRow(txn: txn, showDate: true) }
                }
            }
        }
        .navigationTitle(name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu("Filter", systemImage: "line.3.horizontal.decrease.circle") {
                    FilterActions(axis: .merchants, value: name)
                }
            }
        }
    }
}

