import Foundation

enum Axis: String, CaseIterable, Identifiable, Sendable {
    case categories, merchants, items, accounts, countries

    var id: String { rawValue }

    var name: String {
        switch self {
        case .categories: "Category"
        case .merchants: "Merchant"
        case .items: "Item"
        case .accounts: "Account"
        case .countries: "Country"
        }
    }

    var title: String {
        switch self {
        case .categories: "Categories"
        case .merchants: "Merchants"
        case .items: "Items"
        case .accounts: "Accounts"
        case .countries: "Countries"
        }
    }

    var symbol: String {
        switch self {
        case .categories: "square.grid.2x2"
        case .merchants: "storefront"
        case .items: "basket"
        case .accounts: "creditcard"
        case .countries: "globe.europe.africa"
        }
    }

    var param: String {
        switch self {
        case .categories: "cat"
        case .merchants: "m"
        case .items: "it"
        case .accounts: "acct"
        case .countries: "co"
        }
    }
}

enum Pick { case none, included, excluded }

struct Filters: Codable, Hashable, Sendable {
    static let noCountry = "—"

    var categories: [String] = []
    var categoriesOut: [String] = []
    var merchants: [String] = []
    var merchantsOut: [String] = []
    var items: [String] = []
    var itemsOut: [String] = []
    var accounts: [String] = []
    var accountsOut: [String] = []
    var countries: [String] = []
    var countriesOut: [String] = []
    var search = ""
    var showExcluded = false

    subscript(axis: Axis, out: Bool) -> [String] {
        get {
            switch axis {
            case .categories: out ? categoriesOut : categories
            case .merchants: out ? merchantsOut : merchants
            case .items: out ? itemsOut : items
            case .accounts: out ? accountsOut : accounts
            case .countries: out ? countriesOut : countries
            }
        }
        set {
            switch axis {
            case .categories: if out { categoriesOut = newValue } else { categories = newValue }
            case .merchants: if out { merchantsOut = newValue } else { merchants = newValue }
            case .items: if out { itemsOut = newValue } else { items = newValue }
            case .accounts: if out { accountsOut = newValue } else { accounts = newValue }
            case .countries: if out { countriesOut = newValue } else { countries = newValue }
            }
        }
    }

    var picks: Int { Axis.allCases.reduce(0) { $0 + self[$1, false].count + self[$1, true].count } }
    var isEmpty: Bool { picks == 0 && search.isEmpty && !showExcluded }
    var changesFigures: Bool { picks > 0 || !search.isEmpty }

    func pick(_ axis: Axis, _ value: String) -> Pick {
        self[axis, true].contains(value) ? .excluded : self[axis, false].contains(value) ? .included : .none
    }

    mutating func cycle(_ axis: Axis, _ value: String, exclude: Bool = false) {
        let target: Bool? = switch pick(axis, value) {
        case .excluded: nil
        case .included: true
        case .none: exclude
        }
        remove(axis, value)
        if let target { self[axis, target].append(value) }
    }

    mutating func only(_ axis: Axis, _ value: String) {
        let sole = self[axis, false] == [value]
        self[axis, true].removeAll { $0 == value }
        self[axis, false] = sole ? [] : [value]
    }

    mutating func hide(_ axis: Axis, _ value: String) {
        let hidden = self[axis, true].contains(value)
        remove(axis, value)
        if !hidden { self[axis, true].append(value) }
    }

    mutating func remove(_ axis: Axis, _ value: String) {
        self[axis, false].removeAll { $0 == value }
        self[axis, true].removeAll { $0 == value }
    }

    mutating func clearPicks() {
        for axis in Axis.allCases {
            self[axis, false] = []
            self[axis, true] = []
        }
    }

    private static func shown(_ include: [String], _ exclude: [String], _ candidates: [String]) -> Bool {
        !candidates.contains(where: exclude.contains) && (include.isEmpty || candidates.contains(where: include.contains))
    }

    func matches(_ t: Txn, search query: String? = nil) -> Bool {
        if t.excluded != nil && !showExcluded { return false }
        guard Self.shown(categories, categoriesOut, [t.category, t.subPair]),
              Self.shown(merchants, merchantsOut, [t.merchant]),
              Self.shown(items.map(Self.nameKey), itemsOut.map(Self.nameKey), t.itemKeys),
              Self.shown(accounts, accountsOut, [t.account]),
              Self.shown(countries, countriesOut, [t.countryKey])
        else { return false }
        let q = (query ?? search).lowercased()
        return q.isEmpty || "\(t.description) \(t.payeeText)".lowercased().contains(q)
    }

    var query: [(String, String)] {
        var out: [(String, String)] = []
        if !categories.isEmpty { out.append(("cat", categories.joined(separator: ","))) }
        if !categoriesOut.isEmpty { out.append(("cat_not", categoriesOut.joined(separator: ","))) }
        for axis in Axis.allCases where axis != .categories {
            out += self[axis, false].map { (axis.param, $0) }
            out += self[axis, true].map { ("\(axis.param)_not", $0) }
        }
        if !search.isEmpty { out.append(("q", search)) }
        if showExcluded { out.append(("excl", "1")) }
        return out
    }

    init() {}

    init(query: [(String, String)]) {
        let all = { (name: String) in query.filter { $0.0 == name && !$0.1.isEmpty }.map(\.1) }
        let split = { (name: String) in all(name).first?.split(separator: ",").map(String.init) ?? [] }
        categories = split("cat")
        categoriesOut = split("cat_not")
        for axis in Axis.allCases where axis != .categories {
            self[axis, false] = all(axis.param)
            self[axis, true] = all("\(axis.param)_not")
        }
        search = query.first { $0.0 == "q" }?.1 ?? ""
        showExcluded = query.contains { $0 == ("excl", "1") }
    }

    private static let packaging: Set<String> = ["bx", "boks", "fl", "flaske", "plastfl", "fridepack", "x"]

    static func nameKey(_ name: String) -> String {
        name.lowercased()
            .replacing(#/(\d),(\d)/#) { "\($0.1).\($0.2)" }
            .split(whereSeparator: \.isWhitespace)
            .map(String.init)
            .filter { !packaging.contains($0) }
            .sorted()
            .joined(separator: " ")
    }
}

enum Query {
    private static let plain = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")

    static func encode(_ items: [(String, String)]) -> String {
        items.map { "\($0.0)=\($0.1.addingPercentEncoding(withAllowedCharacters: plain) ?? "")" }.joined(separator: "&")
    }

    static func decode(_ text: String?) -> [(String, String)] {
        (text ?? "").split(separator: "&").map { part in
            let pair = part.split(separator: "=", maxSplits: 1).map {
                String($0).replacingOccurrences(of: "+", with: " ").removingPercentEncoding ?? String($0)
            }
            return (pair.first ?? "", pair.count > 1 ? pair[1] : "")
        }
    }
}

struct Bought: Hashable, Identifiable {
    let txn: Txn
    let purchase: Purchase
    let index: Int

    var id: String { "\(txn.id)-\(index)" }
    var date: String { txn.receipt.map { Day.key(Date(timeIntervalSince1970: $0.at / 1000)) } ?? txn.date }
    var store: String { txn.receipt?.store ?? txn.merchant }

    static func of(_ txns: [Txn]) -> [Bought] {
        txns.flatMap { txn in (txn.purchases ?? []).enumerated().map { Bought(txn: txn, purchase: $1, index: $0) } }
    }
}

struct Item: Identifiable, Hashable {
    let key: String
    let name: String
    let sizes: [String]
    let unit: String?
    let count: Int
    let qty: Double
    let spent: Double
    let price: Double
    let last: String
    let medianDays: Double?
    let bought: [Bought]

    var id: String { key }

    private static func ore(_ value: Double) -> Double { (value * 100).rounded() / 100 }

    private static func median(_ values: [Double]) -> Double? {
        let sorted = values.sorted()
        guard !sorted.isEmpty else { return nil }
        let mid = sorted.count / 2
        return sorted.count % 2 == 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    }

    private static func commonest(_ names: [String]) -> String {
        var order: [String] = []
        var counts: [String: Int] = [:]
        for name in names {
            if counts[name] == nil { order.append(name) }
            counts[name, default: 0] += 1
        }
        let shouted = { (name: String) in name == name.uppercased() ? 1 : 0 }
        return order.enumerated().sorted { a, b in
            let (ca, cb) = (counts[a.element]!, counts[b.element]!)
            if ca != cb { return ca > cb }
            if shouted(a.element) != shouted(b.element) { return shouted(a.element) < shouted(b.element) }
            return a.offset < b.offset
        }.first?.element ?? ""
    }

    static func of(_ bought: [Bought], bySize: Bool = false) -> [Item] {
        var order: [String] = []
        var groups: [String: [Bought]] = [:]
        for entry in bought {
            let key = bySize ? "\(entry.purchase.key)\n\(entry.purchase.sizeKey)" : entry.purchase.key
            if groups[key] == nil { order.append(key) }
            groups[key, default: []].append(entry)
        }
        return order.map { key in
            let sorted = groups[key]!.enumerated().sorted { a, b in
                a.element.date != b.element.date ? a.element.date > b.element.date : a.offset < b.offset
            }.map(\.element)
            let qty = sorted.reduce(0) { $0 + $1.purchase.qty }
            let spent = ore(sorted.reduce(0) { $0 + $1.purchase.amount })
            var days: [Double] = []
            for entry in sorted {
                let day = Day.date(entry.date).timeIntervalSince1970 / 86_400
                if !days.contains(where: { abs($0 - day) < 0.5 }) { days.append(day) }
            }
            var sizeOrder: [String] = []
            var sizes: [String: String] = [:]
            for entry in sorted {
                guard let size = entry.purchase.size, !size.isEmpty else { continue }
                if sizes[entry.purchase.sizeKey] == nil { sizeOrder.append(entry.purchase.sizeKey) }
                sizes[entry.purchase.sizeKey] = size
            }
            return Item(
                key: key,
                name: commonest(sorted.map(\.purchase.name)),
                sizes: sizeOrder.compactMap { sizes[$0] },
                unit: sorted.first?.purchase.unit,
                count: Set(sorted.map(\.txn.id)).count,
                qty: qty,
                spent: spent,
                price: qty > 0 ? ore(spent / qty) : 0,
                last: sorted.first?.date ?? "",
                medianDays: median(zip(days, days.dropFirst()).map { ($0 - $1).rounded() }),
                bought: sorted
            )
        }
    }
}

struct FilterOptions {
    static let peer: Set<String> = ["diverse/vennebetaling", "innskudd/familie", "innskudd/lommepenger"]

    let categories: [String]
    let subcategories: [String]
    let merchants: [String]
    let items: [String]
    let people: Set<String>
    let accounts: [String]
    let countries: [String]

    init(rows: [Txn], filters: Filters, data: AppData?) {
        func withPicked(_ offered: [String], _ picked: [String]) -> [String] {
            Array(Set(offered + picked)).sorted { $0.localizedCompare($1) == .orderedAscending }
        }
        let parent = { (pair: String) in String(pair.prefix { $0 != "/" }) }
        let subLabel = { (pair: String) -> String in
            let sub = pair.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false).dropFirst().first.map(String.init) ?? ""
            return data?.label(parent(pair), sub.isEmpty ? nil : sub) ?? pair
        }
        categories = Array(Set(rows.map(\.category) + filters.categories.map { $0.contains("/") ? parent($0) : $0 })).sorted()
        subcategories = Array(Set(rows.map(\.subPair) + filters.categories.filter { $0.contains("/") })).sorted {
            parent($0) != parent($1) ? parent($0) < parent($1) : subLabel($0).localizedCompare(subLabel($1)) == .orderedAscending
        }
        merchants = withPicked(rows.map(\.merchant), filters.merchants)
        items = withPicked(Item.of(Bought.of(rows)).map(\.name), filters.items)
        people = Set(rows.filter { Self.peer.contains($0.subPair) }.map(\.merchant))
        accounts = withPicked(rows.map(\.account), filters.accounts)
        let inView = Array(Set(rows.map(\.countryKey))).sorted { $0.localizedCompare($1) == .orderedAscending }
        let ordered = inView.filter { $0 != Filters.noCountry } + (inView.contains(Filters.noCountry) ? [Filters.noCountry] : [])
        countries = ordered + filters.countries.filter { !ordered.contains($0) }
    }

    func values(_ axis: Axis) -> [String] {
        switch axis {
        case .categories: categories
        case .merchants: merchants
        case .items: items
        case .accounts: accounts
        case .countries: countries
        }
    }
}
