import CONSTANTS from './local-constants.json'

// Renders the constants contract itself: every number the calculators use,
// where it comes from, its vintage, and whether a human has signed off.
// No literals here — everything on this page is read from local-constants.json.

const usd = (n) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const URL_RE = /(https?:\/\/[^\s)]+)/g

function Linkify({ text }) {
  const parts = text.split(URL_RE)
  return parts.map((p, i) =>
    URL_RE.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noopener">
        {p.replace(/^https?:\/\/(www\.)?/, '')}
      </a>
    ) : (
      <span key={i}>{p}</span>
    ),
  )
}

function Row({ label, value, source, asOf, verified, note }) {
  return (
    <div className="tcc-src-row">
      <div className="tcc-src-head">
        <span className="lbl">{label}</span>
        <span className={verified ? 'badge ok' : 'badge'}>
          {verified ? '✓ reviewed' : 'pending editorial review'}
        </span>
      </div>
      <div className="tcc-src-val">{value}</div>
      <div className="tcc-src-meta">
        Source: <Linkify text={source} />
        {asOf && <> · As of: {asOf}</>}
      </div>
      {note && <div className="tcc-src-note">{note}</div>}
    </div>
  )
}

export default function SourcesPage() {
  const c = CONSTANTS
  const munis = c.property_tax.municipalities
  const allMuniVerified = munis.every((m) => m.verified)
  const bands = c.insurance.premium_bands

  return (
    <div className="tcc-root">
      <p className="tcc-eyebrow">WPR Homebuyer Tools · Marathon County</p>
      <h1 className="tcc-title">Where every number comes from</h1>
      <p className="tcc-dek">
        These calculators contain no live feeds and no guesses: every local figure is baked in
        from a named public source, carries its date, and is flagged until a human editor has
        reviewed it. This page is generated from that same data file.
      </p>

      <Row
        label="Median sale price — Marathon County"
        value={usd(c.market.median_sale_price.value)}
        source={c.market.median_sale_price.source}
        asOf={c.market.median_sale_price.as_of}
        verified={c.market.median_sale_price.verified}
        note={c.market.median_sale_price.note}
      />
      <Row
        label="Monthly median trend"
        value={`${c.market.median_trend.months.length} complete months, ${c.market.median_trend.as_of}`}
        source={c.market.median_trend.source}
        asOf={c.market.median_trend.as_of}
        verified={c.market.median_trend.verified}
        note={c.market.median_trend.note}
      />
      <Row
        label="Typical sale price by municipality"
        value={`${Object.keys(c.market.municipal_typical_prices.values).length} municipalities, window ${c.market.municipal_typical_prices.window}`}
        source={c.market.municipal_typical_prices.source}
        asOf={c.market.municipal_typical_prices.as_of}
        verified={c.market.municipal_typical_prices.verified}
        note={c.market.municipal_typical_prices.note}
      />
      <Row
        label="Median household income"
        value={`County ${usd(c.market.household_income.county.median)} + ${Object.keys(c.market.household_income.values).length} municipalities`}
        source={c.market.household_income.source}
        asOf={c.market.household_income.as_of}
        verified={c.market.household_income.verified}
        note={c.market.household_income.note}
      />
      <Row
        label="Effective property tax rates + state credits"
        value={`${munis.length} taxing districts, each with its own rate, lottery credit, and first dollar credit`}
        source={munis[0].source}
        asOf={munis[0].as_of}
        verified={allMuniVerified}
        note={c.property_tax.note}
      />
      <Row
        label="Homeowners insurance premiums"
        value={`${bands.length} coverage bands, ${usd(bands[0].annual_premium)}–${usd(bands.at(-1).annual_premium)}/yr`}
        source={c.insurance.source}
        asOf={c.insurance.as_of}
        verified={c.insurance.verified}
        note={c.insurance.note}
      />
      <Row
        label="PMI"
        value={`${(c.pmi.annual_rate_of_loan * 100).toFixed(2)}%/yr of the loan while equity is under ${100 - c.pmi.ltv_threshold * 100}%`}
        source="Industry-typical midpoint; not lender-specific"
        verified={c.pmi.verified}
        note={c.pmi.note}
      />
      <Row
        label="Closing costs"
        value={`${(c.closing_costs.buyer_rate_of_price * 100).toFixed(1)}% of price, buyer side`}
        source="Estimate across lender, title, escrow, and recording fees"
        verified={c.closing_costs.verified}
        note={c.closing_costs.note}
      />
      <Row
        label="Affordability ratio"
        value={`${c.affordability.front_end_dti * 100}% of gross income on housing`}
        source="Standard front-end debt-to-income convention"
        verified={c.affordability.verified}
        note={c.affordability.note}
      />
      <Row
        label="Fair market rent"
        value={`${usd(c.rent.median_rent_monthly.value)}/mo`}
        source={c.rent.median_rent_monthly.source}
        asOf={c.rent.median_rent_monthly.as_of}
        verified={c.rent.median_rent_monthly.verified}
        note={c.rent.median_rent_monthly.note}
      />
      <Row
        label="Adjustable assumptions"
        value={`Mortgage rate ${c.loan_defaults.rate_pct}%, rent growth ${c.rent.rent_growth_pct}%/yr, investment return ${c.rent.investment_return_pct}%/yr — starting values only`}
        source="Editorial defaults; every one is a slider the reader controls"
        verified={true}
        note={c.rent.assumptions_note}
      />

      <div className="tcc-foot">
        Estimates only — not a loan offer or financial advice. Data updated {c._meta.updated};
        market figures refresh {c._meta.update_cadence}. "Pending editorial review" means the
        value is sourced as listed but a Wausau Pilot &amp; Review editor has not yet completed
        the sign-off pass.
      </div>
    </div>
  )
}
