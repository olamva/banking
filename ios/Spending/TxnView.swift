import SwiftUI

struct TxnView: View {
    @Environment(Store.self) private var store
    let txn: Txn
    @State private var choosing = false
    @State private var saved: String?

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
            if txn.remember != nil {
                Section {
                    Button("Change category", systemImage: "tag") { choosing = true }
                    if let saved {
                        Label("Saved as \(saved).", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    }
                } footer: {
                    Text("Applies to matching past and future transactions.")
                }
            }
            if let receipt = txn.receipt { ReceiptSection(receipt: receipt) }
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
        .sheet(isPresented: $choosing) {
            if let key = txn.remember {
                RememberView(key: key, current: txn.pair) { saved = $0 }
            }
        }
    }
}

struct RememberView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    let key: String
    let current: String
    let onSaved: (String) -> Void
    @State private var value = ""
    @State private var query = ""
    @State private var saving = false
    @State private var failure: String?

    var body: some View {
        let matches = store.data?.txns.filter { $0.remember == key } ?? []
        NavigationStack {
            List {
                Section {
                    Text(key).font(.subheadline.monospaced())
                    Text("\(matches.count) matching transactions. \(matches.filter { $0.pair != value }.count) category changes.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } footer: {
                    Text("Saves a category pattern for this payee. It takes priority over existing category patterns. Exclusions still apply.")
                }
                Section("Category") {
                    ForEach(choices, id: \.pair) { choice in
                        Button {
                            value = choice.pair
                        } label: {
                            HStack(spacing: 12) {
                                CategoryIcon(category: String(choice.pair.split(separator: "/").first ?? ""), size: 26)
                                Text(choice.title)
                                Spacer()
                                if value == choice.pair { Image(systemName: "checkmark").foregroundStyle(.green) }
                            }
                        }
                        .tint(.primary)
                    }
                }
            }
            .searchable(text: $query, prompt: "Categories")
            .navigationTitle("Change category")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button("Save", systemImage: "checkmark") { Task { await save() } }
                            .disabled(value.isEmpty || value == current)
                    }
                }
            }
            .alert("Save failed", isPresented: .constant(failure != nil)) {
                Button("OK") { failure = nil }
            } message: {
                Text(failure ?? "")
            }
        }
        .onAppear { if value.isEmpty { value = current } }
        .interactiveDismissDisabled(saving)
    }

    private var choices: [(pair: String, title: String)] {
        guard let data = store.data else { return [] }
        let words = query.lowercased().split(separator: " ")
        return data.labels.keys
            .map { (pair: $0, title: data.pairLabel($0)) }
            .filter { choice in words.allSatisfy { choice.title.lowercased().contains($0) } }
            .sorted { $0.title < $1.title }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        if let error = await store.bulk("categories", keys: [key], value: value) {
            failure = error
            return
        }
        onSaved(store.data?.pairLabel(value) ?? value)
        dismiss()
    }
}
