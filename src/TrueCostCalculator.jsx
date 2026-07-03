import { useState, useMemo } from 'react'
import CONSTANTS from './local-constants.json'

// Fail fast at module load. A widget that renders wrong numbers is worse than one that throws.
;(function validate(c) {
  const checks = [
    c?.market?.median_sale_price?.value > 0,
    typeof c?.market?.median_sale_price?.note === 'string' &&
      c.market.median_sale_price.note.length > 0,
    Array.isArray(c?.market?.median_trend?.months) &&
      Array.isArray(c?.market?.median_trend?.medians) &&
      c.market.median_trend.months.length >= 2 &&
      c.market.median_trend.months.length === c.market.median_trend.medians.length &&
      c.market.median_trend.medians.every((v) => v > 0),
    Array.isArray(c?.property_tax?.municipalities) && c.property_tax.municipalities.length > 0,
    c.property_tax?.municipalities?.every(
      (m) => m.id && m.name && m.effective_rate > 0 && ['city', 'village', 'town'].includes(m.type),
    ),
    c.property_tax?.municipalities?.every(
      (m) => m.lottery_credit > 0 && m.first_dollar_credit > 0,
    ),
    Array.isArray(c?.insurance?.premium_bands) &&
      c.insurance.premium_bands.length >= 2 &&
      c.insurance.premium_bands.every((b) => b.annual_premium > 0) &&
      c.insurance.premium_bands.at(-1).up_to === null &&
      c.insurance.premium_bands
        .slice(0, -1)
        .every((b, i, a) => b.up_to > 0 && (i === 0 || b.up_to > a[i - 1].up_to)),
    c?.pmi?.annual_rate_of_loan > 0 && c?.pmi?.ltv_threshold > 0,
    c?.closing_costs?.buyer_rate_of_price > 0,
    c?.loan_defaults?.rate_pct > 0 && c?.loan_defaults?.term_years > 0,
    c?.affordability?.front_end_dti > 0 && c.affordability.front_end_dti < 1,
  ]
  if (!checks.every(Boolean)) {
    throw new Error(
      'local-constants.json failed validation — refusing to render with incomplete data.',
    )
  }
})(CONSTANTS)

const usd = (n) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const monthLabel = (ym) => {
  const [y, m] = ym.split('-')
  const name = new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'short' })
  return `${name} '${y.slice(2)}`
}

function Sparkline({ values }) {
  const W = 132
  const H = 26
  const pad = 2.5
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (W - 2 * pad),
    H - pad - ((v - min) / span) * (H - 2 * pad),
  ])
  const last = pts[pts.length - 1]
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline
        points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
        fill="none"
        stroke="#3A867C"
        strokeWidth="1.5"
      />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill="#3A867C" />
    </svg>
  )
}

function monthlyPI(principal, annualRatePct, termYears) {
  const r = annualRatePct / 100 / 12
  const n = termYears * 12
  if (r === 0) return principal / n
  const f = Math.pow(1 + r, n)
  return (principal * r * f) / (f - 1)
}

export default function TrueCostCalculator() {
  const median = CONSTANTS.market.median_sale_price.value
  const munis = CONSTANTS.property_tax.municipalities

  const [price, setPrice] = useState(median)
  const [downPct, setDownPct] = useState(CONSTANTS.loan_defaults.down_payment_pct)
  const [ratePct, setRatePct] = useState(CONSTANTS.loan_defaults.rate_pct)
  const [termYears, setTermYears] = useState(CONSTANTS.loan_defaults.term_years)
  const [muniId, setMuniId] = useState(munis[0].id)
  const [primaryRes, setPrimaryRes] = useState(true)

  const out = useMemo(() => {
    const muni = munis.find((m) => m.id === muniId)
    const down = price * (downPct / 100)
    const loan = price - down
    const ltv = loan / price

    const pi = monthlyPI(loan, ratePct, termYears)
    // First dollar credit applies to any improved parcel; lottery credit to primary residences
    const taxAnnual = Math.max(
      0,
      price * muni.effective_rate -
        muni.first_dollar_credit -
        (primaryRes ? muni.lottery_credit : 0),
    )
    const tax = taxAnnual / 12
    const ins =
      CONSTANTS.insurance.premium_bands.find((b) => b.up_to === null || price <= b.up_to)
        .annual_premium / 12
    const pmi =
      ltv > CONSTANTS.pmi.ltv_threshold ? (loan * CONSTANTS.pmi.annual_rate_of_loan) / 12 : 0
    const total = pi + tax + ins + pmi
    const closing = price * CONSTANTS.closing_costs.buyer_rate_of_price

    // Loan balance after 5 years; equity assumes a level home price (no appreciation)
    const r = ratePct / 100 / 12
    const k = Math.pow(1 + r, 60)
    const balance5 = r === 0 ? loan - pi * 60 : loan * k - (pi * (k - 1)) / r
    const equity5 = price - Math.max(balance5, 0)
    const interestLife = pi * termYears * 12 - loan
    const incomeNeeded = (total / CONSTANTS.affordability.front_end_dti) * 12
    const totalAt = (rp) => monthlyPI(loan, rp, termYears) + tax + ins + pmi

    return {
      muni, down, loan, pi, tax, ins, pmi, total, closing,
      cashToClose: down + closing,
      taxAnnual,
      equity5, interestLife, incomeNeeded,
      totalLo: totalAt(ratePct - 1),
      totalHi: totalAt(ratePct + 1),
    }
  }, [price, downPct, ratePct, termYears, muniId, munis, primaryRes])

  const bars = [
    { label: 'Principal & interest', value: out.pi, color: '#3A867C' },
    { label: 'Property tax', value: out.tax, color: '#4aaba7' },
    { label: 'Insurance', value: out.ins, color: '#9ccbc4' },
    ...(out.pmi > 0 ? [{ label: 'PMI', value: out.pmi, color: '#d9a441' }] : []),
  ]

  return (
    <div className="tcc-root">
      <p className="tcc-eyebrow">WPR Homebuyer Tools · Marathon County</p>
      <h1 className="tcc-title">The true cost of buying here</h1>
      <p className="tcc-dek">
        National calculators guess at taxes and insurance. This one uses{' '}
        <strong>actual Marathon County effective tax rates</strong> and the{' '}
        <strong>{usd(median)} median sale price</strong> from Wausau Pilot &amp; Review's property
        transaction records ({CONSTANTS.market.median_sale_price.as_of}).
      </p>
      <p className="tcc-method-note">{CONSTANTS.market.median_sale_price.note}</p>
      <div className="tcc-trend">
        <Sparkline values={CONSTANTS.market.median_trend.medians} />
        <span>
          Monthly medians {monthLabel(CONSTANTS.market.median_trend.months[0])} –{' '}
          {monthLabel(CONSTANTS.market.median_trend.months.at(-1))}: low{' '}
          {usd(Math.min(...CONSTANTS.market.median_trend.medians))} · high{' '}
          {usd(Math.max(...CONSTANTS.market.median_trend.medians))}
        </span>
      </div>

      <div className="tcc-grid">
        <div>
          <div className="tcc-field">
            <div className="tcc-label">
              <span>Home price</span>
              <span className="val">{usd(price)}</span>
            </div>
            <input
              className="tcc-range"
              type="range"
              min={80000}
              max={600000}
              step={5000}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              aria-label="Home price"
            />
          </div>

          <div className="tcc-field">
            <div className="tcc-label">
              <span>Down payment</span>
              <span className="val">
                {downPct}% · {usd((price * downPct) / 100)}
              </span>
            </div>
            <input
              className="tcc-range"
              type="range"
              min={3}
              max={40}
              step={1}
              value={downPct}
              onChange={(e) => setDownPct(Number(e.target.value))}
              aria-label="Down payment percent"
            />
          </div>

          <div className="tcc-field">
            <div className="tcc-label">
              <span>Interest rate</span>
              <span className="val">{ratePct.toFixed(2)}%</span>
            </div>
            <input
              className="tcc-range"
              type="range"
              min={4}
              max={9}
              step={0.05}
              value={ratePct}
              onChange={(e) => setRatePct(Number(e.target.value))}
              aria-label="Mortgage interest rate"
            />
          </div>

          <div className="tcc-field">
            <div className="tcc-label">
              <span>Loan term</span>
            </div>
            <div className="tcc-term" role="group" aria-label="Loan term">
              {[30, 15].map((t) => (
                <button
                  key={t}
                  className={termYears === t ? 'on' : ''}
                  onClick={() => setTermYears(t)}
                >
                  {t} yr
                </button>
              ))}
            </div>
          </div>

          <div className="tcc-field">
            <div className="tcc-label">
              <span>Where</span>
            </div>
            <select
              className="tcc-select"
              value={muniId}
              onChange={(e) => setMuniId(e.target.value)}
              aria-label="Municipality"
            >
              {[
                ['city', 'Cities'],
                ['village', 'Villages'],
                ['town', 'Towns'],
              ].map(([type, label]) => (
                <optgroup key={type} label={label}>
                  {munis
                    .filter((m) => m.type === type)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — {(m.effective_rate * 100).toFixed(2)}% effective tax
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <label className="tcc-check">
              <input
                type="checkbox"
                checked={primaryRes}
                onChange={(e) => setPrimaryRes(e.target.checked)}
              />
              <span>This will be my primary residence (lottery credit applied)</span>
            </label>
          </div>
        </div>

        <div className="tcc-ledger">
          <div className="tcc-ledger-head">Monthly · {out.muni.name}</div>

          {bars.map((b) => (
            <div className="tcc-row" key={b.label}>
              <span>
                <span className="swatch" style={{ background: b.color }} />
                {b.label}
              </span>
              <span className="dot" />
              <span className="num">{usd(b.value)}</span>
            </div>
          ))}

          <div className="tcc-bar" aria-hidden="true">
            {bars.map((b) => (
              <div
                key={b.label}
                style={{ width: `${(b.value / out.total) * 100}%`, background: b.color }}
              />
            ))}
          </div>

          <div className="tcc-total">
            <span className="lbl">Total</span>
            <span>
              <span className="num">{usd(out.total)}</span>
              <span className="per">/mo</span>
            </span>
          </div>

          <div className="tcc-cash">
            Estimated cash to close: <span className="num">{usd(out.cashToClose)}</span>{' '}
            ({usd(out.down)} down + ~{usd(out.closing)} closing costs)
            {out.pmi > 0 && <> · PMI drops off at 20% equity</>}
          </div>

          <div className="tcc-extras">
            <div className="tcc-xrow">
              <span>Income to afford this</span>
              <span className="dot" />
              <span className="num">~{usd(Math.round(out.incomeNeeded / 1000) * 1000)}/yr</span>
            </div>
            <div className="tcc-xrow">
              <span>Equity after 5 years</span>
              <span className="dot" />
              <span className="num">{usd(out.equity5)}</span>
            </div>
            <div className="tcc-xrow">
              <span>Lifetime interest ({termYears} yr)</span>
              <span className="dot" />
              <span className="num">{usd(out.interestLife)}</span>
            </div>
            <div className="tcc-xrow">
              <span>Property tax per year</span>
              <span className="dot" />
              <span className="num">{usd(out.taxAnnual)}</span>
            </div>
            <div className="tcc-sens">
              If rates move a point: {usd(out.totalLo)}/mo at {(ratePct - 1).toFixed(2)}% ·{' '}
              {usd(out.totalHi)}/mo at {(ratePct + 1).toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      <div className="tcc-foot">
        Estimates only — not a loan offer or financial advice. Property tax uses each
        municipality's effective full-value rate (total levy less the school levy credit ÷
        equalized value) from the Wisconsin DOR's 2025 Town, Village and City Taxes report; your
        assessed bill will differ. The tax estimate subtracts the 2025–26 first dollar credit
        and, for primary residences, the lottery &amp; gaming credit (school-district averages
        where a municipality spans districts). Income
        needed applies the standard 28% housing-cost-to-income ratio; equity assumes a level home
        price. Insurance uses Wisconsin average premiums by coverage amount from the NAIC's latest
        state report (2022 data — premiums have risen since, and quotes vary by home and insurer),
        with dwelling coverage approximated by price. Median sale price computed from Wisconsin DOR
        transfer records via WPR's property transaction data. Updated{' '}
        {CONSTANTS._meta.updated}.
      </div>

      <div className="tcc-sponsor">
        <div>
          <div className="tag">Homebuyer tools presented by</div>
          <div className="name">Your credit union here</div>
        </div>
        <div className="tag">Talk to a local lender →</div>
      </div>
    </div>
  )
}
