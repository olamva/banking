import SwiftUI

enum RuleEntries: Decodable {
    case map([String: String])
    case list([String])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let list = try? container.decode([String].self) {
            self = .list(list)
        } else {
            self = .map(try container.decode([String: String].self))
        }
    }

    var entries: [(key: String, value: String?)] {
        switch self {
        case .map(let map): map.sorted { $0.key.localizedStandardCompare($1.key) == .orderedAscending }.map { ($0.key, $0.value) }
        case .list(let list): list.map { ($0, nil) }
        }
    }

    var count: Int {
        switch self {
        case .map(let map): map.count
        case .list(let list): list.count
        }
    }
}

struct RuleChange: Decodable {
    let key: String
    let from: String?
    let to: String?
}

struct RuleVersion: Decodable {
    let at: Int
    let changes: [RuleChange]
}

struct RuleGroup: Decodable {
    let title: String
    let files: [String]

    init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        title = try container.decode(String.self)
        files = try container.decode([String].self)
    }
}

struct ReviewItem: Decodable {
    let key: String?
    let guessed: Bool
    let count: Int
    let txn: Txn
}

struct RuleConflict: Decodable {
    let file: String
    let winner: String
    let winnerValue: String
    let loser: String
    let loserValue: String
    let rows: Int
    let examples: [String]
}

struct RulesPayload: Decodable {
    let files: [String: RuleEntries]
    let history: [String: [RuleVersion]]
    let at: [String: Int?]
    let groups: [RuleGroup]
    let rebuild: Bool
    let review: [ReviewItem]
    let conflicts: [RuleConflict]
}

@MainActor @Observable final class RulesModel {
    var payload: RulesPayload?
    var problem: String?
    var busy = false

    func load(_ store: Store) async {
        do {
            payload = try await store.load(RulesPayload.self, "api/app/rules")
            problem = nil
        } catch {
            problem = error.localizedDescription
        }
    }

    func run(_ store: Store, _ action: String, _ query: [(String, String)]) async -> String? {
        busy = true
        defer { busy = false }
        let error = await store.rule(action, query)
        await load(store)
        return error
    }
}

extension View {
    func ruleAlert(_ failure: Binding<String?>) -> some View {
        alert("The rule edit failed", isPresented: Binding(get: { failure.wrappedValue != nil }, set: { if !$0 { failure.wrappedValue = nil } })) {
            Button("OK") { failure.wrappedValue = nil }
        } message: {
            Text(failure.wrappedValue ?? "")
        }
    }
}

struct RulesView: View {
    @Environment(Store.self) private var store
    @State private var model = RulesModel()
    @State private var failure: String?

    init() {}

    var body: some View {
        List {
            if let payload = model.payload {
                if payload.rebuild {
                    Section {
                        Text("Rebuild saved transactions to use the original payee text. This does not contact the bank.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Button("Rebuild saved transactions", systemImage: "arrow.triangle.2.circlepath") {
                            Task { failure = await model.run(store, "rebuild", []) }
                        }
                        .disabled(model.busy)
                    } header: {
                        Label("Rebuild needed", systemImage: "exclamationmark.triangle")
                    }
                }
                Section("Checks") {
                    let guessed = payload.review.filter(\.guessed).count
                    NavigationLink { RuleReviewView(model: model) } label: {
                        LabeledContent {
                            Text("\(guessed)").monospacedDigit().foregroundStyle(guessed > 0 ? Color.orange : Color.secondary)
                        } label: {
                            Label("Review", systemImage: "exclamationmark.triangle")
                        }
                    }
                    NavigationLink { RuleConflictsView(model: model) } label: {
                        LabeledContent {
                            Text("\(payload.conflicts.count)").monospacedDigit().foregroundStyle(payload.conflicts.isEmpty ? Color.secondary : Color.red)
                        } label: {
                            Label("Conflicts", systemImage: "exclamationmark.octagon")
                        }
                    }
                }
                ForEach(payload.groups, id: \.title) { group in
                    Section(group.title) {
                        ForEach(group.files.compactMap(RuleFile.init(rawValue:))) { file in
                            NavigationLink { RuleFileView(model: model, file: file) } label: {
                                LabeledContent(file.label) {
                                    Text("\(payload.files[file.rawValue]?.count ?? 0)").monospacedDigit()
                                }
                            }
                        }
                    }
                }
            }
        }
        .overlay {
            if model.payload == nil {
                if let problem = model.problem {
                    ContentUnavailableView {
                        Label("No rules", systemImage: "list.bullet.rectangle")
                    } description: {
                        Text(problem)
                    } actions: {
                        Button("Try again") { Task { await model.load(store) } }
                    }
                } else {
                    ProgressView("Loading")
                }
            }
        }
        .navigationTitle("Rules")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.load(store) }
        .task { if model.payload == nil { await model.load(store) } }
        .ruleRoutes()
        .ruleAlert($failure)
    }
}

struct CommitField: View {
    let title: String
    let initial: String
    var mono = true
    var secondary = false
    let onCommit: (String) -> Void
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        TextField(title, text: $text, axis: .vertical)
            .font(mono ? .body.monospaced() : .body)
            .foregroundStyle(secondary ? Color.secondary : Color.primary)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .focused($focused)
            .onAppear { text = initial }
            .onChange(of: initial) { _, value in text = value }
            .onChange(of: text) { _, value in
                guard value.contains(where: \.isNewline) else { return }
                text = value.ruleLine
                focused = false
            }
            .onChange(of: focused) { _, now in if !now { commit() } }
    }

    private func commit() {
        let next = text.ruleTrim
        if next.isEmpty || next == initial {
            text = initial
        } else {
            onCommit(next)
        }
    }
}

struct RuleFileView: View {
    @Environment(Store.self) private var store
    let model: RulesModel
    let file: RuleFile
    @State private var find = ""
    @State private var newKey = ""
    @State private var newValue = ""
    @State private var failure: String?
    @State private var addingTo: String?
    @State private var addText = ""

    var body: some View {
        let entries = model.payload?.files[file.rawValue]?.entries ?? []
        let needle = find.ruleTrim.lowercased()
        let shown = needle.isEmpty ? entries : entries.filter { $0.key.lowercased().contains(needle) || ($0.value ?? "").lowercased().contains(needle) }
        let groups = groupsOf(entries).filter { value, keys in
            needle.isEmpty || value.lowercased().contains(needle) || keys.contains { $0.lowercased().contains(needle) }
        }
        let versions = model.payload?.history[file.rawValue]?.count ?? 0
        List {
            Section {
                Text(file.note).font(.subheadline).foregroundStyle(.secondary)
                NavigationLink { RuleHistoryView(model: model, file: file) } label: {
                    LabeledContent {
                        Text("\(versions)").monospacedDigit()
                    } label: {
                        Label("History", systemImage: "clock.arrow.circlepath")
                    }
                }
            }
            if needle.isEmpty { newRule }
            if needle.isEmpty, entries.isEmpty, model.payload != nil {
                Section { Text("No rules in this file yet.").foregroundStyle(.secondary) }
            } else if file.grouped {
                ForEach(groups, id: \.value) { value, keys in
                    groupSection(value: value, keys: keys)
                }
            } else {
                Section("\(entries.count) rule(s)") {
                    ForEach(shown, id: \.key) { key, value in
                        VStack(alignment: .leading, spacing: 4) {
                            CommitField(title: file.keyLabel, initial: key) { next in
                                edit("save", [("file", file.rawValue), ("key", next), ("was", key)] + (value.map { [("value", $0)] } ?? []))
                            }
                            if let value {
                                CommitField(title: file.valueLabel, initial: value, mono: false, secondary: true) { next in
                                    edit("save", [("file", file.rawValue), ("key", key), ("value", next)])
                                }
                            }
                        }
                    }
                    .onDelete { offsets in
                        for index in offsets { remove(shown[index].key) }
                    }
                }
            }
        }
        .overlay {
            if !needle.isEmpty, file.grouped ? groups.isEmpty : shown.isEmpty {
                ContentUnavailableView("No rule matches that.", systemImage: "magnifyingglass")
            }
        }
        .searchable(text: $find, prompt: "Find a rule")
        .navigationTitle(file.label)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.load(store) }
        .ruleAlert($failure)
        .alert("Add a pattern", isPresented: Binding(get: { addingTo != nil }, set: { if !$0 { addingTo = nil } })) {
            TextField(file.keyLabel, text: $addText)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Button("Add") {
                let key = addText.ruleTrim
                if let value = addingTo, !key.isEmpty {
                    edit("save", [("file", file.rawValue), ("key", key), ("value", value)])
                }
                addText = ""
                addingTo = nil
            }
            Button("Cancel", role: .cancel) {
                addText = ""
                addingTo = nil
            }
        } message: {
            Text(addingTo.map { "The pattern maps to \(label($0))." } ?? "")
        }
    }

    private var newRule: some View {
        Section {
            TextField(file.keyLabel, text: $newKey, axis: .vertical)
                .font(.body.monospaced())
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onChange(of: newKey) { _, text in if text.ruleLine != text { newKey = text.ruleLine } }
            if file.isMap {
                if file.categoryValued {
                    CategoryField(title: file.valueLabel, value: newValue) { newValue = $0 }
                } else {
                    TextField(file.valueLabel, text: $newValue)
                }
            }
            if file != .items { MatchPreview(key: newKey.ruleTrim) }
            Button("Add", systemImage: "plus") {
                let query = [("file", file.rawValue), ("key", newKey.ruleTrim)] + (file.isMap ? [("value", newValue.ruleTrim)] : [])
                Task {
                    if let error = await model.run(store, "save", query) {
                        failure = error
                    } else {
                        newKey = ""
                        newValue = ""
                    }
                }
            }
            .disabled(newKey.ruleTrim.isEmpty || (file.isMap && newValue.ruleTrim.isEmpty) || model.busy)
        } header: {
            Text("New rule")
        }
    }

    private func groupSection(value: String, keys: [String]) -> some View {
        Section {
            if file.categoryValued {
                CategoryField(title: file.valueLabel, value: value) { next in
                    rename(keys: keys, from: value, to: next)
                }
            } else {
                CommitField(title: file.valueLabel, initial: value, mono: false) { next in
                    rename(keys: keys, from: value, to: next)
                }
                .fontWeight(.semibold)
            }
            ForEach(keys, id: \.self) { key in
                CommitField(title: file.keyLabel, initial: key, secondary: true) { next in
                    edit("save", [("file", file.rawValue), ("key", next), ("value", value), ("was", key)])
                }
            }
            .onDelete { offsets in
                for index in offsets { remove(keys[index]) }
            }
            Button("Add pattern", systemImage: "plus") { addingTo = value }
                .disabled(model.busy)
        }
    }

    private func label(_ value: String) -> String {
        file.categoryValued ? store.data?.pairLabel(value) ?? value : value
    }

    private func groupsOf(_ entries: [(key: String, value: String?)]) -> [(value: String, keys: [String])] {
        var groups: [String: [String]] = [:]
        for (key, value) in entries {
            guard let value else { continue }
            groups[value, default: []].append(key)
        }
        return groups
            .map { (value: $0.key, keys: $0.value) }
            .sorted { label($0.value).localizedStandardCompare(label($1.value)) == .orderedAscending }
    }

    private func rename(keys: [String], from: String, to next: String) {
        guard !next.isEmpty, next != from else { return }
        edit("group", [("file", file.rawValue), ("value", next)] + keys.map { ("key", $0) })
    }

    private func remove(_ key: String) {
        edit("save", [("file", file.rawValue), ("key", key), ("remove", "1")])
    }

    private func edit(_ action: String, _ query: [(String, String)]) {
        Task { failure = await model.run(store, action, query) }
    }
}

struct RuleHistoryView: View {
    @Environment(Store.self) private var store
    let model: RulesModel
    let file: RuleFile
    @State private var failure: String?

    private static let stamp = Date.FormatStyle(date: .abbreviated, time: .shortened, locale: Locale(identifier: "nb_NO"), timeZone: TimeZone(identifier: "Europe/Oslo")!)

    var body: some View {
        let versions = model.payload?.history[file.rawValue] ?? []
        let at = model.payload?.at[file.rawValue] ?? nil
        let here = versions.firstIndex { $0.at == at } ?? -1
        let ahead = max(here, 0)
        List {
            if ahead > 0 {
                Section {
                    Label("The next edit drops \(ahead) version(s) above this point.", systemImage: "info.circle")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            Section {
                ForEach(Array(versions.enumerated()), id: \.element.at) { index, version in
                    row(version, now: version.at == at)
                        .opacity(index < ahead ? 0.5 : 1)
                }
            }
        }
        .overlay {
            if versions.isEmpty { ContentUnavailableView("No history", systemImage: "clock") }
        }
        .navigationTitle("History")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.load(store) }
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button("Undo", systemImage: "arrow.uturn.backward") { act("undo", []) }
                    .disabled(model.busy || here + 1 >= versions.count)
                Button("Redo", systemImage: "arrow.uturn.forward") { act("redo", []) }
                    .disabled(model.busy || ahead == 0)
            }
        }
        .ruleAlert($failure)
    }

    private func row(_ version: RuleVersion, now: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(Date(timeIntervalSince1970: Double(version.at) / 1000).formatted(Self.stamp))
                    .font(.subheadline.weight(now ? .semibold : .regular))
                    .foregroundStyle(now ? Color.primary : Color.secondary)
                if now {
                    Text("Now")
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 1)
                        .background(Color.accentColor, in: .capsule)
                        .foregroundStyle(.white)
                }
            }
            if version.changes.isEmpty {
                Text("First version.").font(.caption).foregroundStyle(.secondary)
            } else {
                ForEach(version.changes.prefix(6), id: \.key) { change in
                    Text(describe(change))
                        .font(.caption.monospaced())
                        .foregroundStyle(change.to == nil ? Color.red : Color.primary)
                }
                if version.changes.count > 6 {
                    Text("and \(version.changes.count - 6) more line(s).").font(.caption).foregroundStyle(.secondary)
                }
            }
            if !now {
                Button("Go to this version", systemImage: "clock.arrow.circlepath") {
                    act("restore", [("at", String(version.at))])
                }
                .buttonStyle(.borderless)
                .font(.subheadline)
                .disabled(model.busy)
            }
        }
        .padding(.vertical, 2)
    }

    private func describe(_ change: RuleChange) -> String {
        guard let to = change.to else { return "− \(change.key)" }
        guard let from = change.from else { return to.isEmpty ? "+ \(change.key)" : "+ \(change.key) → \(to)" }
        return "\(change.key): \(from) → \(to)"
    }

    private func act(_ action: String, _ query: [(String, String)]) {
        Task { failure = await model.run(store, action, [("file", file.rawValue)] + query) }
    }
}

struct RuleReviewView: View {
    @Environment(Store.self) private var store
    let model: RulesModel
    @State private var search = ""
    @State private var limit = 30
    @State private var chosen: Txn?

    var body: some View {
        let review = Array((model.payload?.review ?? []).enumerated())
        let needle = search.ruleTrim.lowercased()
        let shown = review.filter { "\($0.element.txn.payeeText) \($0.element.txn.original ?? "")".lowercased().contains(needle) || needle.isEmpty }
        List {
            Section {
                Text("These payees have no category rule. The bank or a guess sets their category. Save a category rule to confirm one. Guessed categories come first.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Section {
                ForEach(shown.prefix(limit), id: \.offset) { _, item in
                    row(item)
                }
                if shown.count > limit {
                    Button("Show more payees") { limit += 30 }
                }
            } header: {
                Text("Payees to review")
            } footer: {
                Text("\(review.filter(\.element.guessed).count) guessed · \(review.count) in total")
            }
        }
        .overlay {
            if model.payload != nil, shown.isEmpty { ContentUnavailableView("No payees need review.", systemImage: "checkmark.circle") }
        }
        .searchable(text: $search, prompt: "Find a payee")
        .onChange(of: search) { limit = 30 }
        .navigationTitle("Review")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.load(store) }
        .sheet(item: $chosen, onDismiss: { Task { await model.load(store) } }) { RuleSheet(file: .categories, txn: $0) }
    }

    private func row(_ item: ReviewItem) -> some View {
        let txn = item.txn
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    if item.guessed {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                            .accessibilityLabel("Guessed")
                    }
                    Text(txn.unnamed == true ? txn.description : txn.merchant).font(.body.weight(.medium))
                }
                Text("\(txn.source ?? "") · \(txn.type ?? "") · \(txn.amount < 0 ? "Money out" : "Money in")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("\(store.data?.label(txn.category, txn.subcategory) ?? txn.pair) · \(item.count) transaction(s) · \(txn.date)")
                    .font(.caption)
            }
            Spacer(minLength: 8)
            Button("Review") { chosen = txn }
                .buttonStyle(.bordered)
                .disabled(model.busy)
        }
    }
}

struct RuleConflictsView: View {
    @Environment(Store.self) private var store
    let model: RulesModel

    var body: some View {
        let conflicts = model.payload?.conflicts ?? []
        List {
            Section {
                Text("These rules assign different values to the same transactions. They have the same number of conditions, so the first matching rule wins. Narrow a pattern to fix a conflict.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Section("\(conflicts.count) conflict(s)") {
                ForEach(Array(conflicts.enumerated()), id: \.offset) { _, conflict in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(RuleFile(rawValue: conflict.file)?.label ?? conflict.file)
                            .font(.caption.weight(.medium))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(.quaternary, in: .capsule)
                        Text("\(Text(conflict.winner).monospaced()) → \(conflict.winnerValue)")
                            .font(.subheadline)
                        Text("Overrides \(Text(conflict.loser).monospaced()) → \(conflict.loserValue)")
                            .font(.subheadline)
                        Text("\(conflict.rows) matching transaction(s): \(conflict.examples.joined(separator: ", "))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 2)
                }
            }
        }
        .overlay {
            if model.payload != nil, conflicts.isEmpty { ContentUnavailableView("No rules conflict.", systemImage: "checkmark.circle") }
        }
        .navigationTitle("Conflicts")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.load(store) }
    }
}
