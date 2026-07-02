import { useState, useMemo } from 'react'
import CONSTANTS from './local-constants.json'

// Fail fast at module load. A widget that renders wrong numbers is worse than one that throws.
;(function validate(c) {
  const checks = [
    c?.market?.median_sale_price?.value > 0,
    typeof c?.market?.median_sale_price?.note === 'string' &&
      c.market.median_sale_price.note.length > 0,
    Array.isArray(c?.property_tax?.municipalities) && c.property_tax.municipalities.length > 0,
    c.property_tax?.municipalities?.every(
      (m) => m.id && m.name && m.effective_rate > 0 && ['city', 'village', 'town'].includes(m.type),
    ),
    c?.insurance?.annual_rate_of_price > 0,
    c?.pmi?.annual_rate_of_loan > 0 && c?.pmi?.ltv_threshold > 0,
    c?.closing_costs?.buyer_rate_of_price > 0,
    c?.loan_defaults?.rate_pct > 0 && c?.loan_defaults?.term_years > 0,
  ]
  if (!checks.every(Boolean)) {
    throw new Error(
      'local-constants.json failed validation — refusing to render with incomplete data.',
    )
  }
})(CONSTANTS)

const usd = (n) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

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

  const out = useMemo(() => {
    const muni = munis.find((m) => m.id === muniId)
    const down = price * (downPct / 100)
    const loan = price - down
    const ltv = loan / price

    const pi = monthlyPI(loan, ratePct, termYears)
    const tax = (price * muni.effective_rate) / 12
    const ins = (price * CONSTANTS.insurance.annual_rate_of_price) / 12
    const pmi =
      ltv > CONSTANTS.pmi.ltv_threshold ? (loan * CONSTANTS.pmi.annual_rate_of_loan) / 12 : 0
    const total = pi + tax + ins + pmi
    const closing = price * CONSTANTS.closing_costs.buyer_rate_of_price

    return { muni, down, loan, pi, tax, ins, pmi, total, closing, cashToClose: down + closing }
  }, [price, downPct, ratePct, termYears, muniId, munis])

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
        </div>
      </div>

      <div className="tcc-foot">
        Estimates only — not a loan offer or financial advice. Property tax uses each
        municipality's effective full-value rate (total levy less the school levy credit ÷
        equalized value) from the Wisconsin DOR's 2025 Town, Village and City Taxes report; your
        assessed bill will differ, and lottery and first-dollar credits may lower it. Insurance
        estimated at Wisconsin's average premium relative to home value. Median sale price computed
        from Wisconsin DOR transfer records via WPR's property transaction data. Updated{' '}
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
