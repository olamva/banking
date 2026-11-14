import SwiftUI

enum RuleFile: String, CaseIterable, Identifiable {
    case categories, giro, payees, labels, countries, items, family, subscriptions
    case notSubscriptions = "not-subscriptions"

    var id: String { rawValue }
    var isMap: Bool { [.categories, .giro, .payees, .labels, .countries, .items].contains(self) }
    var categoryValued: Bool { self == .categories || self == .giro }
    var grouped: Bool { isMap && self != .labels }

    var label: String {
        switch self {
        case .categories: "Categories"
        case .giro: "Giro"
        case .payees: "Payee names"
        case .countries: "Countries"
        case .items: "Item names"
        case .labels: "Category names"
        case .family: "Family"
        case .subscriptions: "Subscriptions"
        case .notSubscriptions: "Not subscriptions"
        }
    }

    var note: String {
        switch self {
        case .categories: "Pattern to category, unless an exclusion applies. Add a payment type, direction or recipient account to narrow a rule. A rule with more conditions wins."
        case .giro: "Pattern to category, on a lump only. A giro or a plain Overførsel, never an instant payment."
        case .payees: "Pattern to the name on the page. A rename can never move money, so this file is safe to edit."
        case .countries: "Pattern to the country on the row. It beats the country the code reads off the card name."
        case .items: "Receipt line name to the name on the Items page. Items with the same name show as one item."
        case .labels: "Slug to the name on the page. Write the slug as category/sub."
        case .family: "A relative, by name or by account number. Money in is from family. Money out is a repayment."
        case .subscriptions: "A pattern that makes a subscription certain."
        case .notSubscriptions: "A pattern that denies the guess the bank made."
        }
    }

    var keyLabel: String {
        switch self {
        case .labels: "Slug"
        case .family: "Name or account number"
        default: "Pattern"
        }
    }

    var valueLabel: String {
        switch self {
        case .categories, .giro: "Category"
        case .payees, .items, .labels: "Name"
        case .countries: "Country"
        default: ""
        }
    }
}

enum RuleKey {
    static func make(pattern: String, type: String?, direction: String?, account: String?) -> String {
        guard type != nil || direction != nil || account != nil else { return pattern }
        let fields: [(String, String?)] = [("pattern", pattern), ("type", type), ("direction", direction), ("account", account)]
        return "{" + fields.compactMap { name, value in value.map { "\"\(name)\":\(json($0))" } }.joined(separator: ",") + "}"
    }

    static func json(_ text: String) -> String {
        var out = "\""
        for scalar in text.unicodeScalars {
            switch scalar {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\u{8}": out += "\\b"
            case "\u{C}": out += "\\f"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            case _ where scalar.value < 0x20: out += String(format: "\\u%04x", scalar.value)
            default: out.unicodeScalars.append(scalar)
            }
        }
        return out + "\""
    }
}

extension String {
    var ruleTrim: String { trimmingCharacters(in: .whitespacesAndNewlines) }
    var ruleLine: String { replacingOccurrences(of: "\r\n", with: " ").replacingOccurrences(of: "\n", with: " ").replacingOccurrences(of: "\r", with: " ") }
}

extension View {
    func ruleRoutes() -> some View {
        navigationDestination(for: Txn.self) { TxnView(txn: $0) }
            .navigationDestination(for: MerchantRoute.self) { MerchantView(name: $0.name) }
    }
}

struct MatchAnswer: Decodable {
    let rebuild: Bool
    let count: Int
    let txns: [Txn]
}

struct MatchPreview: View {
    @Environment(Store.self) private var store
    let key: String
    @State private var checked: String?
    @State private var answer: MatchAnswer?
    @State private var failure: String?
    @State private var open = false

    var body: some View {
        if !key.ruleTrim.isEmpty {
            let loading = checked != key
            status(loading: loading)
                .task(id: key) { await check(key) }
            if !loading, failure == nil, let answer, !answer.rebuild, answer.count > 0 {
                DisclosureGroup("Show matching transactions", isExpanded: $open) {
                    ForEach(Array(answer.txns.enumerated()), id: \.offset) { _, txn in
                        NavigationLink { TxnView(txn: txn) } label: { TxnRow(txn: txn, showDate: true) }
                    }
                    if answer.count > answer.txns.count {
                        Text("Shows the newest \(answer.txns.count).")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    @ViewBuilder private func status(loading: Bool) -> some View {
        if loading {
            Label { Text("Checking matches…") } icon: { ProgressView() }
                .foregroundStyle(.secondary)
        } else if let failure {
            Label(failure, systemImage: "exclamationmark.triangle")
                .foregroundStyle(.red)
        } else if answer?.rebuild == true {
            Label("Rebuild saved transactions to preview matches.", systemImage: "info.circle")
                .foregroundStyle(.secondary)
        } else {
            Label("Matches \(answer?.count ?? 0) transaction(s) on record.", systemImage: "info.circle")
                .foregroundStyle(.secondary)
        }
    }

    private func check(_ key: String) async {
        try? await Task.sleep(for: .milliseconds(300))
        guard !Task.isCancelled else { return }
        do {
            let found = try await store.load(MatchAnswer.self, "api/app/match", [("key", key)])
            guard !Task.isCancelled else { return }
            answer = found
            failure = nil
        } catch {
            guard !Task.isCancelled else { return }
            answer = nil
            failure = error.localizedDescription
        }
        checked = key
    }
}

struct CategoryField: View {
    @Environment(Store.self) private var store
    let title: String
    let value: String
    let onPick: (String) -> Void

    var body: some View {
        NavigationLink {
            CategoryChoice(selected: value, onPick: onPick)
        } label: {
            LabeledContent(title) {
                Text(value.isEmpty ? "Choose" : store.data?.pairLabel(value) ?? value)
                    .lineLimit(2)
            }
        }
    }
}

struct CategoryChoice: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    let selected: String
    let onPick: (String) -> Void
    @State private var query = ""

    var body: some View {
        let typed = query.ruleTrim
        List {
            if !typed.isEmpty, store.data?.labels[typed] == nil {
                Button("Use \(typed)", systemImage: "plus") { pick(typed) }
            }
            ForEach(choices, id: \.pair) { choice in
                Button {
                    pick(choice.pair)
                } label: {
                    HStack(spacing: 12) {
                        CategoryIcon(category: String(choice.pair.split(separator: "/").first ?? ""), size: 26)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(choice.title)
                            Text(choice.pair).font(.caption.monospaced()).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if selected == choice.pair { Image(systemName: "checkmark").foregroundStyle(.green) }
                    }
                }
                .tint(.primary)
            }
        }
        .searchable(text: $query, prompt: "Find a category")
        .navigationTitle("Category")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var choices: [(pair: String, title: String)] {
        guard let data = store.data else { return [] }
        let words = query.lowercased().split(separator: " ")
        return data.labels.keys
            .map { (pair: $0, title: data.pairLabel($0)) }
            .filter { choice in words.allSatisfy { choice.title.lowercased().contains($0) || choice.pair.lowercased().contains($0) } }
            .sorted { $0.title < $1.title }
    }

    private func pick(_ pair: String) {
        onPick(pair)
        dismiss()
    }
}

struct RuleSheet: View {
    enum Direction: String, CaseIterable {
        case any, out, `in`

        var title: String {
            switch self {
            case .any: "Any"
            case .out: "Money out"
            case .in: "Money in"
            }
        }
    }

    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    let file: RuleFile
    let txn: Txn
    @State private var pattern: String
    @State private var value: String
    @State private var type = ""
    @State private var direction = Direction.any
    @State private var account = ""
    @State private var saving = false
    @State private var failure: String?

    init(file: RuleFile, txn: Txn) {
        self.file = file
        self.txn = txn
        let chunk = (txn.description.split(separator: ",", omittingEmptySubsequences: false).first.map(String.init) ?? txn.description).ruleTrim.lowercased()
        _pattern = State(initialValue: (file == .categories ? txn.remember : nil) ?? chunk)
        let value: String = switch file {
        case .categories, .giro: txn.pair
        case .payees: txn.payeeText
        case .countries: txn.country ?? ""
        default: ""
        }
        _value = State(initialValue: value)
    }

    private var key: String {
        guard file == .categories else { return pattern.ruleTrim }
        return RuleKey.make(
            pattern: pattern.ruleTrim,
            type: type.ruleTrim.isEmpty ? nil : type.ruleTrim,
            direction: direction == .any ? nil : direction.rawValue,
            account: account.ruleTrim.isEmpty ? nil : account.ruleTrim
        )
    }

    private var ready: Bool { !pattern.ruleTrim.isEmpty && (!file.isMap || !value.ruleTrim.isEmpty) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(file.note).font(.subheadline).foregroundStyle(.secondary)
                }
                Section(file.keyLabel) {
                    TextField(file.keyLabel, text: $pattern, axis: .vertical)
                        .font(.body.monospaced())
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onChange(of: pattern) { _, text in if text.ruleLine != text { pattern = text.ruleLine } }
                }
                if file == .categories {
                    Section("Conditions") {
                        LabeledContent("Payment type") {
                            TextField("Payment type", text: $type, prompt: Text(txn.type ?? "Any"))
                                .multilineTextAlignment(.trailing)
                                .font(.body.monospaced())
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        }
                        Picker("Direction", selection: $direction) {
                            ForEach(Direction.allCases, id: \.self) { Text($0.title).tag($0) }
                        }
                        LabeledContent("Recipient account") {
                            TextField("Recipient account", text: $account, prompt: Text(txn.remote ?? "Any"))
                                .multilineTextAlignment(.trailing)
                                .font(.body.monospaced())
                                .keyboardType(.numbersAndPunctuation)
                                .autocorrectionDisabled()
                        }
                    }
                }
                Section {
                    MatchPreview(key: key)
                }
                if file.isMap {
                    Section(file.valueLabel) {
                        if file.categoryValued {
                            CategoryField(title: file.valueLabel, value: value) { value = $0 }
                        } else {
                            TextField(file.valueLabel, text: $value)
                        }
                    }
                }
            }
            .navigationTitle(file.label)
            .navigationBarTitleDisplayMode(.inline)
            .ruleRoutes()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button("Save", systemImage: "checkmark") { Task { await save() } }
                            .disabled(!ready)
                    }
                }
            }
            .alert("Save failed", isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } })) {
                Button("OK") { failure = nil }
            } message: {
                Text(failure ?? "")
            }
        }
        .interactiveDismissDisabled(saving)
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let query = [("file", file.rawValue), ("key", key)] + (file.isMap ? [("value", value.ruleTrim)] : [])
        if let error = await store.rule("save", query) {
            failure = error
            return
        }
        dismiss()
    }
}
