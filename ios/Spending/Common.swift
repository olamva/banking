import SwiftUI

struct PeriodPicker: ViewModifier {
    @Environment(Store.self) private var store
    @State private var choosing = false

    func body(content: Content) -> some View {
        let selected = store.selected
        let steps = (selected?.kind == "year" ? store.data?.years : store.data?.months)?.map(\.key) ?? []
        let index = steps.firstIndex(of: selected?.key ?? "")
        content
            .navigationTitle(selected?.title ?? "Spending")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarTitleMenu {
                if let today = store.data?.today {
                    let month = String(today.prefix(7))
                    let year = String(today.prefix(4))
                    Button("This month", systemImage: "calendar.day.timeline.left") { store.period = month }
                        .disabled(store.lookup(month) == nil)
                    Button("This year", systemImage: "calendar") { store.period = year }
                        .disabled(store.lookup(year) == nil)
                }
                Button("All time", systemImage: "infinity") { store.period = "all" }
                Button("Custom range", systemImage: "calendar.badge.clock") { choosing = true }
                Divider()
                ForEach(store.data?.years.reversed() ?? []) { year in
                    Menu(year.key) {
                        Button("Whole year", systemImage: "calendar") { store.period = year.key }
                        Divider()
                        ForEach(store.data?.months.filter { $0.key.hasPrefix(year.key) }.reversed() ?? []) { month in
                            Button(month.date.monthName) { store.period = month.key }
                        }
                    }
                }
            }
            .toolbar {
                if let index {
                    ToolbarItemGroup(placement: .topBarTrailing) {
                        Button("Previous", systemImage: "chevron.left") { store.period = steps[index - 1] }
                            .disabled(index == 0)
                        Button("Next", systemImage: "chevron.right") { store.period = steps[index + 1] }
                            .disabled(index + 1 >= steps.count)
                    }
                }
            }
            .sheet(isPresented: $choosing) { RangeView() }
    }
}

extension View {
    func periodPicker() -> some View { modifier(PeriodPicker()) }
}

struct RangeView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var from = Date.now
    @State private var to = Date.now
    @State private var loading = false
    @State private var failure: String?

    var body: some View {
        let first = store.data?.txns.last.map(\.day) ?? .distantPast
        NavigationStack {
            Form {
                Section {
                    DatePicker("From", selection: $from, in: first...max(first, to), displayedComponents: .date)
                    DatePicker("To", selection: $to, in: from...max(from, .now), displayedComponents: .date)
                } footer: {
                    Text(failure ?? "The server sums a custom range. This needs a connection.")
                        .foregroundStyle(failure == nil ? Color.secondary : Color.red)
                }
            }
            .environment(\.timeZone, Day.calendar.timeZone)
            .navigationTitle("Custom range")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if loading {
                        ProgressView()
                    } else {
                        Button("Show", systemImage: "checkmark") {
                            Task {
                                loading = true
                                failure = await store.show("\(Day.key(from))..\(Day.key(to))")
                                loading = false
                                if failure == nil { dismiss() }
                            }
                        }
                    }
                }
            }
        }
        .presentationDetents([.medium])
        .onAppear {
            guard let selected = store.selected else { return }
            from = max(Day.date(selected.from), first)
            to = min(Day.date(selected.to), .now)
        }
    }
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
                if store.signedIn {
                    Button("Fetch from the bank") { Task { await store.fetchFromBank() } }
                        .disabled(store.fetchingBank)
                }
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

struct ValueRow: View {
    let title: String
    let detail: String
    let value: String
    var tint: Color = .secondary

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).lineLimit(1)
                Text(detail).font(.subheadline).foregroundStyle(.secondary).lineLimit(1).monospacedDigit()
            }
            Spacer(minLength: 8)
            Text(value).monospacedDigit().foregroundStyle(tint).layoutPriority(1)
        }
        .accessibilityElement(children: .combine)
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
