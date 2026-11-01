import SwiftUI

struct MonthPicker: ViewModifier {
    @Environment(Store.self) private var store

    func body(content: Content) -> some View {
        let months = store.data?.months.map(\.month) ?? []
        let index = months.firstIndex(of: store.selected?.month ?? "")
        content
            .navigationTitle(store.selected?.date.monthTitle ?? "Spending")
            .toolbarTitleMenu {
                ForEach(Dictionary(grouping: months) { $0.prefix(4) }.keys.sorted(by: >), id: \.self) { year in
                    Menu(String(year)) {
                        ForEach(months.filter { $0.hasPrefix(year) }.reversed(), id: \.self) { month in
                            Button(Day.month(month).monthName) { store.month = month }
                        }
                    }
                }
            }
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button("Previous month", systemImage: "chevron.left") {
                        if let index, index > 0 { store.month = months[index - 1] }
                    }
                    .disabled((index ?? 0) == 0)
                    Button("Next month", systemImage: "chevron.right") {
                        if let index, index + 1 < months.count { store.month = months[index + 1] }
                    }
                    .disabled(index.map { $0 + 1 >= months.count } ?? true)
                }
            }
    }
}

extension View {
    func monthPicker() -> some View { modifier(MonthPicker()) }
}

struct Loading: View {
    @Environment(Store.self) private var store

    var body: some View {
        if store.loading {
            ProgressView("Loading")
        } else {
            ContentUnavailableView {
                Label("No data", systemImage: "tray")
            } description: {
                Text(store.problem?.localizedDescription ?? "Pull to try again.")
            } actions: {
                Button("Try again") { Task { await store.reload() } }
            }
        }
    }
}

struct SessionBanner: View {
    @Environment(Store.self) private var store

    var body: some View {
        if case .signIn = store.problem, !store.isLocal {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Your session has ended", systemImage: "person.crop.circle.badge.exclamationmark")
                        .font(.headline)
                    Text("The figures below come from the last download. Sign in to get new data.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    SignInButton()
                }
                .padding(.vertical, 4)
            }
        }
    }
}

struct TxnRow: View {
    @Environment(Store.self) private var store
    let txn: Txn
    var showDate = false

    var body: some View {
        HStack(spacing: 12) {
            CategoryIcon(category: txn.category, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(txn.merchant)
                    .font(.body)
                    .lineLimit(1)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Amount(value: txn.amount)
                    .strikethrough(txn.excluded != nil)
                if txn.pending {
                    Text("Pending").font(.caption).foregroundStyle(.orange)
                } else if txn.excluded != nil {
                    Text("Not counted").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .opacity(txn.excluded == nil ? 1 : 0.55)
        .accessibilityElement(children: .combine)
    }

    private var subtitle: String {
        let label = store.data?.label(txn.category, txn.subcategory) ?? txn.category
        return showDate ? "\(txn.day.shortDay) · \(label)" : label
    }
}

struct ShareRow: View {
    let category: String
    let title: String
    let total: Double
    let share: Double?

    var body: some View {
        HStack(spacing: 12) {
            CategoryIcon(category: category)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(title).lineLimit(1)
                    Spacer()
                    Text(Money.kr(total)).monospacedDigit()
                }
                if let share {
                    ProgressView(value: share)
                        .tint(CategoryStyle.of(category).color)
                        .accessibilityHidden(true)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

struct DeltaLabel: View {
    let delta: Double
    let compared: String
    var lowerIsGood = true

    var body: some View {
        let good = lowerIsGood ? delta <= 0 : delta >= 0
        Label {
            Text("\(Money.kr(abs(delta))) \(delta <= 0 ? "less" : "more") than \(compared)")
        } icon: {
            Image(systemName: delta <= 0 ? "arrow.down.right" : "arrow.up.right")
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(good ? .green : .red)
    }
}
