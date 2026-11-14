import Foundation

struct AppData: Codable, Sendable {
    let generated: String
    let today: String
    let labels: [String: String]
    let periods: [Period]
    var txns: [Txn]

    var months: [Period] { periods.filter { $0.kind == "month" } }
    var years: [Period] { periods.filter { $0.kind == "year" } }

    func label(_ category: String, _ sub: String? = nil) -> String {
        if let sub, let name = labels["\(category)/\(sub)"] { return name }
        return labels[category] ?? category.replacingOccurrences(of: "_", with: " ").capitalized
    }

    func pairLabel(_ pair: String) -> String {
        let parts = pair.split(separator: "/", maxSplits: 1).map(String.init)
        return parts.count == 2 ? "\(label(parts[0])) › \(label(parts[0], parts[1]))" : label(pair)
    }
}

struct Share: Codable, Sendable, Hashable {
    let category: String
    let total: Double
    let share: Double
}

struct SubShare: Codable, Sendable, Hashable {
    let category: String
    let subcategory: String?
    let total: Double
    let share: Double
}

struct Merchant: Codable, Sendable, Hashable {
    let counterparty: String
    let total: Double
    let count: Int
}

struct AccountTotal: Codable, Sendable, Hashable {
    let account: String
    let total: Double
    let share: Double
}

struct CategoryDelta: Codable, Sendable, Hashable {
    let category: String
    let current: Double
    let previous: Double
    let delta: Double
}

struct ReturnPattern: Codable, Sendable, Hashable {
    let medianDays: Int
    let lowDays: Int
    let highDays: Int
    let expectedNext: String
    let active: Bool
}

struct Habit: Codable, Sendable, Hashable {
    let merchant: String
    let count: Int
    let activeDays: Int
    let total: Double
    let average: Double
    let last: String?
    let favoriteWeekday: String?
    let favoriteWeekdayCount: Int
    let weekendVisitCount: Int
    let topCategory: String
    let returnPattern: ReturnPattern?
}

struct Weekday: Codable, Sendable, Hashable {
    let weekday: String
    let count: Int
    let total: Double
    let share: Double
    let topMerchant: String?
}

struct Insights: Codable, Sendable, Hashable {
    let transactionCount: Int
    let merchantCount: Int
    let weekdays: [Weekday]
    let topByTransactions: [Habit]
    let topBySpend: [Habit]
    let expected: [Habit]
    let merchants: [Habit]
}

struct Entry: Codable, Sendable, Hashable {
    let label: String
    let amount: Double
}

struct ReceiptLine: Codable, Sendable, Hashable {
    let name: String
    let size: String?
    let qty: Double
    let unit: String?
    let price: Double
    let amount: Double
    let discounts: [Entry]?
    let deposit: Double?
}

struct Receipt: Codable, Sendable, Hashable {
    let source: String
    let id: String
    let at: Double
    let store: String
    let title: String?
    let lines: [ReceiptLine]
    let total: Double?
    let payments: [Entry]?
}

struct Subscription: Codable, Sendable, Hashable {
    let name: String
    let category: String
    let count: Int
    let total: Double
    let latest: Double
    let last: String
}

struct Delta: Codable, Sendable, Hashable {
    let totalIn: Double
    let totalOut: Double
    let net: Double
}

struct Excluded: Codable, Sendable, Hashable {
    let count: Int
    let total: Double
}

struct Series: Codable, Sendable, Hashable {
    let bucket: String
    let start: String
    let spent: [Double]
    let income: [Double]

    func date(_ index: Int) -> Date {
        bucket == "month"
            ? Day.calendar.date(byAdding: .month, value: index, to: Day.month(start)) ?? .distantPast
            : Day.calendar.date(byAdding: .day, value: index, to: Day.date(start)) ?? .distantPast
    }

    func index(_ date: Date) -> Int {
        let parts = Day.calendar.dateComponents([.day, .month], from: self.date(0), to: date)
        return (bucket == "month" ? parts.month : parts.day) ?? 0
    }
}

struct Period: Codable, Sendable, Identifiable, Hashable {
    let key: String
    let kind: String
    let label: String
    let from: String
    let to: String
    let totalIn: Double
    let totalOut: Double
    let net: Double
    let averageOut: Double?
    let averageIn: Double?
    let delta: Delta?
    let compared: String?
    let prev: Bounds?
    let categories: [Share]
    let subcategories: [SubShare]
    let incomeCategories: [Share]
    let incomeSubcategories: [SubShare]?
    let merchants: [Merchant]
    let incomeMerchants: [Merchant]
    let accounts: [AccountTotal]
    let incomeAccounts: [AccountTotal]?
    let changes: [CategoryDelta]
    let subscriptions: [Subscription]
    let excluded: Excluded
    let series: Series
    let insights: Insights

    var id: String { key }
    var date: Date { Day.date(from) }

    var title: String {
        switch kind {
        case "month": date.monthTitle
        case "year": key
        case "custom": from.prefix(4) == to.prefix(4) ? "\(Day.date(from).dayMonth) – \(Day.date(to).shortDay)" : "\(Day.date(from).shortDay) – \(Day.date(to).shortDay)"
        default: "All time"
        }
    }

    var lastYear: String? {
        guard kind == "month" || kind == "year", let year = Int(key.prefix(4)) else { return nil }
        return "\(year - 1)\(key.dropFirst(4))"
    }

    func contains(_ txn: Txn) -> Bool { txn.date >= from && txn.date <= to }
}

struct Bounds: Codable, Sendable, Hashable {
    let from: String
    let to: String
}

struct Purchase: Codable, Sendable, Hashable {
    let key: String
    let sizeKey: String
    let name: String
    let raw: String
    let size: String?
    let qty: Double
    let unit: String?
    let amount: Double
}

struct Txn: Codable, Sendable, Identifiable, Hashable {
    var id = 0
    var search = ""
    var itemKeys: [String] = []
    let unnamed: Bool?
    let original: String?
    let remote: String?
    let source: String?
    let bank: [String]?
    let purchases: [Purchase]?
    let date: String
    let amount: Double
    let merchant: String
    let description: String
    let category: String
    let subcategory: String?
    let account: String
    let country: String?
    let type: String?
    let recurring: Bool
    let pending: Bool
    let excluded: String?
    let remember: String?
    let receipt: Receipt?

    var day: Date { Day.date(date) }
    var month: String { String(date.prefix(7)) }
    var pair: String { subcategory.map { "\(category)/\($0)" } ?? category }
    var subPair: String { "\(category)/\(subcategory ?? "")" }
    var countryKey: String { country ?? Filters.noCountry }
    var payeeText: String { unnamed == true ? "" : merchant }

    enum CodingKeys: String, CodingKey {
        case unnamed, original, remote, source, bank, purchases
        case date, amount, merchant, description, category, subcategory, account, country, type, recurring, pending, excluded, remember, receipt
    }
}

enum Day {
    static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Oslo")!
        c.locale = Locale(identifier: "en_GB")
        return c
    }()

    static func date(_ text: String) -> Date {
        let parts = text.split(separator: "-").compactMap { Int($0) }
        return calendar.date(from: DateComponents(
            year: parts.first,
            month: parts.count > 1 ? parts[1] : 1,
            day: parts.count > 2 ? parts[2] : 1,
            hour: 12
        )) ?? .distantPast
    }

    static func month(_ text: String) -> Date { date(text + "-01") }

    static func key(_ date: Date) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 1, parts.day ?? 1)
    }
}
