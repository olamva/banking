import SwiftUI

struct ReceiptSection: View {
    let receipt: Receipt

    var body: some View {
        Section {
            if receipt.source == "gmail" {
                Text(receipt.title.flatMap { $0.isEmpty ? nil : $0 } ?? "(no subject)")
                if let url = URL(string: "https://mail.google.com/mail/u/0/#all/\(receipt.id)") {
                    Link(destination: url) { Label("Open in Gmail", systemImage: "arrow.up.right.square") }
                }
            } else {
                Slip(receipt: receipt)
            }
        } header: {
            Label("Receipt", systemImage: "receipt")
        } footer: {
            Text("\(receipt.store) · \(Date(timeIntervalSince1970: receipt.at / 1000).receiptTime)")
        }
    }
}

struct Slip: View {
    let receipt: Receipt
    var marked: String?

    var body: some View {
        let lines = merged
        let saved = lines.flatMap { $0.discounts ?? [] }.reduce(0) { $0 + $1.amount }
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                let isMarked = line.name == marked
                VStack(alignment: .leading, spacing: 1) {
                    Text(line.name.uppercased())
                    Row(amount: line.amount + (line.discounts ?? []).reduce(0) { $0 + $1.amount } - (line.deposit ?? 0)) {
                        HStack {
                            if let size = line.size { Text(size) }
                            Spacer()
                            if line.price > 0 {
                                Text(line.unit == nil
                                    ? "\(Money.quantity(line.qty)) × \(Money.ore(line.price))"
                                    : "\(Money.quantity(line.qty)) kg × \(Money.ore(line.price))/kg")
                            }
                        }
                        .foregroundStyle(.secondary)
                    }
                    ForEach(line.discounts ?? [], id: \.label) { discount in
                        Row(amount: -discount.amount) { Text(discount.label.isEmpty ? "Rabatt" : "Rabatt: \(discount.label)") }
                    }
                    if let deposit = line.deposit, deposit != 0 {
                        Row(amount: deposit) { Text("Pant") }
                    }
                }
                .fontWeight(isMarked ? .semibold : nil)
                .padding(.horizontal, isMarked ? 6 : 0)
                .padding(.vertical, isMarked ? 2 : 0)
                .background(isMarked ? AnyShapeStyle(.fill.secondary) : AnyShapeStyle(.clear), in: .rect(cornerRadius: 4))
                .padding(.horizontal, isMarked ? -6 : 0)
            }
            Divider()
            Row(amount: receipt.total ?? lines.reduce(0) { $0 + $1.amount }) { Text("SUM").bold() }
            HStack {
                Text("\(Money.quantity(lines.filter { $0.amount > 0 }.reduce(0) { $0 + ($1.unit == nil ? $1.qty : 1) })) varer")
                Spacer()
                if saved > 0 { Text("Du sparte \(Money.ore(saved))") }
            }
            .foregroundStyle(.secondary)
            ForEach(receipt.payments ?? [], id: \.label) { payment in
                Row(amount: payment.amount) { Text(payment.label) }
            }
        }
        .font(.caption.monospaced())
        .monospacedDigit()
        .padding(.vertical, 4)
    }

    private var merged: [ReceiptLine] {
        var at: [String: Int] = [:]
        var out: [ReceiptLine] = []
        for (index, line) in receipt.lines.enumerated() {
            let key = line.unit == nil ? "\(line.name)\n\(line.size ?? "")\n\(line.price)" : "\(index)"
            if let place = at[key] {
                out[place] = out[place].adding(line)
            } else {
                at[key] = out.count
                out.append(line)
            }
        }
        return out
    }
}

private struct Row<Label: View>: View {
    let amount: Double
    @ViewBuilder let label: Label

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            label.frame(maxWidth: .infinity, alignment: .leading)
            Text(Money.ore(amount)).frame(minWidth: 64, alignment: .trailing)
        }
    }
}

private extension ReceiptLine {
    func adding(_ other: ReceiptLine) -> ReceiptLine {
        let all = (discounts ?? []) + (other.discounts ?? [])
        let labels = all.map(\.label).reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
        return ReceiptLine(
            name: name,
            size: size,
            qty: qty + other.qty,
            unit: unit,
            price: price,
            amount: amount + other.amount,
            discounts: labels.map { label in Entry(label: label, amount: all.filter { $0.label == label }.reduce(0) { $0 + $1.amount }) },
            deposit: (deposit ?? 0) + (other.deposit ?? 0)
        )
    }
}
