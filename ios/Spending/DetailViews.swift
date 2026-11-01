import Charts
import SwiftUI

struct CategoryView: View {
    @Environment(Store.self) private var store
    let route: CategoryRoute

    var body: some View {
        let data = store.data
        let month = data?.months.first { $0.month == route.month }
        let history = (data?.months ?? []).filter { $0.month <= route.month }.suffix(12)
        let txns = (data?.txns ?? []).filter { $0.month == route.month && $0.category == route.category && $0.excluded == nil }
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 12) {
                        CategoryIcon(category: route.category, size: 44)
                        VStack(alignment: .leading) {
                            Text(month.map { Money.kr($0.categories.first { $0.category == route.category }?.total ?? 0) } ?? "")
                                .font(.title2.bold())
                                .monospacedDigit()
                            Text("in \(Day.month(route.month).monthTitle)")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Chart(Array(history), id: \.month) { m in
                        BarMark(
                            x: .value("Month", m.date, unit: .month),
                            y: .value("Spent", m.categories.first { $0.category == route.category }?.total ?? 0)
                        )
                        .foregroundStyle(m.month == route.month ? CategoryStyle.of(route.category).color : CategoryStyle.of(route.category).color.opacity(0.35))
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
            let subs = month?.subcategories.filter { $0.category == route.category } ?? []
            if subs.count > 1 {
                Section("Subcategories") {
                    ForEach(subs, id: \.subcategory) { sub in
                        LabeledContent(data?.label(sub.category, sub.subcategory) ?? "Other") {
                            Text(Money.kr(sub.total)).monospacedDigit()
                        }
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
    }
}

struct TxnView: View {
    @Environment(Store.self) private var store
    let txn: Txn

    var body: some View {
        List {
            Section {
                VStack(spacing: 10) {
                    CategoryIcon(category: txn.category, size: 64)
                    Text(txn.merchant)
                        .font(.title3.weight(.semibold))
                        .multilineTextAlignment(.center)
                    Text(Money.kr(txn.amount, signed: txn.amount > 0, exact: true))
                        .font(.system(size: 36, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(txn.excluded != nil ? Color.secondary : txn.amount > 0 ? Color.green : Color.primary)
                        .strikethrough(txn.excluded != nil)
                    Text(txn.day.dayTitle + " " + txn.date.prefix(4))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .listRowBackground(Color.clear)
            }
            if let reason = txn.excluded {
                Section {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Not counted in totals")
                            Text(reason).font(.subheadline).foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "eye.slash")
                    }
                }
            }
            Section("Details") {
                LabeledContent("Category", value: store.data?.label(txn.category) ?? txn.category)
                if let sub = txn.subcategory {
                    LabeledContent("Subcategory", value: store.data?.label(txn.category, sub) ?? sub)
                }
                LabeledContent("Account", value: txn.account)
                if let type = txn.type { LabeledContent("Type", value: type) }
                if let country = txn.country { LabeledContent("Country", value: country) }
                if txn.recurring { LabeledContent("Recurring", value: "Yes") }
                if txn.pending { LabeledContent("Status", value: "Pending") }
            }
            Section("Bank text") {
                Text(txn.description)
                    .font(.callout.monospaced())
                    .textSelection(.enabled)
            }
            Section {
                NavigationLink(value: MerchantRoute(name: txn.merchant)) {
                    Label("All from \(txn.merchant)", systemImage: "clock.arrow.circlepath")
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
    }
}
