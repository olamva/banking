import Charts
import SwiftUI

enum SpendGrain: String, CaseIterable, Identifiable {
    case running, day, month

    var id: String { rawValue }

    var label: String {
        switch self {
        case .running: "Running total"
        case .day: "Per day"
        case .month: "Per month"
        }
    }

    var suffix: String {
        switch self {
        case .running: ", running total"
        case .day: " by day"
        case .month: " by month"
        }
    }

    static func offered(_ kind: String) -> [SpendGrain] {
        switch kind {
        case "month": [.running, .day]
        case "year": [.running, .month]
        case "all": [.month]
        default: [.running, .day, .month]
        }
    }
}

enum SpendGroup: String, CaseIterable, Identifiable {
    case total, merchant, category

    var id: String { rawValue }
    var label: String { rawValue.capitalized }
}

private struct Tally: Hashable {
    var spent = 0
    var income = 0
}

private struct Slot {
    let at: String
    let tally: Tally?
}

private struct GroupLine {
    let name: String
    let color: Color
    let values: [Double?]
}

private enum Buckets {
    static func cents(_ value: Double) -> Int { Int((value * 100).rounded()) }

    static func days(_ from: String, _ to: String) -> [String] {
        var out: [String] = []
        var date = Day.date(from)
        var key = from
        while !key.isEmpty, key <= to {
            out.append(key)
            date = Day.calendar.date(byAdding: .day, value: 1, to: date) ?? .distantFuture
            key = Day.key(date)
        }
        return out
    }

    static func index(_ month: String) -> Int {
        (Int(month.prefix(4)) ?? 0) * 12 + (Int(month.dropFirst(5).prefix(2)) ?? 1) - 1
    }

    static func monthKey(_ index: Int) -> String { String(format: "%04d-%02d", index / 12, index % 12 + 1) }

    static func tally(_ rows: [Txn], month: Bool, running: Bool, from: String, to: String) -> [(String, Tally)] {
        var sums: [String: Tally] = [:]
        for txn in rows {
            let key = month ? txn.month : txn.date
            var sum = sums[key] ?? Tally()
            if txn.excluded == nil {
                let value = cents(txn.amount)
                if value > 0 { sum.income += value } else { sum.spent -= value }
            }
            sums[key] = sum
        }
        var total = Tally()
        return (month ? sums.keys.sorted() : days(from, to)).map { key in
            let sum = sums[key] ?? Tally()
            guard running else { return (key, sum) }
            total.spent += sum.spent
            total.income += sum.income
            return (key, total)
        }
    }

    static func slots(_ points: [(String, Tally)], month: Bool) -> [Slot] {
        guard month, let first = points.first, let last = points.last else { return points.map { Slot(at: $0.0, tally: $0.1) } }
        let byIndex = Dictionary(points.map { (index($0.0), $0.1) }, uniquingKeysWith: { a, _ in a })
        return (index(first.0)...index(last.0)).map { Slot(at: monthKey($0), tally: byIndex[$0]) }
    }

    static func top(_ rows: [Txn], _ key: (Txn) -> String?) -> [(name: String, rows: [Txn])] {
        var groups: [String: (cents: Int, rows: [Txn])] = [:]
        for txn in rows where txn.excluded == nil && txn.amount < 0 {
            guard let name = key(txn) else { continue }
            groups[name, default: (0, [])].cents -= cents(txn.amount)
            groups[name, default: (0, [])].rows.append(txn)
        }
        return groups
            .sorted { $0.value.cents != $1.value.cents ? $0.value.cents > $1.value.cents : $0.key < $1.key }
            .prefix(5)
            .map { ($0.key, $0.value.rows) }
    }
}

private struct SpendModel {
    static let colors: [Color] = [.blue, .orange, .purple, .teal, .pink]

    let month: Bool
    let running: Bool
    let slots: [Slot]
    let compare: [Tally?]
    let hasCompare: Bool
    let groups: [GroupLine]
    let trend: (start: Double, end: Double)?
    let anySpend: Bool
    let anyIncome: Bool

    init(rows: [Txn], previous: [Txn], prev: Bounds?, from: String, to: String, grain: SpendGrain, groups: [(name: String, rows: [Txn])]) {
        let month = grain == .month
        let running = grain == .running
        let build = { (rows: [Txn], a: String, b: String) in Buckets.tally(rows, month: month, running: running, from: a, to: b) }
        let slots = Buckets.slots(build(rows, from, to), month: month)
        let earlier = prev.map { build(previous, $0.from, $0.to) } ?? []
        let compareKey = { (at: String) in month ? String(at.dropFirst(5).prefix(2)) : String(at.dropFirst(5)) }
        let byKey = Dictionary(earlier.map { (compareKey($0.0), $0.1) }, uniquingKeysWith: { a, _ in a })
        let firstMonth = Int(slots.first?.at.dropFirst(5).prefix(2) ?? "1") ?? 1
        self.compare = slots.indices.map { i in
            byKey[month ? String(format: "%02d", (firstMonth - 1 + i) % 12 + 1) : compareKey(slots[i].at)]
        }
        self.groups = groups.enumerated().map { k, group in
            let byAt = Dictionary(build(group.rows, from, to).map { ($0.0, $0.1.spent) }, uniquingKeysWith: { a, _ in a })
            return GroupLine(
                name: group.name,
                color: Self.colors[k % Self.colors.count],
                values: slots.map { $0.tally == nil ? nil : Double(byAt[$0.at] ?? 0) / 100 }
            )
        }
        let anySpend = slots.contains { ($0.tally?.spent ?? 0) > 0 }
        let points = slots.enumerated().compactMap { i, slot in slot.tally.map { (x: Double(i), y: Double($0.spent) / 100) } }
        let mx = points.reduce(0) { $0 + $1.x } / Double(max(points.count, 1))
        let my = points.reduce(0) { $0 + $1.y } / Double(max(points.count, 1))
        let varX = points.reduce(0) { $0 + ($1.x - mx) * ($1.x - mx) }
        if !running, anySpend, points.count >= 2, varX > 0 {
            let slope = points.reduce(0) { $0 + ($1.x - mx) * ($1.y - my) } / varX
            let intercept = my - slope * mx
            self.trend = (intercept, intercept + slope * Double(slots.count - 1))
        } else {
            self.trend = nil
        }
        self.month = month
        self.running = running
        self.slots = slots
        self.hasCompare = prev != nil && !earlier.isEmpty
        self.anySpend = anySpend
        self.anyIncome = slots.contains { ($0.tally?.income ?? 0) > 0 }
    }

    func date(_ index: Int) -> Date {
        let at = slots[index].at
        return month ? Day.month(at) : Day.date(at)
    }
}

private struct Mark: Identifiable {
    let id: String
    let name: String
    let color: Color
    var dashed = false
}

struct SpendingChart: View {
    @Environment(Store.self) private var store
    let rows: [Txn]
    let period: Period
    @State private var grain: SpendGrain?
    @State private var group = SpendGroup.total
    @State private var hidden: Set<String> = []

    var body: some View {
        let offered = SpendGrain.offered(period.kind)
        let grain = offered.first { $0 == self.grain } ?? offered[0]
        let groupings = groupings
        let groupsOffered = SpendGroup.allCases.filter { $0 == .total || (groupings[$0]?.count ?? 0) > 1 }
        let by = groupsOffered.contains(group) ? group : .total
        let model = SpendModel(
            rows: rows,
            previous: previous,
            prev: period.prev,
            from: period.from,
            to: period.to,
            grain: grain,
            groups: groupings[by] ?? []
        )
        let marks = marks(model, by: by)
        if model.slots.count > 1 {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    if offered.count > 1 {
                        Picker("Chart grain", selection: Binding { grain } set: { self.grain = $0 }) {
                            ForEach(offered) { Text($0.label).tag($0) }
                        }
                        .pickerStyle(.segmented)
                    }
                    if groupsOffered.count > 1 {
                        Picker("Group the chart by", selection: Binding { by } set: { group = $0 }) {
                            ForEach(groupsOffered) { Text($0.label).tag($0) }
                        }
                        .pickerStyle(.segmented)
                    }
                    Legend(marks: marks, hidden: $hidden)
                    Plot(model: model, marks: marks.filter { !hidden.contains($0.id) }, compared: period.compared)
                        .frame(height: 220)
                }
                .padding(.vertical, 6)
            } header: {
                Text(subject(by, model) + grain.suffix)
            } footer: {
                Text("Touch the chart to read its values. Tap a key to hide or show its line.")
            }
        }
    }

    private var groupings: [SpendGroup: [(name: String, rows: [Txn])]] {
        let label = { (category: String, sub: String?) in store.data?.label(category, sub) ?? category }
        let byCategory = Buckets.top(rows) { label($0.category, nil) }
        return [
            .merchant: Buckets.top(rows) { $0.unnamed == true ? nil : $0.merchant },
            .category: byCategory.count > 1 ? byCategory : Buckets.top(rows) { label($0.category, $0.subcategory) },
        ]
    }

    private var previous: [Txn] {
        guard let bounds = period.prev else { return [] }
        return (store.data?.txns ?? []).filter { $0.date >= bounds.from && $0.date <= bounds.to && store.filters.matches($0) }
    }

    private func subject(_ by: SpendGroup, _ model: SpendModel) -> String {
        switch by {
        case .merchant: "Top merchants"
        case .category: "Top categories"
        case .total: model.anyIncome ? (model.anySpend ? "Income and spending" : "Income") : "Spending"
        }
    }

    private func marks(_ model: SpendModel, by: SpendGroup) -> [Mark] {
        guard by == .total else { return model.groups.map { Mark(id: "g:\($0.name)", name: $0.name, color: $0.color) } }
        var marks: [Mark] = []
        if model.anySpend { marks.append(Mark(id: "out", name: "Spent", color: .red)) }
        if model.anyIncome { marks.append(Mark(id: "in", name: "Income", color: .green)) }
        if model.trend != nil { marks.append(Mark(id: "trend", name: "Trend", color: .blue, dashed: true)) }
        if model.hasCompare, let compared = period.compared {
            marks.append(Mark(id: "compare", name: compared, color: model.anySpend ? .red : .green, dashed: true))
        }
        return marks
    }
}

private struct Legend: View {
    let marks: [Mark]
    @Binding var hidden: Set<String>

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 14) {
                ForEach(marks) { mark in
                    let on = !hidden.contains(mark.id)
                    Button {
                        if on { hidden.insert(mark.id) } else { hidden.remove(mark.id) }
                    } label: {
                        HStack(spacing: 6) {
                            Swatch(color: mark.color, dashed: mark.dashed)
                            Text(mark.name).lineLimit(1)
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 6)
                        .opacity(on ? 1 : 0.4)
                    }
                    .buttonStyle(.borderless)
                    .tint(.primary)
                    .accessibilityLabel(mark.name)
                    .accessibilityValue(on ? "Shown" : "Hidden")
                    .accessibilityHint(on ? "Hides the line." : "Shows the line.")
                }
            }
        }
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
    }
}

private struct Swatch: View {
    let color: Color
    let dashed: Bool

    var body: some View {
        Path { path in
            path.move(to: CGPoint(x: 0, y: 1.5))
            path.addLine(to: CGPoint(x: 16, y: 1.5))
        }
        .stroke(color.opacity(dashed ? 0.6 : 1), style: StrokeStyle(lineWidth: 3, lineCap: dashed ? .butt : .round, dash: dashed ? [4, 3] : []))
        .frame(width: 16, height: 3)
    }
}

private struct Dot: Identifiable {
    let line: String
    let index: Int
    let x: Date
    let y: Double
    let color: Color
    let dashed: Bool
    let faint: Bool
    let symbol: Bool

    var id: String { "\(line)|\(index)" }
}

private struct Reading: Identifiable {
    let name: String
    let color: Color
    let value: Double

    var id: String { name }
}

private struct Plot: View {
    let model: SpendModel
    let marks: [Mark]
    let compared: String?
    @State private var picked: Date?

    var body: some View {
        let dots = dots
        let index = picked.map(nearest)
        Chart {
            ForEach(dots) { dot in
                LineMark(x: .value("Date", dot.x), y: .value("Amount", dot.y), series: .value("Line", dot.line))
                    .foregroundStyle(dot.color.opacity(dot.faint ? 0.45 : 1))
                    .lineStyle(StrokeStyle(lineWidth: dot.dashed ? 1.5 : 2, lineCap: .round, dash: dot.dashed ? [5, 4] : []))
                if dot.symbol || (index == dot.index && !dot.dashed) {
                    PointMark(x: .value("Date", dot.x), y: .value("Amount", dot.y))
                        .foregroundStyle(dot.color)
                        .symbolSize(index == dot.index ? 60 : 22)
                }
            }
            if let index {
                RuleMark(x: .value("Date", model.date(index)))
                    .foregroundStyle(Color.secondary.opacity(0.5))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                    .annotation(position: .top, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                        Tip(title: title(index), readings: readings(index))
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
        .chartXAxis {
            AxisMarks { _ in
                AxisGridLine()
                AxisValueLabel(format: model.month ? .dateTime.month(.abbreviated).year(.twoDigits) : .dateTime.day().month(.abbreviated))
            }
        }
        .chartLegend(.hidden)
        .accessibilityLabel(marks.map(\.name).joined(separator: ", "))
    }

    private func shows(_ id: String) -> Bool { marks.contains { $0.id == id } }

    private var dots: [Dot] {
        var out: [Dot] = []
        func add(_ id: String, _ values: [Double?], _ color: Color, dashed: Bool = false, faint: Bool = false) {
            var start = 0
            for (i, value) in values.enumerated() {
                guard let value else { continue }
                if i == 0 || values[i - 1] == nil { start = i }
                let alone = (i == 0 || values[i - 1] == nil) && (i + 1 >= values.count || values[i + 1] == nil)
                out.append(Dot(line: "\(id)#\(start)", index: i, x: model.date(i), y: value, color: color, dashed: dashed, faint: faint, symbol: !dashed && alone))
            }
        }
        if shows("compare") {
            if model.anySpend { add("compare-out", model.compare.map { $0.map { Double($0.spent) / 100 } }, .red, dashed: true, faint: true) }
            if model.anyIncome { add("compare-in", model.compare.map { $0.map { Double($0.income) / 100 } }, .green, dashed: true, faint: true) }
        }
        if shows("out") { add("out", model.slots.map { $0.tally.map { Double($0.spent) / 100 } }, .red) }
        if shows("in") { add("in", model.slots.map { $0.tally.map { Double($0.income) / 100 } }, .green) }
        if shows("trend"), let trend = model.trend {
            let last = model.slots.count - 1
            out.append(Dot(line: "trend", index: 0, x: model.date(0), y: trend.start, color: .blue, dashed: true, faint: false, symbol: false))
            out.append(Dot(line: "trend", index: last, x: model.date(last), y: trend.end, color: .blue, dashed: true, faint: false, symbol: false))
        }
        for group in model.groups where shows("g:\(group.name)") {
            add("g:\(group.name)", group.values, group.color)
        }
        return out
    }

    private func nearest(_ date: Date) -> Int {
        model.slots.indices.min { abs(model.date($0).timeIntervalSince(date)) < abs(model.date($1).timeIntervalSince(date)) } ?? 0
    }

    private func title(_ index: Int) -> String {
        model.month ? model.date(index).monthTitle : model.date(index).shortDay
    }

    private func readings(_ index: Int) -> [Reading] {
        let tally = model.slots[index].tally
        let before = model.compare[safe: index] ?? nil
        var out: [Reading] = []
        if shows("out") { out.append(Reading(name: "Spent", color: .red, value: Double(tally?.spent ?? 0) / 100)) }
        if shows("in") { out.append(Reading(name: "Income", color: .green, value: Double(tally?.income ?? 0) / 100)) }
        for group in model.groups where shows("g:\(group.name)") {
            out.append(Reading(name: group.name, color: group.color, value: group.values[index] ?? 0))
        }
        if shows("compare"), let compared, let before {
            if model.anySpend { out.append(Reading(name: "Spent, \(compared)", color: .red.opacity(0.45), value: Double(before.spent) / 100)) }
            if model.anyIncome { out.append(Reading(name: "Income, \(compared)", color: .green.opacity(0.45), value: Double(before.income) / 100)) }
        }
        return out
    }
}

private struct Tip: View {
    let title: String
    let readings: [Reading]

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.caption.weight(.semibold))
            ForEach(readings) { reading in
                HStack(spacing: 6) {
                    Circle().fill(reading.color).frame(width: 7, height: 7)
                    Text(reading.name).foregroundStyle(.secondary).lineLimit(1)
                    Spacer(minLength: 8)
                    Text(Money.kr(reading.value)).monospacedDigit()
                }
                .font(.caption2)
            }
        }
        .frame(maxWidth: 230)
        .padding(8)
        .background(.regularMaterial, in: .rect(cornerRadius: 10))
    }
}
