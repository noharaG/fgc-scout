/**
 * 2026 FIRST Global Challenge の参加確定国。
 *
 * 出典は https://first.global/fgc/ の世界地図（緑＝参加確定）。地図プラグインの
 * 設定 JS `map_data` のうち `group: 0`（groups[0].color = #008000）に属する項目。
 * 取得日 2026-09-22、179件。元データの写しは docs/data/2026-nations.json。
 *
 * **緑だけを拾うと8チーム漏れる（2026-10-05 に追加して187件）。**地図では
 * Hong Kong や Tonga などの小さな島・地域に、2026 のチームページへのリンクは
 * 付いているのに緑の設定が無い。Team Hope（難民）は国土が無いので地図に
 * 載らず、2026 Nations の一覧ページにしか居ない。8チームとも2025に出ており、
 * 名前とコードは2025公式から引いた。地図も一覧ページも単独では全部を
 * 持たない（一覧ページには Argentina や Iran が無い）。
 *
 * **表示名は地図の表記ではなく、2025 大会の公式結果の表記に寄せてある。**
 * 地図は `Korea, Republic of` のような書き方だが、公式の結果サイトは
 * `Republic of Korea` と書く。24件がそのままでは食い違い、うち11件は語順と
 * 記号の違いだけだった。照合の記録は docs/data/2025-official-teams.json。
 *
 * **`code` は ISO3 ではなく IOC コード。**公式データの `country` がこれで、
 * Algeria は `ALG`（ISO3 なら `DZA`）、Iran は `IRI`（`IRN`）、Switzerland は
 * `SUI`（`CHE`）になる。会場でこれを打つ人がいるので、名前と一緒に引く。
 *
 * `flag` は国旗の絵文字。ISO 3166-1 alpha-2（IOC とは別物）から作ってある。
 * 2025 に出ていない13か国は、どちらも空。公式データが載った時点で埋まる。
 *
 * **2文字とも英字でないものは空にする。**公式データの `countryCode` は
 * 必ずしも ISO の2文字ではなく、Chinese Taipei は `"15"` が入っている。
 * 機械的に変換すると `🆶🆺` のような別の記号が出る（実際に出た）。
 */
export type RosterTeam = {
  /** 2025 公式の表記。2025 に無い国は参加国マップの表記のまま。 */
  readonly name: string
  /** IOC の3文字コード。2025 に出ていない国は null。 */
  readonly code: string | null
  /** 国旗の絵文字。出せないときは空文字。 */
  readonly flag: string
}

export const ROSTER_2026: readonly RosterTeam[] = [
  { name: "Afghanistan", code: "AFG", flag: "🇦🇫" },
  { name: "Albania", code: "ALB", flag: "🇦🇱" },
  { name: "Algeria", code: "ALG", flag: "🇩🇿" },
  { name: "American Samoa", code: "ASA", flag: "🇦🇸" },
  { name: "Angola", code: "ANG", flag: "🇦🇴" },
  { name: "Antigua and Barbuda", code: "ANT", flag: "🇦🇬" },
  { name: "Argentina", code: "ARG", flag: "🇦🇷" },
  { name: "Aruba", code: "ARU", flag: "🇦🇼" },
  { name: "Australia", code: "AUS", flag: "🇦🇺" },
  { name: "Austria", code: "AUT", flag: "🇦🇹" },
  { name: "Azerbaijan", code: "AZE", flag: "🇦🇿" },
  { name: "Bahamas", code: "BAH", flag: "🇧🇸" },
  { name: "Bangladesh", code: "BAN", flag: "🇧🇩" },
  { name: "Barbados", code: "BAR", flag: "🇧🇧" },
  { name: "Belarus", code: "BLR", flag: "🇧🇾" },
  { name: "Belgium", code: "BEL", flag: "🇧🇪" },
  { name: "Belize", code: "BIZ", flag: "🇧🇿" },
  { name: "Benin", code: "BEN", flag: "🇧🇯" },
  { name: "Bhutan", code: "BHU", flag: "🇧🇹" },
  { name: "Bolivia", code: "BOL", flag: "🇧🇴" },
  { name: "Bosnia and Herzegovina", code: "BIH", flag: "🇧🇦" },
  { name: "Botswana", code: "BOT", flag: "🇧🇼" },
  { name: "Brazil", code: "BRA", flag: "🇧🇷" },
  { name: "British Virgin Islands", code: "IVB", flag: "🇻🇬" },
  { name: "Brunei Darussalam", code: "BRU", flag: "🇧🇳" },
  { name: "Bulgaria", code: "BUL", flag: "🇧🇬" },
  { name: "Burkina Faso", code: "BUR", flag: "🇧🇫" },
  { name: "Burundi", code: "BDI", flag: "🇧🇮" },
  { name: "Cabo Verde", code: "CPV", flag: "🇨🇻" },
  { name: "Cambodia", code: "CAM", flag: "🇰🇭" },
  { name: "Cameroon", code: "CMR", flag: "🇨🇲" },
  { name: "Canada", code: "CAN", flag: "🇨🇦" },
  { name: "Cayman Islands", code: "CAY", flag: "🇰🇾" },
  { name: "Central African Republic", code: "CAF", flag: "🇨🇫" },
  { name: "Chad", code: "CHA", flag: "🇹🇩" },
  { name: "Chile", code: "CHI", flag: "🇨🇱" },
  // 公式データの countryCode が "15"（数字）で、国旗の記号が作れない。
  // 政治的な事情で ISO の2文字が振られていないため。空にする。
  { name: "Chinese Taipei", code: "TPE", flag: "" },
  { name: "Colombia", code: "COL", flag: "🇨🇴" },
  { name: "Comoros", code: "COM", flag: "🇰🇲" },
  { name: "Congo", code: "CGO", flag: "🇨🇬" },
  { name: "Cook Islands", code: "COK", flag: "🇨🇰" },
  { name: "Costa Rica", code: "CRC", flag: "🇨🇷" },
  { name: "Croatia", code: "CRO", flag: "🇭🇷" },
  { name: "Cuba", code: "CUB", flag: "🇨🇺" },
  { name: "Czechia", code: "CZE", flag: "🇨🇿" },
  { name: "Côte d`Ivoire", code: "CIV", flag: "🇨🇮" },
  { name: "Democratic Republic of the Congo", code: "COD", flag: "🇨🇩" },
  { name: "Denmark", code: "DEN", flag: "🇩🇰" },
  { name: "Djibouti", code: "DJI", flag: "🇩🇯" },
  { name: "Dominica", code: "DMA", flag: "🇩🇲" },
  { name: "Dominican Republic", code: "DOM", flag: "🇩🇴" },
  { name: "Ecuador", code: "ECU", flag: "🇪🇨" },
  { name: "Egypt", code: "EGY", flag: "🇪🇬" },
  { name: "El Salvador", code: "ESA", flag: "🇸🇻" },
  { name: "Equatorial Guinea", code: "GEQ", flag: "🇬🇶" },
  { name: "Eritrea", code: "ERI", flag: "🇪🇷" },
  { name: "Estonia", code: "EST", flag: "🇪🇪" },
  { name: "Eswatini", code: "SWZ", flag: "🇸🇿" },
  { name: "Ethiopia", code: "ETH", flag: "🇪🇹" },
  { name: "Federated States of Micronesia", code: "FSM", flag: "🇫🇲" },
  { name: "Fiji", code: "FIJ", flag: "🇫🇯" },
  { name: "Finland", code: "FIN", flag: "🇫🇮" },
  { name: "France", code: "FRA", flag: "🇫🇷" },
  { name: "Gabon", code: "GAB", flag: "🇬🇦" },
  { name: "Gambia", code: "GAM", flag: "🇬🇲" },
  { name: "Georgia", code: "GEO", flag: "🇬🇪" },
  { name: "Germany", code: "GER", flag: "🇩🇪" },
  { name: "Ghana", code: "GHA", flag: "🇬🇭" },
  { name: "Great Britain", code: "GBR", flag: "🇬🇧" },
  { name: "Greece", code: "GRE", flag: "🇬🇷" },
  { name: "Grenada", code: "GRN", flag: "🇬🇩" },
  { name: "Guam", code: "GUM", flag: "🇬🇺" },
  { name: "Guatemala", code: "GUA", flag: "🇬🇹" },
  { name: "Guinea", code: "GUI", flag: "🇬🇳" },
  { name: "Guinea-Bissau", code: "GBS", flag: "🇬🇼" },
  { name: "Guyana", code: "GUY", flag: "🇬🇾" },
  { name: "Haiti", code: "HAI", flag: "🇭🇹" },
  { name: "Honduras", code: "HON", flag: "🇭🇳" },
  { name: "Hong Kong (China)", code: "HKG", flag: "🇭🇰" },
  // 公式データの countryCode が "10"（数字）で、国旗の記号が作れない。
  // 国ではないので ISO の2文字が無い。Chinese Taipei と同じく空にする。
  { name: "Hope (Refugees)", code: "HPE", flag: "" },
  { name: "Hungary", code: "HUN", flag: "🇭🇺" },
  { name: "India", code: "IND", flag: "🇮🇳" },
  { name: "Indonesia", code: "INA", flag: "🇮🇩" },
  { name: "Iraq", code: "IRQ", flag: "🇮🇶" },
  { name: "Ireland", code: "IRL", flag: "🇮🇪" },
  { name: "Islamic Republic of Iran", code: "IRI", flag: "🇮🇷" },
  { name: "Israel", code: "ISR", flag: "🇮🇱" },
  { name: "Italy", code: "ITA", flag: "🇮🇹" },
  { name: "Jamaica", code: "JAM", flag: "🇯🇲" },
  { name: "Japan", code: "JPN", flag: "🇯🇵" },
  { name: "Jordan", code: "JOR", flag: "🇯🇴" },
  { name: "Kazakhstan", code: "KAZ", flag: "🇰🇿" },
  { name: "Kenya", code: "KEN", flag: "🇰🇪" },
  { name: "Kiribati", code: "KIR", flag: "🇰🇮" },
  { name: "Kosovo", code: "KOS", flag: "🇽🇰" },
  { name: "Kyrgyzstan", code: "KGZ", flag: "🇰🇬" },
  { name: "Lao People`s Democratic Republic", code: "LAO", flag: "🇱🇦" },
  { name: "Latvia", code: "LAT", flag: "🇱🇻" },
  { name: "Lebanon", code: "LBN", flag: "🇱🇧" },
  { name: "Lesotho", code: "LES", flag: "🇱🇸" },
  { name: "Liberia", code: "LBR", flag: "🇱🇷" },
  { name: "Libya", code: "LBA", flag: "🇱🇾" },
  { name: "Lithuania", code: "LTU", flag: "🇱🇹" },
  { name: "Luxembourg", code: "LUX", flag: "🇱🇺" },
  { name: "Madagascar", code: "MAD", flag: "🇲🇬" },
  { name: "Malawi", code: "MAW", flag: "🇲🇼" },
  { name: "Malaysia", code: "MAS", flag: "🇲🇾" },
  { name: "Maldives", code: "MDV", flag: "🇲🇻" },
  { name: "Mali", code: "MLI", flag: "🇲🇱" },
  { name: "Malta", code: "MLT", flag: "🇲🇹" },
  { name: "Marshall Islands", code: "MHL", flag: "🇲🇭" },
  { name: "Mauritania", code: "MTN", flag: "🇲🇷" },
  { name: "Mauritius", code: "MRI", flag: "🇲🇺" },
  { name: "Mexico", code: "MEX", flag: "🇲🇽" },
  { name: "Mongolia", code: "MGL", flag: "🇲🇳" },
  { name: "Montenegro", code: "MNE", flag: "🇲🇪" },
  { name: "Morocco", code: "MAR", flag: "🇲🇦" },
  { name: "Mozambique", code: "MOZ", flag: "🇲🇿" },
  { name: "Myanmar", code: "MYA", flag: "🇲🇲" },
  { name: "Namibia", code: "NAM", flag: "🇳🇦" },
  { name: "Nepal", code: "NEP", flag: "🇳🇵" },
  { name: "Netherlands", code: "NED", flag: "🇳🇱" },
  { name: "Nicaragua", code: "NCA", flag: "🇳🇮" },
  { name: "Niger", code: "NIG", flag: "🇳🇪" },
  { name: "Nigeria", code: "NGR", flag: "🇳🇬" },
  { name: "North Macedonia", code: "MKD", flag: "🇲🇰" },
  { name: "Norway", code: "NOR", flag: "🇳🇴" },
  { name: "Oman", code: "OMA", flag: "🇴🇲" },
  { name: "Pakistan", code: "PAK", flag: "🇵🇰" },
  { name: "Palestine", code: "PLE", flag: "🇵🇸" },
  { name: "Panama", code: "PAN", flag: "🇵🇦" },
  { name: "Papua New Guinea", code: "PNG", flag: "🇵🇬" },
  { name: "Paraguay", code: "PAR", flag: "🇵🇾" },
  { name: "People`s Republic of China", code: "CHN", flag: "🇨🇳" },
  { name: "Peru", code: "PER", flag: "🇵🇪" },
  { name: "Philippines", code: "PHI", flag: "🇵🇭" },
  { name: "Poland", code: "POL", flag: "🇵🇱" },
  { name: "Portugal", code: "POR", flag: "🇵🇹" },
  { name: "Puerto Rico", code: "PUR", flag: "🇵🇷" },
  { name: "Qatar", code: "QAT", flag: "🇶🇦" },
  { name: "Republic of Korea", code: "KOR", flag: "🇰🇷" },
  { name: "Republic of Moldova", code: "MDA", flag: "🇲🇩" },
  { name: "Romania", code: "ROU", flag: "🇷🇴" },
  { name: "Russian Federation", code: "RUS", flag: "🇷🇺" },
  { name: "Rwanda", code: "RWA", flag: "🇷🇼" },
  { name: "Saint Kitts and Nevis", code: "SKN", flag: "🇰🇳" },
  { name: "Saint Lucia", code: "LCA", flag: "🇱🇨" },
  { name: "Saint Vincent and the Grenadines", code: "VIN", flag: "🇻🇨" },
  { name: "Senegal", code: "SEN", flag: "🇸🇳" },
  { name: "Serbia", code: "SRB", flag: "🇷🇸" },
  { name: "Seychelles", code: "SEY", flag: "🇸🇨" },
  { name: "Sierra Leone", code: "SLE", flag: "🇸🇱" },
  { name: "Slovakia", code: "SVK", flag: "🇸🇰" },
  { name: "Slovenia", code: "SLO", flag: "🇸🇮" },
  { name: "Solomon Islands", code: "SOL", flag: "🇸🇧" },
  { name: "Somalia", code: "SOM", flag: "🇸🇴" },
  { name: "South Africa", code: "RSA", flag: "🇿🇦" },
  { name: "South Sudan", code: "SSD", flag: "🇸🇸" },
  { name: "Spain", code: "ESP", flag: "🇪🇸" },
  { name: "Sri Lanka", code: "SRI", flag: "🇱🇰" },
  { name: "Sudan", code: "SUD", flag: "🇸🇩" },
  { name: "Sweden", code: "SWE", flag: "🇸🇪" },
  { name: "Syrian Arab Republic", code: "SYR", flag: "🇸🇾" },
  { name: "São Tomé and Príncipe", code: "STP", flag: "🇸🇹" },
  { name: "Tajikistan", code: "TJK", flag: "🇹🇯" },
  { name: "Thailand", code: "THA", flag: "🇹🇭" },
  { name: "Timor-Leste", code: "TLS", flag: "🇹🇱" },
  { name: "Togo", code: "TOG", flag: "🇹🇬" },
  { name: "Tonga", code: "TGA", flag: "🇹🇴" },
  { name: "Trinidad and Tobago", code: "TTO", flag: "🇹🇹" },
  { name: "Tunisia", code: "TUN", flag: "🇹🇳" },
  { name: "Turkmenistan", code: "TKM", flag: "🇹🇲" },
  { name: "Türkiye", code: "TUR", flag: "🇹🇷" },
  { name: "U.S. Virgin Islands", code: "ISV", flag: "🇻🇮" },
  { name: "Uganda", code: "UGA", flag: "🇺🇬" },
  { name: "Ukraine", code: "UKR", flag: "🇺🇦" },
  { name: "United Arab Emirates", code: "UAE", flag: "🇦🇪" },
  { name: "United Republic of Tanzania", code: "TAN", flag: "🇹🇿" },
  { name: "United States of America", code: "USA", flag: "🇺🇸" },
  { name: "Uruguay", code: "URU", flag: "🇺🇾" },
  { name: "Uzbekistan", code: "UZB", flag: "🇺🇿" },
  { name: "Vanuatu", code: "VAN", flag: "🇻🇺" },
  { name: "Venezuela", code: "VEN", flag: "🇻🇪" },
  { name: "Vietnam", code: "VIE", flag: "🇻🇳" },
  { name: "Yemen", code: "YEM", flag: "🇾🇪" },
  { name: "Zambia", code: "ZAM", flag: "🇿🇲" },
  { name: "Zimbabwe", code: "ZIM", flag: "🇿🇼" },
]

/**
 * 公式データに現れない名前を返す。表記が違うと、いま貯めたピット記録が
 * 公式の順位表と結びつかない。黙って落とさず画面に出すためのもの。
 */
export function unmatchedNames(
  official: readonly string[],
  candidates: readonly string[],
): readonly string[] {
  const known = new Set(official)
  return candidates.filter((name) => !known.has(name))
}

/**
 * IOC コードから表示名を引く。**公式が名前を返さないときの受け皿。**
 *
 * 試合の `participants[]` は `country`（IOC コード）しか持たず、名前は
 * `rankings[].team.name` から引く作りになっている。ところが**順位表は
 * 1試合も消化していない間は空**で、2026はその状態でマッチスケジュールだけが
 * 先に出た。そのままだと全チームが `AFG` のようなコードで並び、
 * `OUR_TEAM = "Japan"` もどの試合にも一致しない。
 *
 * 引けないコードは `null` を返す。呼び出し側はコードのまま出す（落とさない）。
 */
export function nameOfCode(code: string): string | null {
  const upper = code.toUpperCase()
  return ROSTER_2026.find((team) => team.code === upper)?.name ?? null
}

/** 名前の横に出す国旗。分からない国は空文字を返す。 */
export function flagOf(name: string): string {
  return ROSTER_2026.find((team) => team.name === name)?.flag ?? ""
}

/**
 * 名前でも IOC コードでも引けるようにする。会場では「JPN」のように
 * 3文字で言うことがあり、名前だけだと探せない。
 */
export function matchesQuery(name: string, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === "") return true
  if (name.toLowerCase().includes(needle)) return true
  const code = ROSTER_2026.find((team) => team.name === name)?.code
  return (
    code !== null && code !== undefined && code.toLowerCase().includes(needle)
  )
}
