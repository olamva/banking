import SwiftUI

struct TxnView: View {
    @Environment(Store.self) private var store
    let initial: Txn
    @State private var ruleFile: RuleFile?

    init(txn: Txn) { initial = txn }

    private var txn: Txn {
        store.data?.txns.first {
            $0.date == initial.date && $0.amount == initial.amount && $0.description == initial.description && $0.account == initial.account
        } ?? initial
    }

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
            Section("Rules") {
                Button("Category rule…", systemImage: "tag") { ruleFile = .categories }
                Button("Rename payee…", systemImage: "pencil") { ruleFile = .payees }
                Button("Mark as family…", systemImage: "person.2") { ruleFile = .family }
                if txn.recurring {
                    Button("Not a subscription…", systemImage: "repeat.circle") { ruleFile = .notSubscriptions }
                } else {
                    Button("Mark as subscription…", systemImage: "repeat") { ruleFile = .subscriptions }
                }
            }
            if let receipt = txn.receipt { ReceiptSection(receipt: receipt) }
            Section("Details") {
                LabeledContent("Category", value: store.data?.label(txn.category) ?? txn.category)
                if let sub = txn.subcategory {
                    LabeledContent("Subcategory", value: store.data?.label(txn.category, sub) ?? sub)
                }
                LabeledContent("Account", value: txn.account)
                if let country = txn.country {
                    Button { ruleFile = .countries } label: {
                        LabeledContent("Country") {
                            HStack(spacing: 6) {
                                Text(country)
                                Image(systemName: "pencil").font(.caption)
                            }
                        }
                    }
                    .tint(.primary)
                    .accessibilityHint("Opens a country rule.")
                }
                if txn.recurring { LabeledContent("Recurring", value: "Yes") }
                if txn.pending { LabeledContent("Status", value: "Pending") }
                if let source = txn.source { LabeledContent("Classification", value: source) }
                if let bank = txn.bank, let name = bank.first {
                    LabeledContent("Bank category") {
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(name)
                            if bank.count > 1 {
                                Text(bank[1]).font(.caption.monospaced()).foregroundStyle(.secondary)
                            }
                        }
                        .multilineTextAlignment(.trailing)
                    }
                }
                if let original = txn.original, !original.isEmpty {
                    LabeledContent("Original payee", value: original)
                }
                if let remote = txn.remote {
                    LabeledContent("Recipient account") { Text(remote).monospaced() }
                }
                if let type = txn.type { LabeledContent("Type", value: type) }
                if let reason = txn.excluded { LabeledContent("Reason", value: reason) }
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
        .sheet(item: $ruleFile) { RuleSheet(file: $0, txn: txn) }
    }
}
