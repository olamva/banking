import SwiftUI

extension View {
    func filtering(_ filters: Bool = true, search: Bool = true) -> some View { modifier(Filtering(filters: filters, search: search)) }
}

extension AppData {
    func filterLabel(_ axis: Axis, _ value: String) -> String {
        switch axis {
        case .categories:
            guard let cut = value.firstIndex(of: "/") else { return label(value) }
            let category = String(value[..<cut])
            let sub = String(value[value.index(after: cut)...])
            return "\(label(category)) › \(sub.isEmpty ? "Annet" : label(category, sub))"
        case .countries: return value == Filters.noCountry ? "No country" : value
        default: return value
        }
    }
}

struct Filtering: ViewModifier {
    @Environment(Store.self) private var store
    let filters: Bool
    let search: Bool
    @State private var choosing = false
    @State private var settings = false

    func body(content: Content) -> some View {
        content
            .safeAreaInset(edge: .top, spacing: 0) {
                if store.fetchingBank || store.refreshNote != nil || filters && (!store.filters.isEmpty || store.figuring || store.figureProblem != nil) {
                    FilterChips(filters: filters, search: search)
                }
            }
            .toolbar {
                ToolbarItemGroup(placement: .topBarLeading) {
                    Button("Settings", systemImage: "gearshape") { settings = true }
                    if filters {
                        Button("Filters", systemImage: store.filters.isEmpty ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill") { choosing = true }
                            .badge(store.filters.picks)
                    }
                }
            }
            .sheet(isPresented: $choosing) { FilterSheet() }
            .sheet(isPresented: $settings) { SettingsView() }
    }
}

struct FilterChips: View {
    @Environment(Store.self) private var store
    let filters: Bool
    let search: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if store.fetchingBank {
                Label {
                    Text("Refreshing from the bank…")
                } icon: {
                    ProgressView().controlSize(.small)
                }
                .font(.subheadline)
                .padding(.horizontal, 16)
                .padding(.top, 8)
            } else if let note = store.refreshNote {
                HStack(alignment: .firstTextBaseline) {
                    Label(note, systemImage: "building.columns").font(.subheadline)
                    Spacer(minLength: 8)
                    Button("Close", systemImage: "xmark") { store.refreshNote = nil }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.borderless)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            if filters { chips }
        }
        .background(.bar)
    }

    private var chips: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                if store.figuring {
                    ProgressView().controlSize(.small)
                } else if let problem = store.figureProblem {
                    Button {
                        store.figures()
                    } label: {
                        Label(problem, systemImage: "exclamationmark.arrow.circlepath").lineLimit(1)
                    }
                    .buttonStyle(.bordered)
                    .tint(.red)
                }
                ForEach(Axis.allCases) { axis in
                    ForEach(store.filters[axis, false], id: \.self) { value in
                        chip("\(axis.name): \(store.data?.filterLabel(axis, value) ?? value)", out: false) { store.filters.remove(axis, value) }
                    }
                    ForEach(store.filters[axis, true], id: \.self) { value in
                        chip("\(axis.name): not \(store.data?.filterLabel(axis, value) ?? value)", out: true) { store.filters.remove(axis, value) }
                    }
                }
                if search && !store.filters.search.isEmpty {
                    chip("Search: \(store.filters.search)", out: false) { store.filters.search = "" }
                }
                if store.filters.showExcluded {
                    chip("Excluded rows", out: false) { store.filters.showExcluded = false }
                }
                if !store.filters.isEmpty {
                    Button("Reset", systemImage: "xmark.circle") { store.filters = Filters() }
                        .buttonStyle(.borderless)
                        .font(.subheadline)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .scrollIndicators(.hidden)
    }

    private func chip(_ text: String, out: Bool, remove: @escaping () -> Void) -> some View {
        Button(action: remove) {
            HStack(spacing: 4) {
                Text(text).strikethrough(out).lineLimit(1)
                Image(systemName: "xmark").font(.caption2.weight(.bold))
            }
            .font(.subheadline)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(out ? AnyShapeStyle(Color.red.opacity(0.15)) : AnyShapeStyle(.fill.secondary), in: .capsule)
            .foregroundStyle(out ? Color.red : Color.primary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Remove \(text)")
    }
}

struct FilterSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        @Bindable var store = store
        let options = FilterOptions(rows: store.periodRows, filters: store.filters, data: store.data)
        NavigationStack {
            List {
                Section {
                    ForEach(Axis.allCases) { axis in
                        NavigationLink {
                            AxisPicker(axis: axis, options: options)
                        } label: {
                            LabeledContent {
                                Text(summary(axis))
                            } label: {
                                Label(axis.title, systemImage: axis.symbol)
                            }
                        }
                    }
                } footer: {
                    Text("Values within one filter combine with or. Different filters combine with and. A hidden value always wins.")
                }
                Section {
                    TextField("Merchant or bank text contains", text: $store.filters.search)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Search")
                }
                Section {
                    Toggle("Excluded rows", systemImage: "arrow.left.arrow.right", isOn: $store.filters.showExcluded)
                } footer: {
                    Text("Shows internal transfers and card bill payments in lists. They never count in totals.")
                }
                if !store.filters.isEmpty {
                    Section {
                        Button("Reset all filters", systemImage: "xmark.circle", role: .destructive) { store.filters = Filters() }
                    } footer: {
                        Text("The period stays.")
                    }
                }
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done", systemImage: "checkmark") { dismiss() }
                }
            }
        }
    }

    private func summary(_ axis: Axis) -> String {
        let (picked, hidden) = (store.filters[axis, false].count, store.filters[axis, true].count)
        let parts = [picked > 0 ? "\(picked) shown" : nil, hidden > 0 ? "\(hidden) hidden" : nil].compactMap { $0 }
        return parts.isEmpty ? "All" : parts.joined(separator: ", ")
    }
}

private enum Kind: String, CaseIterable {
    case all = "All", people = "People", businesses = "Businesses"
}

struct AxisPicker: View {
    @Environment(Store.self) private var store
    let axis: Axis
    let options: FilterOptions
    @State private var query = ""
    @State private var kind = Kind.all
    @State private var pinned: [String] = []
    @State private var open: Set<String> = []

    var body: some View {
        let values = shownValues
        List {
            if axis == .merchants {
                Picker("Merchants", selection: $kind) {
                    ForEach(Kind.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
            let picked = pinned.filter(matches)
            if !picked.isEmpty {
                Section("Selected") {
                    ForEach(picked, id: \.self) { row($0) }
                }
            }
            Section {
                ForEach(values.filter { !pinned.contains($0) }, id: \.self) { value in
                    if axis == .categories {
                        categoryRows(value)
                    } else {
                        row(value)
                    }
                }
            } footer: {
                Text("Tap once to show only matching rows. Tap again to hide them. Tap a third time to clear. Swipe for more.")
            }
        }
        .overlay {
            if values.isEmpty && pinned.filter(matches).isEmpty {
                ContentUnavailableView(query.isEmpty ? "Nothing in this period" : "No matches", systemImage: axis.symbol)
            }
        }
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search \(axis.title.lowercased())")
        .navigationTitle(axis.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !store.filters[axis, false].isEmpty || !store.filters[axis, true].isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Clear") {
                        store.filters[axis, false] = []
                        store.filters[axis, true] = []
                    }
                }
            }
        }
        .onAppear { pinned = store.filters[axis, false] + store.filters[axis, true] }
    }

    private var shownValues: [String] {
        let all = options.values(axis)
        let kept = axis == .merchants && kind != .all ? all.filter { options.people.contains($0) == (kind == .people) } : all
        guard axis == .categories, !query.isEmpty else { return kept.filter(matches) }
        return kept.filter { category in matches(category) || subs(category).contains(where: matches) }
    }

    private func label(_ value: String) -> String { store.data?.filterLabel(axis, value) ?? value }

    private func matches(_ value: String) -> Bool {
        query.isEmpty || label(value).localizedCaseInsensitiveContains(query)
    }

    private func subs(_ category: String) -> [String] {
        options.subcategories.filter { $0.hasPrefix("\(category)/") }
    }

    @ViewBuilder
    private func categoryRows(_ category: String) -> some View {
        let children = subs(category)
        if children.count > 1 {
            let expanded = Binding(
                get: { open.contains(category) || (!query.isEmpty && children.contains(where: matches)) },
                set: { if $0 { open.insert(category) } else { open.remove(category) } }
            )
            DisclosureGroup(isExpanded: expanded) {
                ForEach(children.filter { query.isEmpty || matches($0) || matches(category) }, id: \.self) { row($0) }
            } label: {
                row(category)
            }
        } else {
            row(category)
        }
    }

    private func row(_ value: String) -> some View {
        let state = store.filters.pick(axis, value)
        let text = axis == .categories && value.contains("/") ? String(label(value).split(separator: "›").last ?? "").trimmingCharacters(in: .whitespaces) : label(value)
        return Button {
            store.filters.cycle(axis, value)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: state == .included ? "checkmark.circle.fill" : state == .excluded ? "minus.circle.fill" : "circle")
                    .foregroundStyle(state == .included ? Color.accentColor : state == .excluded ? Color.red : Color.secondary)
                    .font(.title3)
                if axis == .categories && !value.contains("/") { CategoryIcon(category: value, size: 26) }
                Text(text)
                    .strikethrough(state == .excluded)
                    .foregroundStyle(state == .excluded ? Color.red : Color.primary)
                    .lineLimit(2)
            }
        }
        .tint(.primary)
        .accessibilityValue(state == .included ? "Shown" : state == .excluded ? "Hidden" : "Not set")
        .swipeActions(edge: .trailing) {
            Button("Hide", systemImage: "eye.slash") { store.filters.hide(axis, value) }
                .tint(.red)
        }
        .swipeActions(edge: .leading) {
            Button("Only", systemImage: "line.3.horizontal.decrease") { store.filters.only(axis, value) }
                .tint(.accentColor)
        }
    }
}

struct FilterActions: View {
    @Environment(Store.self) private var store
    let axis: Axis
    let value: String

    var body: some View {
        let name = store.data?.filterLabel(axis, value) ?? value
        let sole = store.filters[axis, false] == [value]
        Button(sole ? "Show all \(axis.title.lowercased())" : "Show only \(name)", systemImage: "line.3.horizontal.decrease") { store.filters.only(axis, value) }
        Button("Hide \(name)", systemImage: "eye.slash") { store.filters.hide(axis, value) }
    }
}
