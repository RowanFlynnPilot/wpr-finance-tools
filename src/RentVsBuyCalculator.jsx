import { useState, useMemo } from 'react'
import CONSTANTS from './local-constants.json'

// Fail fast at module load. A widget that renders wrong numbers is worse than one that throws.
;(function validate(c) {
  const checks = [
    c?.market?.median_sale_price?.value > 0,
    Array.isArray(c?.property_tax?.municipalities) && c.property_tax.municipalities.length > 0,
    c.property_tax?.municipalities?.every(
      (m) => m.id && m.name && m.effective_rate > 0 && m.lottery_credit > 0 && m.first_dollar_credit > 0,
    ),
    Array.isArray(c?.insurance?.premium_bands) &&
      c.insurance.premium_bands.length >= 2 &&
      c.insurance.premium_bands.at(-1).up_to === null,
    c?.pmi?.annual_rate_of_loan > 0 && c?.pmi?.ltv_threshold > 0,
    c?.closing_costs?.buyer_rate_of_price > 0,
    c?.loan_defaults?.rate_pct > 0 && c?.loan_defaults?.term_years > 0,
    c?.rent?.median_rent_monthly?.value > 0,
    typeof c?.market?.municipal_typical_prices?.values === 'object' &&
      Object.entries(c.market.municipal_typical_prices.values).every(
        ([id, t]) =>
          t.median > 0 &&
          t.n > 0 &&
          c.property_tax.municipalities.some((m) => m.id === id),
      ),
    c?.rent?.rent_growth_pct >= 0,
    c?.rent?.investment_return_pct >= 0,
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

export default function RentVsBuyCalculator() {
  const median = CONSTANTS.market.median_sale_price.value
  const munis = CONSTANTS.property_tax.municipalities

  const [price, setPrice] = useState(median)
  const [downPct, setDownPct] = useState(CONSTANTS.loan_defaults.down_payment_pct)
  const [ratePct, setRatePct] = useState(CONSTANTS.loan_defaults.rate_pct)
  const [muniId, setMuniId] = useState(munis[0].id)
  const [rent, setRent] = useState(CONSTANTS.rent.median_rent_monthly.value)
  const [rentGrowthPct, setRentGrowthPct] = useState(CONSTANTS.rent.rent_growth_pct)
  const [investPct, setInvestPct] = useState(CONSTANTS.rent.investment_return_pct)
  const [years, setYears] = useState(5)

  const out = useMemo(() => {
    const termYears = CONSTANTS.loan_defaults.term_years
    const muni = munis.find((m) => m.id === muniId)
    const down = price * (downPct / 100)
    const loan = price - down
    const closing = price * CONSTANTS.closing_costs.buyer_rate_of_price
    const upfront = down + closing

    const pi = monthlyPI(loan, ratePct, termYears)
    // Primary residence assumed: rent-vs-buy is an owner-occupancy question
    const taxM =
      Math.max(
        0,
        price * muni.effective_rate - muni.first_dollar_credit - muni.lottery_credit,
      ) / 12
    const insM =
      CONSTANTS.insurance.premium_bands.find((b) => b.up_to === null || price <= b.up_to)
        .annual_premium / 12

    // Month-by-month so PMI drops off when equity passes the LTV threshold
    const r = ratePct / 100 / 12
    const pmiM = (loan * CONSTANTS.pmi.annual_rate_of_loan) / 12
    let bal = loan
    let buyPayments = 0
    for (let m = 0; m < years * 12; m++) {
      const pmi = bal / price > CONSTANTS.pmi.ltv_threshold ? pmiM : 0
      buyPayments += pi + taxM + insM + pmi
      bal -= pi - bal * r
    }
    const equity = price - Math.max(bal, 0)
    const buyOutlay = upfront + buyPayments
    const buyNet = buyOutlay - equity

    let rentPaid = 0
    for (let y = 0; y < years; y++) {
      rentPaid += rent * 12 * Math.pow(1 + rentGrowthPct / 100, y)
    }
    const portfolio = upfront * Math.pow(1 + investPct / 100 / 12, years * 12)
    const invGain = portfolio - upfront
    const rentNet = rentPaid - invGain

    return { muni, upfront, buyPayments, buyOutlay, equity, buyNet, rentPaid, invGain, rentNet }
  }, [price, downPct, ratePct, muniId, rent, rentGrowthPct, investPct, years, munis])

  const buyWins = out.buyNet < out.rentNet
  const gap = Math.abs(out.buyNet - out.rentNet)

  return (
    <div className="tcc-root">
      <p className="tcc-eyebrow">WPR Homebuyer Tools · Marathon County</p>
      <h1 className="tcc-title">Rent or buy in Marathon County?</h1>
      <p className="tcc-dek">
        Compares the {years}-year net cost of buying — using{' '}
        <strong>actual Marathon County tax rates and credits</strong> — against renting at{' '}
        <strong>{usd(rent)}/mo</strong>, with your would-be down payment invested instead. Rent
        default is HUD's FY2026 fair market rent for a 3-bedroom in the Wausau metro (
        {usd(CONSTANTS.rent.median_rent_monthly.value)}).
      </p>

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
            {CONSTANTS.market.municipal_typical_prices.values[muniId] ? (
              <div className="tcc-typical">
                Typical sale here:{' '}
                <span className="num">
                  {usd(CONSTANTS.market.municipal_typical_prices.values[muniId].median)}
                </span>{' '}
                ({CONSTANTS.market.municipal_typical_prices.values[muniId].n} sales, 12 mo)
                <button
                  className="tcc-use"
                  onClick={() =>
                    setPrice(CONSTANTS.market.municipal_typical_prices.values[muniId].median)
                  }
                >
                  Use it →
                </button>
              </div>
            ) : (
              <div className="tcc-typical">
                Too few recent sales here for a local median — county-wide default shown.
              </div>
            )}
          </div>

          <div className="tcc-field">
            <div className="tcc-label">
              <span>Monthly rent today</span>
              <span className="val">{usd(rent)}</span>
            </div>
            <input
              className="tcc-range"
              type="range"
              min={500}
              max={3000}
              step={25}
              value={rent}
              onChange={(e) => setRent(Number(e.target.value))}
              aria-label="Monthly rent"
            />
          </div>

          <div className="tcc-field">
            <div className="tcc-label">
              <span>Rent growth</span>
              <span className="val">{rentGrowthPct.toFixed(2)}%/yr</span>
            </div>
            <input
              className="tcc-range"
              type="range"
              min={0}
              max={8}
              step={0.25}
              value={rentGrowthPct}
              onChange={(e) => setRentGrowthPct(Number(e.target.value))}
              aria-label="Annual rent growth"
            />
          </div>

          <div className="tcc-field">
            <div className="tcc-label">
              <span>Return on invested down payment</span>
              <span className="val">{investPct.toFixed(2)}%/yr</span>
            </div>
            <input
              className="tcc-range"
              type="range"
              min={0}
              max={10}
              step={0.25}
              value={investPct}
              onChange={(e) => setInvestPct(Number(e.target.value))}
              aria-label="Investment return on down payment"
            />
          </div>

          <div className="tcc-field">
            <div className="tcc-label">
              <span>Time horizon</span>
            </div>
            <div className="tcc-term" role="group" aria-label="Time horizon">
              {[5, 10].map((y) => (
                <button key={y} className={years === y ? 'on' : ''} onClick={() => setYears(y)}>
                  {y} yr
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="tcc-ledger">
          <div className="tcc-ledger-head">
            {years} years · {out.muni.name}
          </div>

          <div className="tcc-side-head">Buying</div>
          <div className="tcc-row">
            <span>Cash to close</span>
            <span className="dot" />
            <span className="num">{usd(out.upfront)}</span>
          </div>
          <div className="tcc-row">
            <span>Payments over {years} yrs</span>
            <span className="dot" />
            <span className="num">{usd(out.buyPayments)}</span>
          </div>
          <div className="tcc-row">
            <span>Equity built</span>
            <span className="dot" />
            <span className="num">−{usd(out.equity)}</span>
          </div>
          <div className="tcc-row tcc-row-net">
            <span>Net cost of buying</span>
            <span className="dot" />
            <span className="num">{usd(out.buyNet)}</span>
          </div>

          <div className="tcc-side-head">Renting</div>
          <div className="tcc-row">
            <span>Rent over {years} yrs</span>
            <span className="dot" />
            <span className="num">{usd(out.rentPaid)}</span>
          </div>
          <div className="tcc-row">
            <span>Growth on invested {usd(out.upfront)}</span>
            <span className="dot" />
            <span className="num">−{usd(out.invGain)}</span>
          </div>
          <div className="tcc-row tcc-row-net">
            <span>Net cost of renting</span>
            <span className="dot" />
            <span className="num">{usd(out.rentNet)}</span>
          </div>

          <div className="tcc-total">
            <span className="lbl">{buyWins ? 'Buying' : 'Renting'} nets</span>
            <span>
              <span className="num">{usd(gap)}</span>
              <span className="per">less over {years} yrs</span>
            </span>
          </div>
        </div>
      </div>

      <div className="tcc-foot">
        Estimates only — not a loan offer or financial advice. Assumes a level home price (no
        appreciation or depreciation), owner-occupancy (tax includes the 2025–26 school levy,
        lottery, and first dollar credits), and that the renter invests the full down payment and
        closing costs at the chosen return; monthly cost differences are not invested by either
        side, and maintenance, utilities, and selling costs are not modeled. HUD fair market rent
        includes utilities. Buying costs use the same DOR tax, NAIC insurance, and PMI data as the
        True Cost calculator. Updated {CONSTANTS._meta.updated}.
      </div>

      <div className="tcc-sponsor">
        <div>
          <div className="tag">Homebuyer tools presented by</div>
          <div className="name">
            {CONSTANTS.sponsor.name ? CONSTANTS.sponsor.name : 'Your credit union here'}
          </div>
        </div>
        {CONSTANTS.sponsor.url ? (
          <a
            className="tag tcc-sponsor-link"
            href={CONSTANTS.sponsor.url}
            target="_blank"
            rel="sponsored noopener"
          >
            Talk to a local lender →
          </a>
        ) : (
          <div className="tag">Talk to a local lender →</div>
        )}
      </div>
    </div>
  )
}
