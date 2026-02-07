import { useState, useMemo } from 'react'

// ===== PALETTE =====
const C = {
  bg: '#f7f7f5',
  card: '#ffffff',
  text: '#1a1a1a',
  sub: '#6b6b6b',
  accent: '#e85d3a',
  accent2: '#2d6a4f',
  accent3: '#457b9d',
  border: '#e8e8e4',
  light: '#f0efeb',
}

const TILE_COLORS = [
  '#e85d3a', '#2d6a4f', '#457b9d', '#ab47bc', '#ff9800',
  '#26c6da', '#ec407a', '#8d6e63', '#5c6bc0', '#66bb6a',
  '#ef5350', '#ffa726', '#42a5f5', '#78909c', '#d4e157',
  '#7e57c2', '#29b6f6', '#c62828', '#00897b', '#f06292',
]

const CATEGORY_COLORS = {
  produce: '#4caf50', dairy: '#42a5f5', meat: '#ef5350',
  bakery: '#ff9800', snacks: '#ab47bc', beverages: '#26c6da',
  deli: '#ec407a', frozen: '#78909c', pantry: '#8d6e63', other: '#bdbdbd',
}

function Slide({ children, subtitle }) {
  return (
    <div style={{
      minHeight: 'calc(100vh - 120px)',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center',
      padding: '20px 24px 40px',
      boxSizing: 'border-box',
    }}>
      {subtitle && (
        <p style={{
          fontSize: '12px', textTransform: 'uppercase',
          letterSpacing: '2.5px', color: C.sub,
          marginBottom: '12px', fontWeight: 600,
        }}>{subtitle}</p>
      )}
      {children}
    </div>
  )
}

function Bar({ label, value, maxValue, color = C.accent, suffix = '' }) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '14px', color: C.text }}>{label}</span>
        <span style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>
          {suffix}{typeof value === 'number' ? value.toFixed(2) : value}
        </span>
      </div>
      <div style={{ height: '8px', backgroundColor: C.border, borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${Math.max(pct, 2)}%`,
          backgroundColor: color, borderRadius: '4px',
          transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  )
}

function Sparkline({ points, width = 200, height = 60 }) {
  if (!points || points.length < 2) return null
  const prices = points.map(p => p.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const coords = points.map((p, i) => ({
    x: (i / (points.length - 1)) * width,
    y: height - ((p.price - min) / range) * (height - 10) - 5,
  }))
  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
  const isUp = prices[prices.length - 1] > prices[0]
  return (
    <svg width={width} height={height} style={{ display: 'block', margin: '8px auto' }}>
      <path d={pathD} fill="none" stroke={isUp ? C.accent : C.accent2}
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r="3" fill={isUp ? C.accent : C.accent2} />
      ))}
      <text x={0} y={height - 2} fontSize="10" fill={C.sub}>{points[0].date}</text>
      <text x={width} y={height - 2} fontSize="10" fill={C.sub} textAnchor="end">
        {points[points.length - 1].date}
      </text>
    </svg>
  )
}

export default function Analysis({ receipts, onClose }) {
  const [slide, setSlide] = useState(0)
  const [selectedTile, setSelectedTile] = useState(null)
  const [basketReceiptId, setBasketReceiptId] = useState(null)
  const [showBasketPicker, setShowBasketPicker] = useState(false)

  const stats = useMemo(() => {
    if (!receipts || receipts.length === 0) return null
    const allItems = receipts.flatMap(r => r.items.map(item => ({
      ...item, store: r.store, date: r.date, receiptId: r.id,
    })))
    const totalSpent = receipts.reduce((s, r) => s + r.total, 0)
    const totalItems = allItems.length
    const avgPerTrip = totalSpent / receipts.length
    const storesWithReceipts = [...new Set(receipts.map(r => r.store))]
    const dateRange = {
      first: receipts.reduce((min, r) => r.date < min ? r.date : min, receipts[0].date),
      last: receipts.reduce((max, r) => r.date > max ? r.date : max, receipts[0].date),
    }
    const itemDB = {}
    allItems.forEach(item => {
      const key = item.name.toLowerCase()
      if (!itemDB[key]) itemDB[key] = { name: item.name, purchases: [] }
      itemDB[key].purchases.push(item)
    })
    const itemStats = {}
    Object.entries(itemDB).forEach(([key, { name, purchases }]) => {
      const count = purchases.reduce((s, p) => s + p.quantity, 0)
      const totalSpentOnItem = purchases.reduce((s, p) => s + p.totalPrice, 0)
      const receiptIds = [...new Set(purchases.map(p => p.receiptId))]
      const avgQtyPerReceipt = count / receiptIds.length
      const storeLatest = {}
      purchases.forEach(p => {
        if (!storeLatest[p.store] || p.date > storeLatest[p.store].date) {
          storeLatest[p.store] = { price: p.unitPrice, date: p.date }
        }
      })
      let cheapestStore = null
      let cheapestPrice = Infinity
      Object.entries(storeLatest).forEach(([store, { price }]) => {
        if (price < cheapestPrice) { cheapestPrice = price; cheapestStore = store }
      })
      const byDate = {}
      purchases.forEach(p => {
        if (!byDate[p.date]) byDate[p.date] = []
        byDate[p.date].push(p.unitPrice)
      })
      const timeline = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, prices]) => ({ date, price: prices.reduce((s, p) => s + p, 0) / prices.length }))
      const storesAvailable = [...new Set(purchases.map(p => p.store))]
      itemStats[key] = {
        name, count, totalSpentOnItem, avgQtyPerReceipt,
        cheapestStore, cheapestPrice, timeline, storeLatest, storesAvailable,
      }
    })
    const topItems = Object.values(itemStats).sort((a, b) => b.count - a.count).slice(0, 24)
    const computeBasket = (receiptId) => {
      if (!receiptId) return null
      const basketReceipt = receipts.find(r => r.id === receiptId)
      if (!basketReceipt) return null
      const basketItemNames = basketReceipt.items.map(i => i.name.toLowerCase())
      const restrictedItems = basketItemNames.filter(name => {
        const s = itemStats[name]
        if (!s) return false
        return storesWithReceipts.every(store => s.storesAvailable.includes(store))
      })
      if (restrictedItems.length === 0) return { restrictedItems: [], storeCosts: [], basketReceipt }
      const storeCosts = storesWithReceipts.map(store => {
        let totalCost = 0
        restrictedItems.forEach(name => {
          const item = itemStats[name]
          if (item.storeLatest[store]) {
            const basketItem = basketReceipt.items.find(i => i.name.toLowerCase() === name)
            const qty = basketItem ? basketItem.quantity : 1
            totalCost += item.storeLatest[store].price * qty
          }
        })
        return { store, totalCost }
      }).sort((a, b) => a.totalCost - b.totalCost)
      return { restrictedItems, storeCosts, basketReceipt }
    }
    const inflationItems = Object.entries(itemStats)
      .filter(([, s]) => s.timeline.length >= 2)
      .map(([key, s]) => {
        const first = s.timeline[0].price
        const last = s.timeline[s.timeline.length - 1].price
        const change = ((last - first) / first) * 100
        return { key, name: s.name, change, first, last, timeline: s.timeline }
      })
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 8)
    const categoryTotals = {}
    allItems.forEach(item => {
      const cat = item.category || 'other'
      if (!categoryTotals[cat]) categoryTotals[cat] = 0
      categoryTotals[cat] += item.totalPrice
    })
    const categoryList = Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, total]) => ({ category: cat, total, pct: (total / totalSpent) * 100 }))
    return {
      totalSpent, totalItems, avgPerTrip, storesWithReceipts, dateRange,
      itemStats, topItems, computeBasket, inflationItems, categoryList,
      receiptCount: receipts.length,
    }
  }, [receipts])

  const basketResult = useMemo(() => {
    if (!stats || !basketReceiptId) return null
    return stats.computeBasket(basketReceiptId)
  }, [stats, basketReceiptId])

  if (!stats) {
    return (
      <div style={{ padding: '40px 24px', fontFamily: "'DM Sans', sans-serif" }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer' }}>← Back</button>
        <p style={{ marginTop: '40px', textAlign: 'center', color: C.sub }}>No receipts to analyze yet.</p>
      </div>
    )
  }

  const slides = []

  // TITLE
  slides.push(
    <Slide key="title">
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '13px', color: C.sub, letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '20px' }}>
          Your Grocery
        </p>
        <h1 style={{ fontSize: '48px', fontWeight: 800, color: C.text, margin: 0, lineHeight: 1.1 }}>
          Mosaic
        </h1>
        <p style={{ fontSize: '15px', color: C.sub, marginTop: '16px' }}>
          {stats.dateRange.first === stats.dateRange.last
            ? stats.dateRange.first
            : `${stats.dateRange.first} — ${stats.dateRange.last}`}
        </p>
        <div style={{ width: '40px', height: '3px', backgroundColor: C.accent, margin: '24px auto 0' }} />
        <p style={{ fontSize: '14px', color: C.sub, marginTop: '20px' }}>
          {stats.receiptCount} receipt{stats.receiptCount !== 1 ? 's' : ''} · {stats.totalItems} items · ${stats.totalSpent.toFixed(2)}
        </p>
      </div>
    </Slide>
  )

  // MOSAIC
  slides.push(
    <Slide key="mosaic" subtitle="Your Grocery Mosaic">
      <h2 style={{ fontSize: '24px', fontWeight: 800, color: C.text, margin: '0 0 6px 0' }}>
        Tap any tile to explore
      </h2>
      <p style={{ fontSize: '14px', color: C.sub, margin: '0 0 20px 0' }}>
        Your most purchased items, sized by frequency
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
        {stats.topItems.map((item, i) => {
          const maxCount = stats.topItems[0].count
          const ratio = item.count / maxCount
          const size = Math.round(70 + ratio * 60)
          const color = TILE_COLORS[i % TILE_COLORS.length]
          return (
            <div key={item.name} onClick={() => setSelectedTile(item.name.toLowerCase())}
              style={{
                width: `${size}px`, height: `${size}px`, backgroundColor: color,
                borderRadius: '10px', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', padding: '6px', transition: 'transform 0.15s',
                overflow: 'hidden',
              }}>
              <span style={{
                color: 'white', fontSize: size > 90 ? '13px' : '11px',
                fontWeight: 700, textAlign: 'center', lineHeight: 1.2,
                wordBreak: 'break-word', textShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }}>{item.name}</span>
              <span style={{
                color: 'rgba(255,255,255,0.8)', fontSize: '11px', fontWeight: 600, marginTop: '2px',
              }}>×{item.count}</span>
            </div>
          )
        })}
      </div>

      {selectedTile && stats.itemStats[selectedTile] && (() => {
        const item = stats.itemStats[selectedTile]
        return (
          <>
            <div onClick={() => setSelectedTile(null)} style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100,
            }} />
            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              backgroundColor: C.card, borderRadius: '20px 20px 0 0',
              padding: '24px 24px 40px', zIndex: 101,
              maxHeight: '70vh', overflowY: 'auto',
              boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
            }}>
              <div style={{
                width: '40px', height: '4px', backgroundColor: C.border,
                borderRadius: '2px', margin: '0 auto 16px',
              }} />
              <h3 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 16px 0' }}>{item.name}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <div style={{ backgroundColor: C.light, borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: C.accent }}>${item.totalSpentOnItem.toFixed(2)}</div>
                  <div style={{ fontSize: '12px', color: C.sub, marginTop: '2px' }}>Total spent</div>
                </div>
                <div style={{ backgroundColor: C.light, borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: C.accent3 }}>{item.avgQtyPerReceipt.toFixed(1)}</div>
                  <div style={{ fontSize: '12px', color: C.sub, marginTop: '2px' }}>Avg qty / receipt</div>
                </div>
                <div style={{ backgroundColor: C.light, borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: C.accent2 }}>×{item.count}</div>
                  <div style={{ fontSize: '12px', color: C.sub, marginTop: '2px' }}>Times bought</div>
                </div>
                <div style={{ backgroundColor: C.light, borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#ab47bc' }}>{item.cheapestStore}</div>
                  <div style={{ fontSize: '12px', color: C.sub, marginTop: '2px' }}>Cheapest @ ${item.cheapestPrice.toFixed(2)}</div>
                </div>
              </div>
              {Object.keys(item.storeLatest).length > 1 && (
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1.5px', color: C.sub, fontWeight: 600, marginBottom: '8px' }}>
                    Latest price by store
                  </p>
                  {Object.entries(item.storeLatest).sort((a, b) => a[1].price - b[1].price).map(([store, { price, date }]) => (
                    <div key={store} style={{
                      display: 'flex', justifyContent: 'space-between',
                      padding: '6px 0', borderBottom: `1px solid ${C.border}`,
                    }}>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: store === item.cheapestStore ? 700 : 400,
                        color: store === item.cheapestStore ? C.accent2 : C.text,
                      }}>{store} {store === item.cheapestStore && '✦'}</span>
                      <span style={{ fontSize: '14px', color: C.sub }}>
                        ${price.toFixed(2)} <span style={{ fontSize: '11px' }}>({date})</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {item.timeline.length >= 2 && (
                <div>
                  <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1.5px', color: C.sub, fontWeight: 600, marginBottom: '4px' }}>
                    Price over time
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: C.sub, marginBottom: '2px' }}>
                    <span>${item.timeline[0].price.toFixed(2)}</span>
                    <span>${item.timeline[item.timeline.length - 1].price.toFixed(2)}</span>
                  </div>
                  <Sparkline points={item.timeline} width={280} height={60} />
                </div>
              )}
              <button onClick={() => setSelectedTile(null)} style={{
                width: '100%', padding: '14px', backgroundColor: C.light,
                border: 'none', borderRadius: '12px', fontSize: '16px',
                fontWeight: 600, cursor: 'pointer', color: C.text, marginTop: '16px',
              }}>Close</button>
            </div>
          </>
        )
      })()}
    </Slide>
  )

  // BASKET COMPARISON
  slides.push(
    <Slide key="basket" subtitle="Store Showdown">
      <h2 style={{ fontSize: '24px', fontWeight: 800, color: C.text, margin: '0 0 6px 0' }}>
        Which store wins?
      </h2>
      <p style={{ fontSize: '14px', color: C.sub, margin: '0 0 20px 0' }}>
        Pick a receipt as your basket, then see which store is cheapest for those items.
      </p>
      <button onClick={() => setShowBasketPicker(!showBasketPicker)} style={{
        width: '100%', padding: '14px', backgroundColor: C.card,
        border: `1px solid ${basketReceiptId ? C.accent2 : C.border}`,
        borderRadius: '12px', fontSize: '15px', cursor: 'pointer',
        textAlign: 'left', color: C.text, fontWeight: 600,
      }}>
        {basketReceiptId
          ? (() => { const r = receipts.find(r => r.id === basketReceiptId); return r ? `📋 ${r.store} — ${r.date} (${r.items.length} items)` : 'Select...' })()
          : '📋 Select a receipt as your basket...'}
      </button>
      {showBasketPicker && (
        <div style={{
          backgroundColor: C.card, border: `1px solid ${C.border}`,
          borderRadius: '12px', marginTop: '6px', maxHeight: '200px', overflowY: 'auto',
        }}>
          {receipts.map(r => (
            <div key={r.id} onClick={() => { setBasketReceiptId(r.id); setShowBasketPicker(false) }}
              style={{
                padding: '12px 16px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`,
                backgroundColor: r.id === basketReceiptId ? C.light : 'transparent',
              }}>
              <div style={{ fontWeight: 600 }}>{r.store} — {r.date}</div>
              <div style={{ fontSize: '13px', color: C.sub }}>{r.items.length} items · ${r.total.toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}
      {basketResult && (
        <div style={{ marginTop: '20px' }}>
          {basketResult.restrictedItems.length === 0 ? (
            <div style={{ padding: '20px', backgroundColor: C.light, borderRadius: '12px', textAlign: 'center', color: C.sub }}>
              <p style={{ fontSize: '15px', fontWeight: 600 }}>No overlapping items found</p>
              <p style={{ fontSize: '13px', marginTop: '4px' }}>
                None of these items have been bought at every store. Scan more receipts!
              </p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: '13px', color: C.sub, marginBottom: '16px' }}>
                Comparing {basketResult.restrictedItems.length} item{basketResult.restrictedItems.length !== 1 ? 's' : ''} found at all {stats.storesWithReceipts.length} stores
                {basketResult.restrictedItems.length < (basketResult.basketReceipt?.items.length || 0) && (
                  <span> ({basketResult.basketReceipt.items.length - basketResult.restrictedItems.length} excluded — not sold everywhere)</span>
                )}
              </p>
              <div style={{
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                gap: '8px', marginBottom: '24px', marginTop: '10px', minHeight: '180px',
              }}>
                {basketResult.storeCosts.map((sc, i) => {
                  const heights = [150, 110, 80]
                  const h = heights[i] || 60
                  const medals = ['🥇', '🥈', '🥉']
                  const medal = medals[i] || `#${i + 1}`
                  const colors = [C.accent2, C.accent3, '#8d6e63']
                  const color = colors[i] || C.sub
                  return (
                    <div key={sc.store} style={{
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', flex: 1, maxWidth: '120px',
                    }}>
                      <span style={{ fontSize: '24px', marginBottom: '6px' }}>{medal}</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: C.text, marginBottom: '4px', textAlign: 'center' }}>
                        {sc.store}
                      </span>
                      <span style={{ fontSize: '18px', fontWeight: 800, color, marginBottom: '8px' }}>
                        ${sc.totalCost.toFixed(2)}
                      </span>
                      <div style={{
                        width: '100%', height: `${h}px`,
                        backgroundColor: color, borderRadius: '10px 10px 0 0', opacity: 0.85,
                      }} />
                    </div>
                  )
                })}
              </div>
              {basketResult.storeCosts.length >= 2 && (
                <div style={{
                  padding: '16px', backgroundColor: '#f0fdf4',
                  borderRadius: '12px', border: '1px solid #bbf7d0', textAlign: 'center',
                }}>
                  <p style={{ fontSize: '14px', color: C.accent2, fontWeight: 700, margin: 0 }}>
                    {basketResult.storeCosts[0].store} saves you ${(
                      basketResult.storeCosts[basketResult.storeCosts.length - 1].totalCost -
                      basketResult.storeCosts[0].totalCost
                    ).toFixed(2)} vs {basketResult.storeCosts[basketResult.storeCosts.length - 1].store}
                  </p>
                </div>
              )}
              <details style={{ marginTop: '16px' }}>
                <summary style={{
                  cursor: 'pointer', fontSize: '13px', color: C.sub,
                  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px',
                }}>View item-by-item comparison</summary>
                <div style={{ marginTop: '10px' }}>
                  {basketResult.restrictedItems.map(name => {
                    const item = stats.itemStats[name]
                    if (!item) return null
                    return (
                      <div key={name} style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>{item.name}</div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          {Object.entries(item.storeLatest).sort((a, b) => a[1].price - b[1].price).map(([store, { price }]) => (
                            <span key={store} style={{
                              fontSize: '13px',
                              color: store === item.cheapestStore ? C.accent2 : C.sub,
                              fontWeight: store === item.cheapestStore ? 700 : 400,
                            }}>{store}: ${price.toFixed(2)}</span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </details>
            </>
          )}
        </div>
      )}
    </Slide>
  )

  // INFLATION
  if (stats.inflationItems.length > 0) {
    slides.push(
      <Slide key="inflation" subtitle="Price Changes">
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: C.text, margin: '0 0 20px 0' }}>
          What's getting pricier?
        </h2>
        {stats.inflationItems.map((item) => {
          const isUp = item.change > 0
          return (
            <div key={item.key} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 0', borderBottom: `1px solid ${C.border}`,
            }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: C.text }}>{item.name}</div>
                <div style={{ fontSize: '13px', color: C.sub }}>${item.first.toFixed(2)} → ${item.last.toFixed(2)}</div>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: isUp ? C.accent : C.accent2 }}>
                {isUp ? '↑' : '↓'} {Math.abs(item.change).toFixed(1)}%
              </div>
            </div>
          )
        })}
      </Slide>
    )
  }

  // SUMMARY
  slides.push(
    <Slide key="summary" subtitle="The Big Picture">
      <h2 style={{ fontSize: '24px', fontWeight: 800, color: C.text, margin: '0 0 24px 0' }}>
        Your grocery snapshot
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {[
          { label: 'Total spent', value: `$${stats.totalSpent.toFixed(2)}`, color: C.accent },
          { label: 'Receipts', value: stats.receiptCount, color: C.accent3 },
          { label: 'Items scanned', value: stats.totalItems, color: C.accent2 },
          { label: 'Avg per trip', value: `$${stats.avgPerTrip.toFixed(2)}`, color: '#ab47bc' },
          { label: 'Stores visited', value: stats.storesWithReceipts.length, color: '#ff9800' },
          { label: 'Unique items', value: Object.keys(stats.itemStats).length, color: '#26c6da' },
        ].map((stat, i) => (
          <div key={i} style={{
            backgroundColor: C.card, borderRadius: '12px',
            padding: '18px 14px', border: `1px solid ${C.border}`,
          }}>
            <div style={{ fontSize: '28px', fontWeight: 800, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: '11px', color: C.sub, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </Slide>
  )

  // CATEGORIES
  if (stats.categoryList.length > 0) {
    slides.push(
      <Slide key="categories" subtitle="Where Your Money Goes">
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: C.text, margin: '0 0 20px 0' }}>
          Spending by category
        </h2>
        <div style={{
          display: 'flex', height: '28px', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px',
        }}>
          {stats.categoryList.map(({ category, pct }) => (
            <div key={category} style={{
              width: `${pct}%`, backgroundColor: CATEGORY_COLORS[category] || CATEGORY_COLORS.other,
              minWidth: pct > 2 ? 'auto' : '2px',
            }} />
          ))}
        </div>
        {stats.categoryList.map(({ category, total, pct }) => (
          <div key={category} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 0', borderBottom: `1px solid ${C.border}`,
          }}>
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%',
              backgroundColor: CATEGORY_COLORS[category] || CATEGORY_COLORS.other,
            }} />
            <span style={{ flex: 1, fontSize: '15px', textTransform: 'capitalize' }}>{category}</span>
            <span style={{ fontSize: '14px', color: C.sub }}>{pct.toFixed(0)}%</span>
            <span style={{ fontSize: '14px', fontWeight: 700, width: '70px', textAlign: 'right' }}>
              ${total.toFixed(2)}
            </span>
          </div>
        ))}
      </Slide>
    )
  }

  const totalSlides = slides.length

  return (
    <div style={{
      fontFamily: "'DM Sans', -apple-system, sans-serif",
      backgroundColor: C.bg, color: C.text, minHeight: '100vh',
    }}>
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10,
        backgroundColor: C.bg, padding: '12px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', fontSize: '15px',
          cursor: 'pointer', color: C.sub, fontWeight: 600,
        }}>✕ Close</button>
        <span style={{ fontSize: '13px', color: C.sub }}>{slide + 1} / {totalSlides}</span>
      </div>
      <div style={{
        position: 'fixed', top: '44px', left: 0, right: 0, zIndex: 10,
        display: 'flex', gap: '3px', padding: '0 20px',
      }}>
        {slides.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: '3px', borderRadius: '2px',
            backgroundColor: i <= slide ? C.accent : C.border,
            transition: 'background-color 0.3s', cursor: 'pointer',
          }} onClick={() => setSlide(i)} />
        ))}
      </div>
      <div style={{ paddingTop: '56px' }}>{slides[slide]}</div>
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '16px 20px', backgroundColor: C.bg,
        display: 'flex', gap: '10px',
      }}>
        {slide > 0 && (
          <button onClick={() => setSlide(s => s - 1)} style={{
            flex: 1, padding: '14px', borderRadius: '12px',
            border: `1px solid ${C.border}`, backgroundColor: C.card,
            fontSize: '16px', fontWeight: 600, cursor: 'pointer', color: C.text,
          }}>← Back</button>
        )}
        {slide < totalSlides - 1 && (
          <button onClick={() => setSlide(s => s + 1)} style={{
            flex: slide > 0 ? 2 : 1, padding: '14px', borderRadius: '12px',
            border: 'none', backgroundColor: C.accent, color: 'white',
            fontSize: '16px', fontWeight: 600, cursor: 'pointer',
          }}>Next →</button>
        )}
        {slide === totalSlides - 1 && (
          <button onClick={onClose} style={{
            flex: 2, padding: '14px', borderRadius: '12px',
            border: 'none', backgroundColor: C.accent2, color: 'white',
            fontSize: '16px', fontWeight: 600, cursor: 'pointer',
          }}>Done ✓</button>
        )}
      </div>
    </div>
  )
}
