import SwiftUI

enum BulkFile: String { case payees, categories }

struct BulkPlan {
    let keys: [String]
    let matches: [Txn]
    let skipped: Int
    let outside: Int

    init(selected: [Txn], all: [Txn], file: BulkFile) {
        var keys: [String] = []
        var seen = Set<String>()
        for key in selected.compactMap({ Self.key($0, file) }) where seen.insert(key).inserted {
            keys.append(key)
        }
        let picked = Set(selected.map(\.id))
        self.keys = keys
        matches = all.filter { Self.key($0, file).map(seen.contains) ?? false }
        skipped = selected.filter { Self.key($0, file) == nil }.count
        outside = matches.filter { !picked.contains($0.id) }.count
    }

    static func key(_ txn: Txn, _ file: BulkFile) -> String? {
        guard txn.original != nil else { return nil }
        if file == .categories { return txn.remember }
        let text = "\(txn.description) \(txn.original ?? txn.payeeText) \(txn.remote ?? "")".lowercased()
        guard !text.ruleTrim.isEmpty else { return nil }
        var out = "/^"
        for scalar in text.unicodeScalars {
            switch scalar {
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case _ where ".*+?^${}()|[]\\".unicodeScalars.contains(scalar): out += "\\" + String(scalar)
            default: out.unicodeScalars.append(scalar)
            }
        }
        return out + "(?![\\s\\S])/"
    }
}

struct BulkSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    let file: BulkFile
    let txns: [Txn]
    @State private var plan: BulkPlan?
    @State private var merchants: [String] = []
    @State private var value = ""
    @State private var saving = false
    @State private var saved = false
    @State private var changedCount = 0
    @State private var failure: String?
    @State private var showMatches = false

    init(file: BulkFile, txns: [Txn]) {
        self.file = file
        self.txns = txns
    }

    private var rename: Bool { file == .payees }
    private var text: String { value.ruleTrim }

    var body: some View {
        NavigationStack {
            Group {
                if let plan {
                    if saved { confirmation } else { form(plan) }
                } else {
                    ProgressView()
                }
            }
            .navigationTitle(rename ? "Give them one name" : "Choose one category")
            .navigationBarTitleDisplayMode(.inline)
            .ruleRoutes()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if !saved {
                        Button("Cancel", systemImage: "xmark") { dismiss() }
                            .disabled(saving)
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saved {
                        Button("Done", systemImage: "checkmark") { dismiss() }
                    } else if saving {
                        ProgressView()
                    }
                }
            }
            .ruleAlert($failure)
        }
        .interactiveDismissDisabled(saving)
        .onAppear {
            guard plan == nil else { return }
            let all = store.data?.txns ?? []
            plan = BulkPlan(selected: txns, all: all, file: file)
            merchants = Array(Set(all.compactMap { $0.unnamed == true ? nil : $0.merchant })).sorted()
        }
    }

    private func changed(_ plan: BulkPlan) -> Int {
        plan.matches.filter { (rename ? $0.merchant : $0.pair) != text }.count
    }

    private func tooLarge(_ plan: BulkPlan) -> Bool {
        Query.encode([("file", file.rawValue), ("value", text)] + plan.keys.map { ("key", $0) })
            .replacingOccurrences(of: "%20", with: "+")
            .count > 7000
    }

    private func form(_ plan: BulkPlan) -> some View {
        let names = Array(NSOrderedSet(array: txns.map(\.merchant))) as? [String] ?? []
        let changes = changed(plan)
        let stale = txns.contains { $0.original == nil }
        let large = tooLarge(plan)
        let ready = !text.isEmpty && !plan.keys.isEmpty && changes > 0 && !stale && !large && !saving
        let suggestions = text.isEmpty ? [] : merchants.filter { $0 != value && $0.localizedCaseInsensitiveContains(text) }.prefix(5)
        return Form {
            Section("\(names.count) payee name(s) → one \(rename ? "name" : "category")") {
                Text(names.joined(separator: " · "))
                    .font(.subheadline)
                    .lineLimit(6)
            }
            Section {
                if rename {
                    TextField("Enter one name for these payees", text: $value)
                        .disabled(saving)
                    ForEach(Array(suggestions), id: \.self) { name in
                        Button(name, systemImage: "arrow.up.left") { value = name }
                            .tint(.primary)
                    }
                } else {
                    CategoryField(title: "New category", value: value) { value = $0 }
                        .disabled(saving)
                }
            } header: {
                Text(rename ? "New payee name" : "New category")
            } footer: {
                Text(rename
                    ? "Match the complete imported description, payee, and recipient account. New names take priority over existing payee patterns. Save rules for matching past and future transactions. Filters do not limit these rules."
                    : "Match the imported payee name. New categories take priority over existing category patterns. Exclusions still apply. Save rules for matching past and future transactions. Filters do not limit these rules.")
            }
            Section {
                HStack {
                    stat(plan.matches.count, "matching")
                    Spacer()
                    stat(plan.outside, "outside selection")
                    Spacer()
                    stat(text.isEmpty ? 0 : changes, "changes")
                }
                if plan.outside > 0 {
                    Text("This also changes matching transactions outside your selection. Review all matches below.")
                        .font(.subheadline)
                }
                DisclosureGroup("Review \(plan.matches.count) matching transactions", isExpanded: $showMatches) {
                    ForEach(plan.matches) { txn in
                        NavigationLink(value: txn) { TxnRow(txn: txn, showDate: true) }
                    }
                }
            }
            if plan.skipped > 0 || stale || large {
                Section {
                    if plan.skipped > 0 {
                        Label("\(plan.skipped) selected transaction(s) cannot change\(rename ? "." : " because of exclusions or missing payment details.")", systemImage: "info.circle")
                    }
                    if stale {
                        Label("Rebuild saved transactions from the Rules page before using bulk actions.", systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.orange)
                    }
                    if large {
                        Label("This selection contains too many different conditions. Select fewer transactions for one edit.", systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.orange)
                    }
                }
                .font(.subheadline)
            }
            Section {
                Button {
                    Task { await apply(plan, changes: changes) }
                } label: {
                    Text("Apply to \(plan.matches.count) transactions").frame(maxWidth: .infinity)
                }
                .disabled(!ready)
            }
        }
    }

    private var confirmation: some View {
        Form {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Label(rename ? "Payee names saved." : "Categories saved.", systemImage: "checkmark.circle.fill")
                        .font(.headline)
                        .foregroundStyle(.green)
                    Text("\(changedCount) transaction(s) change to \(rename ? text : store.data?.pairLabel(text) ?? text).")
                    Text("Use rule history to undo this entire edit.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }
            Section {
                Button("Undo this edit", systemImage: "arrow.uturn.backward") {
                    Task {
                        saving = true
                        failure = await store.rule("undo", [("file", file.rawValue)])
                        saving = false
                        if failure == nil { dismiss() }
                    }
                }
                .disabled(saving)
                Button("Done", systemImage: "checkmark") { dismiss() }
            }
        }
    }

    private func stat(_ count: Int, _ label: String) -> some View {
        Text("\(Text("\(count)").bold()) \(label)")
            .font(.subheadline)
            .monospacedDigit()
    }

    private func apply(_ plan: BulkPlan, changes: Int) async {
        saving = true
        defer { saving = false }
        let next = text
        if let error = await store.bulk(file.rawValue, keys: plan.keys, value: next) {
            failure = error
            return
        }
        changedCount = changes
        saved = true
        switch file {
        case .payees:
            if !store.filters.merchants.isEmpty, !store.filters.merchants.contains(next) { store.filters.merchants.append(next) }
        case .categories:
            if !store.filters.categories.isEmpty, !store.filters.categories.contains(next) { store.filters.categories.append(next) }
        }
    }
}
