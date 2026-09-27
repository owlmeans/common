import type { JSONSchemaType } from 'ajv'

/**
 * ISO 3166-1 alpha-2 country code → lowercase ISO 4217 currency code — the currency circulating in
 * that country, for the "≈ local total" line of a price estimate. Not a Stripe list: Stripe Tax can
 * compute a rate for a country this map has no entry for (or none at all, `location-required`), and
 * `currencyOfCountry` returning `null` just means the estimate carries no local-currency line, never
 * a rejected request.
 *
 * A territory that circulates another country's currency (Ecuador, Kosovo, Puerto Rico, …) is
 * mapped to that currency, not left out.
 */
export const COUNTRY_CURRENCIES: Readonly<Record<string, string>> = Object.freeze({
  AD: 'eur', AE: 'aed', AF: 'afn', AG: 'xcd', AI: 'xcd', AL: 'all', AM: 'amd', AO: 'aoa',
  AR: 'ars', AS: 'usd', AT: 'eur', AU: 'aud', AW: 'awg', AX: 'eur', AZ: 'azn',
  BA: 'bam', BB: 'bbd', BD: 'bdt', BE: 'eur', BF: 'xof', BG: 'bgn', BH: 'bhd', BI: 'bif',
  BJ: 'xof', BL: 'eur', BM: 'bmd', BN: 'bnd', BO: 'bob', BQ: 'usd', BR: 'brl', BS: 'bsd',
  BT: 'btn', BW: 'bwp', BY: 'byn', BZ: 'bzd',
  CA: 'cad', CD: 'cdf', CF: 'xaf', CG: 'xaf', CH: 'chf', CI: 'xof', CK: 'nzd', CL: 'clp',
  CM: 'xaf', CN: 'cny', CO: 'cop', CR: 'crc', CU: 'cup', CV: 'cve', CW: 'ang', CY: 'eur',
  CZ: 'czk',
  DE: 'eur', DJ: 'djf', DK: 'dkk', DM: 'xcd', DO: 'dop', DZ: 'dzd',
  EC: 'usd', EE: 'eur', EG: 'egp', EH: 'mad', ER: 'ern', ES: 'eur', ET: 'etb',
  FI: 'eur', FJ: 'fjd', FK: 'fkp', FM: 'usd', FO: 'dkk', FR: 'eur',
  GA: 'xaf', GB: 'gbp', GD: 'xcd', GE: 'gel', GF: 'eur', GG: 'gbp', GH: 'ghs', GI: 'gip',
  GL: 'dkk', GM: 'gmd', GN: 'gnf', GP: 'eur', GQ: 'xaf', GR: 'eur', GT: 'gtq', GU: 'usd',
  GW: 'xof', GY: 'gyd',
  HK: 'hkd', HN: 'hnl', HR: 'eur', HT: 'htg', HU: 'huf',
  ID: 'idr', IE: 'eur', IL: 'ils', IM: 'gbp', IN: 'inr', IQ: 'iqd', IR: 'irr', IS: 'isk',
  IT: 'eur',
  JE: 'gbp', JM: 'jmd', JO: 'jod', JP: 'jpy',
  KE: 'kes', KG: 'kgs', KH: 'khr', KI: 'aud', KM: 'kmf', KN: 'xcd', KP: 'kpw', KR: 'krw',
  KW: 'kwd', KY: 'kyd', KZ: 'kzt',
  LA: 'lak', LB: 'lbp', LC: 'xcd', LI: 'chf', LK: 'lkr', LR: 'lrd', LS: 'lsl', LT: 'eur',
  LU: 'eur', LV: 'eur', LY: 'lyd',
  MA: 'mad', MC: 'eur', MD: 'mdl', ME: 'eur', MF: 'eur', MG: 'mga', MH: 'usd', MK: 'mkd',
  ML: 'xof', MM: 'mmk', MN: 'mnt', MO: 'mop', MQ: 'eur', MR: 'mru', MS: 'xcd', MT: 'eur',
  MU: 'mur', MV: 'mvr', MW: 'mwk', MX: 'mxn', MY: 'myr', MZ: 'mzn',
  NA: 'nad', NC: 'xpf', NE: 'xof', NG: 'ngn', NI: 'nio', NL: 'eur', NO: 'nok', NP: 'npr',
  NR: 'aud', NU: 'nzd', NZ: 'nzd',
  OM: 'omr',
  PA: 'pab', PE: 'pen', PF: 'xpf', PG: 'pgk', PH: 'php', PK: 'pkr', PL: 'pln', PR: 'usd',
  PS: 'ils', PT: 'eur', PW: 'usd', PY: 'pyg',
  QA: 'qar',
  RE: 'eur', RO: 'ron', RS: 'rsd', RU: 'rub', RW: 'rwf',
  SA: 'sar', SB: 'sbd', SC: 'scr', SD: 'sdg', SE: 'sek', SG: 'sgd', SH: 'shp', SI: 'eur',
  SK: 'eur', SL: 'sle', SM: 'eur', SN: 'xof', SO: 'sos', SR: 'srd', SS: 'ssp', ST: 'stn',
  SV: 'usd', SX: 'ang', SY: 'syp', SZ: 'szl',
  TC: 'usd', TD: 'xaf', TG: 'xof', TH: 'thb', TJ: 'tjs', TK: 'nzd', TL: 'usd', TM: 'tmt',
  TN: 'tnd', TO: 'top', TR: 'try', TT: 'ttd', TV: 'aud', TW: 'twd', TZ: 'tzs',
  UA: 'uah', UG: 'ugx', US: 'usd', UY: 'uyu', UZ: 'uzs',
  VA: 'eur', VC: 'xcd', VE: 'ves', VG: 'usd', VI: 'usd', VN: 'vnd', VU: 'vuv',
  WF: 'xpf', WS: 'wst',
  YE: 'yer', YT: 'eur',
  ZA: 'zar', ZM: 'zmw', ZW: 'zwl',
})

export const COUNTRY_CODES: readonly string[] = Object.freeze(Object.keys(COUNTRY_CURRENCIES).sort())

/** The lowercase ISO 4217 currency of a country, or `null` when this map has no entry for it. */
export const currencyOfCountry = (country: string): string | null =>
  COUNTRY_CURRENCIES[country.toUpperCase()] ?? null

/**
 * A permissive ISO 3166-1 alpha-2 shape (two uppercase letters) — not restricted to
 * `COUNTRY_CURRENCIES`, so a country this map cannot name a currency for is still a valid request;
 * it only loses the local-currency line of its estimate.
 */
export const CountrySchema: JSONSchemaType<string> = {
  type: 'string', pattern: '^[A-Z]{2}$',
}
