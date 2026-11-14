import SwiftUI

struct SubscriptionsSection: View {
    let subscriptions: [Subscription]

    var body: some View {
        if !subscriptions.isEmpty {
            Section {
                ForEach(subscriptions.prefix(5), id: \.name) { SubscriptionRow(sub: $0) }
                if subscriptions.count > 5 {
                    NavigationLink("See all \(subscriptions.count)") { SubscriptionsView() }
                }
            } header: {
                Text("Subscriptions and recurring")
            } footer: {
                Text("\(subscriptions.count) found in this period.")
            }
        }
    }
}

private enum SubscriptionSort: String, CaseIterable, Identifiable {
    case name, category, count, latest, total, last

    var id: String { rawValue }

    var label: String {
        switch self {
        case .name: "Subscription"
        case .category: "Category"
        case .count: "Charges"
        case .latest: "Per month"
        case .total: "Total"
        case .last: "Last"
        }
    }

    var startsAscending: Bool { self == .name || self == .category }
}

struct SubscriptionsView: View {
    @Environment(Store.self) private var store
    @State private var search = ""
    @State private var sort = SubscriptionSort.total
    @State private var descending = true

    var body: some View {
        let subs = sorted
        List {
            if store.shown == nil {
                ProgressView("Loading")
            } else if subs.isEmpty {
                ContentUnavailableView(search.isEmpty ? "No subscriptions" : "No subscriptions match the search", systemImage: "repeat")
            }
            ForEach(subs, id: \.name) { SubscriptionRow(sub: $0) }
        }
        .searchable(text: $search, prompt: "Name or category")
        .navigationTitle("Subscriptions")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    ForEach(SubscriptionSort.allCases) { key in
                        Button {
                            if sort == key {
                                descending.toggle()
                            } else {
                                sort = key
                                descending = !key.startsAscending
                            }
                        } label: {
                            if sort == key {
                                Label(key.label, systemImage: descending ? "chevron.down" : "chevron.up")
                            } else {
                                Text(key.label)
                            }
                        }
                    }
                } label: {
                    Label("Sort", systemImage: "arrow.up.arrow.down")
                }
            }
        }
    }

    private func label(_ category: String) -> String { store.data?.label(category) ?? category }

    private var sorted: [Subscription] {
        let all = store.shown?.subscriptions ?? []
        let query = search.trimmingCharacters(in: .whitespaces)
        let found = query.isEmpty ? all : all.filter {
            $0.name.localizedCaseInsensitiveContains(query) || label($0.category).localizedCaseInsensitiveContains(query)
        }
        let ascending: (Subscription, Subscription) -> Bool = switch sort {
        case .name: { $0.name.localizedCompare($1.name) == .orderedAscending }
        case .category: { label($0.category).localizedCompare(label($1.category)) == .orderedAscending }
        case .count: { $0.count < $1.count }
        case .latest: { $0.latest < $1.latest }
        case .total: { $0.total < $1.total }
        case .last: { $0.last < $1.last }
        }
        return found.sorted { descending ? ascending($1, $0) : ascending($0, $1) }
    }
}

private struct SubscriptionRow: View {
    @Environment(Store.self) private var store
    let sub: Subscription

    var body: some View {
        let category = store.data?.label(sub.category) ?? sub.category
        NavigationLink(value: MerchantRoute(name: sub.name)) {
            HStack(spacing: 12) {
                CategoryIcon(category: sub.category)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text(sub.name).lineLimit(1)
                        Spacer(minLength: 8)
                        Text(Money.kr(sub.total)).monospacedDigit().layoutPriority(1)
                    }
                    Text("\(Money.kr(sub.latest)) per month · \(sub.count == 1 ? "1 charge" : "\(sub.count) charges")")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                        .lineLimit(1)
                    Text("\(category) · Last \(Day.date(sub.last).shortDay)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .accessibilityElement(children: .combine)
        }
        .drill(Drill(axis: .merchants, value: sub.name, name: sub.name), Drill(axis: .categories, value: sub.category, name: category))
    }
}
