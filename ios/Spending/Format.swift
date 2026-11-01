import SwiftUI

enum Money {
    private static let norwegian = Locale(identifier: "nb_NO")

    static func kr(_ value: Double, signed: Bool = false, exact: Bool = false) -> String {
        let digits = exact && (value * 100).rounded().truncatingRemainder(dividingBy: 100) != 0 ? 2 : 0
        let text = value.formatted(
            .number
                .locale(norwegian)
                .precision(.fractionLength(digits))
                .sign(strategy: signed ? .always(includingZero: false) : .automatic)
        )
        return "\(text) kr"
    }

    static func short(_ value: Double) -> String {
        abs(value) >= 10_000
            ? "\((value / 1000).formatted(.number.locale(norwegian).precision(.fractionLength(0)))) k"
            : value.formatted(.number.locale(norwegian).precision(.fractionLength(0)))
    }
}

extension Date {
    var monthTitle: String { formatted(.dateTime.month(.wide).year().locale(Locale(identifier: "en_GB"))) }
    var monthName: String { formatted(.dateTime.month(.wide).locale(Locale(identifier: "en_GB"))) }
    var dayTitle: String { formatted(.dateTime.weekday(.wide).day().month(.wide).locale(Locale(identifier: "en_GB"))) }
    var shortDay: String { formatted(.dateTime.day().month(.abbreviated).year().locale(Locale(identifier: "en_GB"))) }
}

struct CategoryStyle {
    let symbol: String
    let color: Color

    private static let known: [String: CategoryStyle] = [
        "dagligvarer": .init(symbol: "cart.fill", color: .green),
        "kafe_og_restaurant": .init(symbol: "fork.knife", color: .orange),
        "faste_utgifter": .init(symbol: "house.fill", color: .blue),
        "hjem_og_hage": .init(symbol: "sofa.fill", color: .brown),
        "hobby_og_fritid": .init(symbol: "figure.run", color: .mint),
        "medier_og_underholdning": .init(symbol: "play.tv.fill", color: .purple),
        "bil_og_transport": .init(symbol: "car.fill", color: .indigo),
        "reise": .init(symbol: "airplane", color: .cyan),
        "helse_og_velvaere": .init(symbol: "heart.fill", color: .pink),
        "klaer_og_utstyr": .init(symbol: "tshirt.fill", color: .teal),
        "sparing": .init(symbol: "banknote.fill", color: .green),
        "forsikring": .init(symbol: "shield.fill", color: .indigo),
        "innskudd": .init(symbol: "arrow.down.circle.fill", color: .green),
        "annet_lan_og_gjeld": .init(symbol: "building.columns.fill", color: .red),
        "overfoering": .init(symbol: "arrow.left.arrow.right", color: .gray),
        "diverse": .init(symbol: "square.grid.2x2.fill", color: .gray),
        "ukategorisert": .init(symbol: "questionmark", color: .secondary),
    ]

    private static let spare: [Color] = [.red, .orange, .yellow, .green, .mint, .teal, .cyan, .blue, .indigo, .purple, .pink, .brown]

    static func of(_ category: String) -> CategoryStyle {
        known[category] ?? CategoryStyle(
            symbol: "tag.fill",
            color: spare[category.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xffff } % spare.count]
        )
    }
}

struct CategoryIcon: View {
    let category: String
    var size: CGFloat = 30

    var body: some View {
        let style = CategoryStyle.of(category)
        Image(systemName: style.symbol)
            .font(.system(size: size * 0.5, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(style.color.gradient, in: .rect(cornerRadius: size * 0.27, style: .continuous))
            .accessibilityHidden(true)
    }
}

struct Amount: View {
    let value: Double
    var exact = true

    var body: some View {
        Text(Money.kr(value, signed: value > 0, exact: exact))
            .monospacedDigit()
            .foregroundStyle(value > 0 ? Color.green : Color.primary)
    }
}
