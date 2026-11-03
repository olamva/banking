import Foundation

struct AppData: Codable, Sendable {
    let generated: String
    let today: String
    let labels: [String: String]
    let months: [Month]
    let years: [Year]
    let insights: Insights
    var txns: [Txn]

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

struct Month: Codable, Sendable, Identifiable, Hashable {
    let month: String
    let totalIn: Double
    let totalOut: Double
    let net: Double
    let delta: Delta?
    let compared: String?
    let categories: [Share]
    let subcategories: [SubShare]
    let incomeCategories: [Share]
    let merchants: [Merchant]
    let incomeMerchants: [Merchant]
    let accounts: [AccountTotal]
    let changes: [CategoryDelta]
    let subscriptions: [Subscription]
    let excluded: Excluded
    let spentByDay: [Double]
    let incomeByDay: [Double]

    var id: String { month }
    var date: Date { Day.month(month) }
}

struct Year: Codable, Sendable, Identifiable, Hashable {
    let year: String
    let totalIn: Double
    let totalOut: Double
    let net: Double
    let averageOut: Double
    let categories: [Share]
    let insights: Insights

    var id: String { year }
}

struct Txn: Codable, Sendable, Identifiable, Hashable {
    var id = 0
    var search = ""
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

    enum CodingKeys: String, CodingKey {
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
}
