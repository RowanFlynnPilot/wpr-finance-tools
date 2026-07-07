import { useState, useMemo } from 'react'
import CONSTANTS from './local-constants.json'

// Fail fast at module load. A widget that renders wrong numbers is worse than one that throws.
;(function validate(c) {
  const checks = [
    c?.market?.median_sale_price?.value > 0,
    typeof c?.market?.median_sale_price?.note === 'string' &&
      c.market.median_sale_price.note.length > 0,
    c?.market?.household_income?.county?.median > 0 &&
      typeof c.market.household_income.values === 'object' &&
      Object.entries(c.market.household_income.values).every(
        ([id, v]) =>
          v.median > 0 && c.property_tax.municipalities.some((m) => m.id === id),
      ),
    typeof c?.market?.municipal_typical_prices?.values === 'object' &&
      Object.entries(c.market.municipal_typical_prices.values).every(
        ([id, t]) =>
          t.median > 0 &&
          t.n > 0 &&
          c.property_tax.municipalities.some((m) => m.id === id),
      ),
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
    typeof c?.sponsor === 'object' &&
      c.sponsor !== null &&
      (c.sponsor.name === null) === (c.sponsor.url === null),
  ]
  if (!checks.every(Boolean)) {
    throw new Error(
      'local-constants.json failed validation — refusing to render with incomplete data.',
    )
  }
})(CONSTANTS)

const usd = (n) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

// Filled-track slider background: teal up to the thumb, parchment beyond it
const rangeBg = (v, min, max) => {
  const p = (((v - min) / (max - min)) * 100).toFixed(1)
  return { background: `linear-gradient(to right, #3A867C ${p}%, #ddd6c6 ${p}%)` }
}

const monthLabel = (ym) => {
  const [y, m] = ym.split('-')
  const name = new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'short' })
  return `${name} '${y.slice(2)}`
}

function AmortizationChart({ loan, ratePct, termYears }) {
  const r = ratePct / 100 / 12
  const pi = monthlyPI(loan, ratePct, termYears)
  const years = []
  let bal = loan
  for (let y = 1; y <= termYears; y++) {
    let interest = 0
    let principal = 0
    for (let m = 0; m < 12; m++) {
      const i = bal * r
      interest += i
      principal += pi - i
      bal -= pi - i
    }
    years.push({ y, interest, principal })
  }
  const crossover = years.find((s) => s.principal > s.interest)?.y
  const year1IntPct = Math.round((years[0].interest / (pi * 12)) * 100)

  const W = 320
  const H = 110
  const padL = 40
  const padR = 18
  const padT = 6
  const padB = 16
  const annual = pi * 12
  const x = (yr) => padL + ((yr - 1) / (termYears - 1)) * (W - padL - padR)
  const yOf = (v) => padT + (1 - v / annual) * (H - padT - padB)
  const boundary = years.map((s) => `${x(s.y).toFixed(1)},${yOf(s.principal).toFixed(1)}`)
  const base = H - padB
  const principalPoly = `${padL},${base} ${boundary.join(' ')} ${W - padR},${base}`

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block', marginTop: 12 }}
        role="img"
        aria-label={`Chart: in year one, ${year1IntPct}% of principal-and-interest payments go to interest.${
          crossover ? ` Principal overtakes interest in year ${crossover}.` : ''
        }`}
      >
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} fill="#e5dfd0" />
        <polygon points={principalPoly} fill="#3A867C" />
        <text x={padL - 4} y={padT + 8} textAnchor="end" fontSize="9"
          fontFamily="JetBrains Mono, monospace" fill="#6b6558">
          {`$${Math.round(annual / 1000)}K/yr`}
        </text>
        {[1, Math.round(termYears / 2), termYears].map((yr) => (
          <text key={yr} x={x(yr)} y={H - 4} textAnchor="middle" fontSize="9"
            fontFamily="JetBrains Mono, monospace" fill="#6b6558">
            {yr} yr
          </text>
        ))}
      </svg>
      <div className="tcc-cross-note">
        <span className="key key-principal" /> principal · <span className="key key-interest" />{' '}
        interest — how each year's P&amp;I splits. Year 1 is {year1IntPct}% interest
        {crossover ? `; principal takes the larger share from year ${crossover}.` : '.'}
      </div>
    </>
  )
}

function TrendChart({ months, medians, counts }) {
  const [active, setActive] = useState(null)
  const W = 680
  const H = 250
  const padL = 48
  const padR = 30
  const padT = 30
  const padB = 30
  const min = Math.min(...medians)
  const max = Math.max(...medians)
  const span = max - min || 1
  const x = (i) => padL + (i / (medians.length - 1)) * (W - padL - padR)
  const y = (v) => padT + (1 - (v - min) / span) * (H - padT - padB)
  const pts = medians.map((v, i) => [x(i), y(v)])
  const line = pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const area = `${padL},${H - padB} ${line} ${W - padR},${H - padB}`
  const kd = (v) => `$${Math.round(v / 1000)}K`
  const last = medians.length - 1

  // Styled tooltip anchored to the active point, clamped to the plot area
  const TIP_W = 150
  const TIP_H = 40
  const tip =
    active !== null &&
    (() => {
      const [px, py] = pts[active]
      const tx = Math.min(Math.max(px - TIP_W / 2, padL - 24), W - padR - TIP_W + 24)
      const above = py - TIP_H - 12 > 4
      const ty = above ? py - TIP_H - 12 : py + 14
      return { tx, ty, px, py }
    })()

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      role="img"
      aria-label={`Line chart of monthly median sale prices, ${monthLabel(months[0])} through ${monthLabel(
        months.at(-1),
      )}: low ${kd(min)}, high ${kd(max)}, latest ${kd(medians.at(-1))}`}
      onMouseLeave={() => setActive(null)}
    >
      {[min, max].map((v) => (
        <g key={v}>
          <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="#cfc8b8"
            strokeWidth="1" strokeDasharray="3 4" />
          <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize="10"
            fontFamily="JetBrains Mono, monospace" fill="#6b6558">
            {kd(v)}
          </text>
        </g>
      ))}
      <polygon points={area} fill="rgba(58, 134, 124, 0.09)" />
      <polyline points={line} fill="none" stroke="#3A867C" strokeWidth="2" />
      {medians.map((v, i) => (
        <g key={months[i]}>
          <circle cx={x(i)} cy={y(v)} r={active === i ? 5 : 3.2} fill="#3A867C"
            stroke="#fffdf8" strokeWidth="1.5" />
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="9"
            fontFamily="JetBrains Mono, monospace"
            fill={active === i ? '#1a1a1a' : '#6b6558'}
            fontWeight={active === i ? '700' : '400'}>
            {monthLabel(months[i])}
          </text>
          {/* generous invisible hit target */}
          <rect x={x(i) - (W - padL - padR) / (2 * last)} y={0}
            width={(W - padL - padR) / last} height={H}
            fill="transparent"
            onMouseEnter={() => setActive(i)}
            onClick={() => setActive(i)} />
        </g>
      ))}
      {/* latest value stays labeled even without hover */}
      <text x={pts[last][0]} y={pts[last][1] - 10} textAnchor="end" fontSize="10.5"
        fontFamily="JetBrains Mono, monospace" fontWeight="700" fill="#1a1a1a">
        {kd(medians[last])}
      </text>
      {tip && (
        <g pointerEvents="none">
          <line x1={tip.px} y1={padT - 4} x2={tip.px} y2={H - padB} stroke="#3A867C"
            strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />
          <rect x={tip.tx} y={tip.ty} width={TIP_W} height={TIP_H} fill="#1a1a1a" />
          <rect x={tip.tx + 2} y={tip.ty + 2} width={TIP_W - 4} height={TIP_H - 4}
            fill="#fffdf8" stroke="#1a1a1a" strokeWidth="1" />
          <text x={tip.tx + TIP_W / 2} y={tip.ty + 17} textAnchor="middle" fontSize="11"
            fontFamily="JetBrains Mono, monospace" fontWeight="700" fill="#1a1a1a">
            {`${monthLabel(months[active])} · ${usd(medians[active])}`}
          </text>
          <text x={tip.tx + TIP_W / 2} y={tip.ty + 31} textAnchor="middle" fontSize="9.5"
            fontFamily="JetBrains Mono, monospace" fill="#6b6558">
            {`median of ${counts[active]} sales`}
          </text>
        </g>
      )}
    </svg>
  )
}

function CompareBars({ label, hereValue, countyValue, format, hereExtra, fallbackNote }) {
  const scale = Math.max(hereValue ?? 0, countyValue)
  const bar = (v) => `${Math.max((v / scale) * 100, 2).toFixed(1)}%`
  return (
    <div className="tcc-glance-row">
      <div className="tcc-glance-lbl">{label}</div>
      {hereValue != null ? (
        <div className="tcc-gline">
          <span className="tag">here</span>
          <span className="tcc-gbar">
            <span className="fill" style={{ width: bar(hereValue) }} />
          </span>
          <span className="gval">
            {format(hereValue)}
            {hereExtra && <span className="gmoe"> {hereExtra}</span>}
          </span>
        </div>
      ) : (
        <div className="tcc-gline muted-note">{fallbackNote}</div>
      )}
      <div className="tcc-gline">
        <span className="tag">county</span>
        <span className="tcc-gbar county">
          <span className="fill" style={{ width: bar(countyValue) }} />
        </span>
        <span className="gval">{format(countyValue)}</span>
      </div>
    </div>
  )
}

function GlancePanel({ muni }) {
  const typical = CONSTANTS.market.municipal_typical_prices.values[muni.id]
  const income = CONSTANTS.market.household_income.values[muni.id]
  const countyPrice = CONSTANTS.market.median_sale_price.value
  const countyIncome = CONSTANTS.market.household_income.county.median
  const basisPrice = typical ? typical.median : countyPrice
  const taxOnTypical = Math.max(
    0,
    basisPrice * muni.effective_rate - muni.first_dollar_credit - muni.lottery_credit,
  )
  return (
    <div className="tcc-glance">
      <div className="tcc-glance-head">At a glance · {muni.name}</div>
      <CompareBars
        label="Typical sale price (12 mo)"
        hereValue={typical ? typical.median : null}
        countyValue={countyPrice}
        format={usd}
        fallbackNote="too few local sales for a figure here"
      />
      <CompareBars
        label="Median household income"
        hereValue={income ? income.median : null}
        countyValue={countyIncome}
        format={usd}
        hereExtra={income && income.moe_pct >= 15 ? `±${Math.round(income.moe_pct)}%` : null}
        fallbackNote="no published Census estimate for this area"
      />
      <div className="tcc-glance-row">
        <div className="tcc-glance-lbl">
          Property tax on the typical {typical ? 'home here' : 'county home'} (primary residence)
        </div>
        <div className="tcc-gline">
          <span className="gval big">
            {usd(taxOnTypical)}/yr · {(muni.effective_rate * 100).toFixed(2)}% effective rate
          </span>
        </div>
      </div>
    </div>
  )
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

// Shared-scenario links: sliders and dropdown state round-trip through the URL
// query string so a configured view can be sent as a plain link.
const urlState = (() => {
  const q = new URLSearchParams(window.location.search)
  const num = (k, min, max) => {
    const v = Number(q.get(k))
    return q.has(k) && Number.isFinite(v) && v >= min && v <= max ? v : null
  }
  return {
    price: num('p', 80000, 600000),
    down: num('d', 3, 40),
    rate: num('r', 4, 9),
    term: [30, 15].includes(Number(q.get('t'))) ? Number(q.get('t')) : null,
    muni: q.get('m'),
    primary: q.get('pr') === '1' ? true : q.get('pr') === '0' ? false : null,
  }
})()

export default function TrueCostCalculator() {
  const median = CONSTANTS.market.median_sale_price.value
  const munis = CONSTANTS.property_tax.municipalities
  const sponsor = CONSTANTS.sponsor

  const [price, setPrice] = useState(urlState.price ?? median)
  const [downPct, setDownPct] = useState(urlState.down ?? CONSTANTS.loan_defaults.down_payment_pct)
  const [ratePct, setRatePct] = useState(urlState.rate ?? CONSTANTS.loan_defaults.rate_pct)
  const [termYears, setTermYears] = useState(urlState.term ?? CONSTANTS.loan_defaults.term_years)
  const [muniId, setMuniId] = useState(
    munis.some((m) => m.id === urlState.muni) ? urlState.muni : munis[0].id,
  )
  const [primaryRes, setPrimaryRes] = useState(urlState.primary ?? true)
  const [copied, setCopied] = useState(false)
  const [trendOpen, setTrendOpen] = useState(false)

  const shareScenario = () => {
    const q = new URLSearchParams({
      p: price, d: downPct, r: ratePct, t: termYears, m: muniId, pr: primaryRes ? '1' : '0',
    })
    const url = `${window.location.origin}${window.location.pathname}?${q}`
    const flash = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
    const legacyCopy = () => {
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
      flash()
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(flash).catch(legacyCopy)
    } else {
      legacyCopy()
    }
  }

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
      {trendOpen ? (
        <div className="tcc-trend-big">
          <TrendChart
            months={CONSTANTS.market.median_trend.months}
            medians={CONSTANTS.market.median_trend.medians}
            counts={CONSTANTS.market.median_trend.counts}
          />
          <div className="tcc-trend-caption">
            <span>
              Monthly median of Marathon County single-family sales. Hover a point for the sale
              count.
            </span>
            <button className="tcc-use" onClick={() => setTrendOpen(false)} aria-expanded="true">
              Collapse ↑
            </button>
          </div>
        </div>
      ) : (
        <div className="tcc-trend">
          <Sparkline values={CONSTANTS.market.median_trend.medians} />
          <span>
            Monthly medians {monthLabel(CONSTANTS.market.median_trend.months[0])} –{' '}
            {monthLabel(CONSTANTS.market.median_trend.months.at(-1))}: low{' '}
            {usd(Math.min(...CONSTANTS.market.median_trend.medians))} · high{' '}
            {usd(Math.max(...CONSTANTS.market.median_trend.medians))}
          </span>
          <button className="tcc-use" onClick={() => setTrendOpen(true)} aria-expanded="false">
            Expand chart →
          </button>
        </div>
      )}

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
              aria-valuetext={usd(price)}
              style={rangeBg(price, 80000, 600000)}
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
              aria-valuetext={`${downPct}%, ${usd((price * downPct) / 100)}`}
              style={rangeBg(downPct, 3, 40)}
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
              aria-valuetext={`${ratePct.toFixed(2)}%`}
              style={rangeBg(ratePct, 4, 9)}
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

          <GlancePanel muni={out.muni} />
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
                title={`${b.label}: ${usd(b.value)}/mo`}
                style={{ width: `${(b.value / out.total) * 100}%`, background: b.color }}
              />
            ))}
          </div>

          <div className="tcc-total" aria-live="polite">
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
              <span>
                Median household income
                {CONSTANTS.market.household_income.values[muniId] ? ' here' : ' (county-wide)'}
              </span>
              <span className="dot" />
              <span className="num">
                {usd(
                  (CONSTANTS.market.household_income.values[muniId] ??
                    CONSTANTS.market.household_income.county).median,
                )}
                /yr
              </span>
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
            <AmortizationChart loan={out.loan} ratePct={ratePct} termYears={termYears} />
            <button className="tcc-share" onClick={shareScenario}>
              {copied ? 'Link copied ✓' : 'Share this scenario →'}
            </button>
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
        price. Median household income is from the U.S. Census Bureau's American Community Survey
        (2020–2024 five-year estimates); small-area estimates carry margins of error. Insurance uses Wisconsin average premiums by coverage amount from the NAIC's latest
        state report (2022 data — premiums have risen since, and quotes vary by home and insurer),
        with dwelling coverage approximated by price. Median sale price computed from Wisconsin DOR
        transfer records via WPR's property transaction data. Updated{' '}
        {CONSTANTS._meta.updated}.{' '}
        <a className="tcc-src-link" href="?tool=sources" target="_blank" rel="noopener">
          Sources &amp; methodology →
        </a>
      </div>

      <div className="tcc-sponsor">
        <div>
          <div className="tag">Homebuyer tools presented by</div>
          <div className="name">
            {sponsor.name ? (
              <>
                {sponsor.logo && <img className="tcc-sponsor-logo" src={sponsor.logo} alt="" />}
                {sponsor.name}
              </>
            ) : (
              'Your credit union here'
            )}
          </div>
        </div>
        {sponsor.url ? (
          <a className="tag tcc-sponsor-link" href={sponsor.url} target="_blank" rel="sponsored noopener">
            Talk to a local lender →
          </a>
        ) : (
          <div className="tag">Talk to a local lender →</div>
        )}
      </div>
    </div>
  )
}
