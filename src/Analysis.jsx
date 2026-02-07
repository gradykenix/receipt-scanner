import { useState, useMemo, useRef, useEffect } from 'react'

// ===== BLUE-GREEN PALETTE =====
const C = {
  bg: '#f8f9f7',
  card: '#ffffff',
  text: '#1a2e2a',
  sub: '#6b8a83',
  accent: '#0d9488',     // teal-600
  accent2: '#065f46',    // emerald-800
  accent3: '#2dd4bf',    // teal-300
  border: '#d1e5e0',
  light: '#ecf5f2',
  dark: '#134e4a',       // teal-900
}

// Blue-green shades for mosaic Voronoi cells
const MOSAIC_COLORS = [
  '#0d9488', '#0f766e', '#115e59', '#065f46', '#047857',
  '#059669', '#10b981', '#14b8a6', '#2dd4bf', '#5eead4',
  '#134e4a', '#0e7490', '#0891b2', '#06b6d4', '#22d3ee',
  '#0d7377', '#0a8f6e', '#0c5c4c', '#087d6a', '#039a7e',
  '#1a7a6d', '#0b6e5f', '#138a7a', '#0f9b8e', '#17a89a',
]

const CATEGORY_COLORS = {
  produce: '#059669', dairy: '#0891b2', meat: '#0d9488',
  bakery: '#14b8a6', snacks: '#0e7490', beverages: '#06b6d4',
  deli: '#047857', frozen: '#2dd4bf', pantry: '#065f46', other: '#6b8a83',
}

// ===== VORONOI COMPUTATION =====
// Simple Fortune's algorithm is complex; instead we use a practical approach:
// For each pixel (well, for each cell), find the nearest seed point.
// But we're using SVG polygons, so we compute Voronoi via the dual of Delaunay.
// Actually, simplest correct approach: use the edge-intersection method.
// For a hackathon, let's use a clean iterative approach that builds polygons
// by computing half-plane intersections for each seed point.

function generateBufferedPoints(count, width, height, buffer) {
  const points = []
  let attempts = 0
  const maxAttempts = count * 100

  while (points.length < count && attempts < maxAttempts) {
    const x = buffer + Math.random() * (width - 2 * buffer)
    const y = buffer + Math.random() * (height - 2 * buffer)
    let tooClose = false
    for (const p of points) {
      const dx = p.x - x
      const dy = p.y - y
      if (Math.sqrt(dx * dx + dy * dy) < buffer) {
        tooClose = true
        break
      }
    }
    if (!tooClose) points.push({ x, y })
    attempts++
  }
  return points
}

// Compute Voronoi cell for a point by intersecting half-planes
// Each neighboring point creates a half-plane (the side closer to our point)
// We intersect all half-planes with the bounding rectangle
function computeVoronoiCell(idx, seeds, clipRect) {
  const { x: cx, y: cy } = seeds[idx]
  // Start with bounding rectangle as polygon
  let poly = [
    { x: clipRect.x, y: clipRect.y },
    { x: clipRect.x + clipRect.w, y: clipRect.y },
    { x: clipRect.x + clipRect.w, y: clipRect.y + clipRect.h },
    { x: clipRect.x, y: clipRect.y + clipRect.h },
  ]

  for (let j = 0; j < seeds.length; j++) {
    if (j === idx) continue
    const { x: ox, y: oy } = seeds[j]
    // Bisector between seed[idx] and seed[j]
    const mx = (cx + ox) / 2
    const my = (cy + oy) / 2
    // Normal pointing toward our seed
    const nx = cx - ox
    const ny = cy - oy
    // Clip polygon by half-plane: keep side where dot(p - m, n) >= 0
    poly = clipPolygonByHalfPlane(poly, mx, my, nx, ny)
    if (poly.length === 0) break
  }
  return poly
}

function clipPolygonByHalfPlane(poly, mx, my, nx, ny) {
  if (poly.length === 0) return []
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const dA = (a.x - mx) * nx + (a.y - my) * ny
    const dB = (b.x - mx) * nx + (b.y - my) * ny
    if (dA >= 0) out.push(a)
    if ((dA >= 0) !== (dB >= 0)) {
      // Edge crosses the line — find intersection
      const t = dA / (dA - dB)
      out.push({
        x: a.x + t * (b.x - a.x),
        y: a.y + t * (b.y - a.y),
      })
    }
  }
  return out
}

function polygonToPath(poly) {
  if (poly.length === 0) return ''
  return poly.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z'
}

// ===== VORONOI MOSAIC COMPONENT =====
function VoronoiMosaic({ items, onSelect, width = 340, height = 380 }) {
  // Generate seed points with buffer (deterministic per session via useMemo)
  const { seeds, cells } = useMemo(() => {
    const count = Math.min(items.length, 16)
    // Use a seeded-ish approach: place points with good spacing
    const buffer = Math.min(width, height) / (count * 0.6)
    const pts = generateBufferedPoints(count, width, height, buffer * 0.5)
    const clipRect = { x: 0, y: 0, w: width, h: height }
    const cls = pts.map((_, i) => computeVoronoiCell(i, pts, clipRect))
    return { seeds: pts, cells: cls }
  }, [items.length, width, height])

  // Compute centroids for text placement
  const centroids = cells.map(poly => {
    if (poly.length === 0) return { x: 0, y: 0 }
    const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length
    const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length
    return { x: cx, y: cy }
  })

  // Estimate cell size for font sizing
  const cellAreas = cells.map(poly => {
    if (poly.length < 3) return 0
    let area = 0
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length
      area += poly[i].x * poly[j].y - poly[j].x * poly[i].y
    }
    return Math.abs(area) / 2
  })

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', margin: '0 auto', borderRadius: '16px', overflow: 'hidden' }}>
      {/* Background */}
      <rect x="0" y="0" width={width} height={height} fill={C.bg} />

      {cells.map((poly, i) => {
        if (i >= items.length || poly.length === 0) return null
        const item = items[i]
        const color = MOSAIC_COLORS[i % MOSAIC_COLORS.length]
        const centroid = centroids[i]
        const area = cellAreas[i]
        const fontSize = Math.max(9, Math.min(14, Math.sqrt(area) / 8))
        const name = item.name.length > 14 ? item.name.substring(0, 12) + '…' : item.name

        return (
          <g key={i} onClick={() => onSelect(item.name.toLowerCase())} style={{ cursor: 'pointer' }}>
            <path d={polygonToPath(poly)} fill={color}
              stroke={C.bg} strokeWidth="4"
              style={{ transition: 'opacity 0.15s' }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            />
            <text x={centroid.x} y={centroid.y - fontSize * 0.3}
              textAnchor="middle" dominantBaseline="middle"
              fill="white" fontSize={fontSize} fontWeight="700"
              fontFamily="DM Sans, sans-serif"
              style={{ pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
              {name}
            </text>
            <text x={centroid.x} y={centroid.y + fontSize * 0.9}
              textAnchor="middle" dominantBaseline="middle"
              fill="rgba(255,255,255,0.75)" fontSize={fontSize * 0.75} fontWeight="600"
              fontFamily="DM Sans, sans-serif"
              style={{ pointerEvents: 'none' }}>
              ×{item.count}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ===== COMPONENTS =====
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

// Zero-anchored sparkline
function Sparkline({ points, width = 240, height = 70 }) {
  if (!points || points.length < 2) return null
  const prices = points.map(p => p.price)
  const min = 0 // anchored to zero
  const max = Math.max(...prices) * 1.1 // 10% headroom
  const range = max - min || 1
  const plotTop = 8
  const plotBottom = height - 18
  const plotH = plotBottom - plotTop

  const coords = points.map((p, i) => ({
    x: 16 + (i / (points.length - 1)) * (width - 32),
    y: plotBottom - ((p.price - min) / range) * plotH,
  }))

  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
  const isUp = prices[prices.length - 1] > prices[0]
  const lineColor = isUp ? '#ef4444' : C.accent2

  // Area fill
  const areaD = pathD + ` L ${coords[coords.length - 1].x} ${plotBottom} L ${coords[0].x} ${plotBottom} Z`

  return (
    <svg width={width} height={height} style={{ display: 'block', margin: '8px auto' }}>
      {/* Zero line */}
      <line x1={16} y1={plotBottom} x2={width - 16} y2={plotBottom}
        stroke={C.border} strokeWidth="1" />
      {/* $0 label */}
      <text x={8} y={plotBottom + 3} fontSize="9" fill={C.sub}>$0</text>
      {/* Max label */}
      <text x={8} y={plotTop + 3} fontSize="9" fill={C.sub}>${max.toFixed(0)}</text>
      {/* Area */}
      <path d={areaD} fill={lineColor} opacity="0.1" />
      {/* Line */}
      <path d={pathD} fill="none" stroke={lineColor}
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots */}
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r="3" fill={lineColor} />
      ))}
      {/* Date labels */}
      <text x={coords[0].x} y={height - 2} fontSize="9" fill={C.sub} textAnchor="start">
        {points[0].date}
      </text>
      <text x={coords[coords.length - 1].x} y={height - 2} fontSize="9" fill={C.sub} textAnchor="end">
        {points[points.length - 1].date}
      </text>
    </svg>
  )
}


// ===== MAIN =====
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
    const topItems = Object.values(itemStats).sort((a, b) => b.count - a.count).slice(0, 16)
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
        <h1 style={{ fontSize: '48px', fontWeight: 800, color: C.dark, margin: 0, lineHeight: 1.1 }}>
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

  // VORONOI MOSAIC
  slides.push(
    <Slide key="mosaic" subtitle="Your Grocery Mosaic">
      <h2 style={{ fontSize: '22px', fontWeight: 800, color: C.text, margin: '0 0 6px 0' }}>
        Tap any cell to explore
      </h2>
      <p style={{ fontSize: '14px', color: C.sub, margin: '0 0 16px 0' }}>
        Your top items, arranged as a mosaic
      </p>

      <VoronoiMosaic
        items={stats.topItems}
        onSelect={(name) => setSelectedTile(name)}
        width={340}
        height={380}
      />

      {/* POPUP */}
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
              maxHeight: '75vh', overflowY: 'auto',
              boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
            }}>
              <div style={{
                width: '40px', height: '4px', backgroundColor: C.border,
                borderRadius: '2px', margin: '0 auto 16px',
              }} />
              <h3 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 16px 0', color: C.dark }}>
                {item.name}
              </h3>
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
                  <div style={{ fontSize: '18px', fontWeight: 800, color: C.dark }}>{item.cheapestStore}</div>
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
                  <Sparkline points={item.timeline} width={280} height={80} />
                </div>
              )}
              <button onClick={() => setSelectedTile(null)} style={{
                width: '100%', padding: '14px', backgroundColor: C.light,
                border: 'none', borderRadius: '12px', fontSize: '16px',
                fontWeight: 600, cursor: 'pointer', color: C.text, marginTop: '12px',
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
      <h2 style={{ fontSize: '22px', fontWeight: 800, color: C.text, margin: '0 0 6px 0' }}>
        Which store wins?
      </h2>
      <p style={{ fontSize: '14px', color: C.sub, margin: '0 0 20px 0' }}>
        Pick a receipt as your basket, then see which store would be cheapest.
      </p>
      <button onClick={() => setShowBasketPicker(!showBasketPicker)} style={{
        width: '100%', padding: '14px', backgroundColor: C.card,
        border: `1px solid ${basketReceiptId ? C.accent : C.border}`,
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
              <div style={{ fontWeight: 600, color: C.text }}>{r.store} — {r.date}</div>
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
                  <span> ({basketResult.basketReceipt.items.length - basketResult.restrictedItems.length} excluded)</span>
                )}
              </p>
              {/* PODIUM */}
              <div style={{
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                gap: '8px', marginBottom: '24px', marginTop: '10px', minHeight: '180px',
              }}>
                {basketResult.storeCosts.map((sc, i) => {
                  const heights = [150, 110, 80]
                  const h = heights[i] || 60
                  const medals = ['🥇', '🥈', '🥉']
                  const medal = medals[i] || `#${i + 1}`
                  // Blue-green gradient for podium
                  const podiumColors = [C.accent2, C.accent, '#2dd4bf']
                  const color = podiumColors[i] || C.sub
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
                  padding: '16px', backgroundColor: C.light,
                  borderRadius: '12px', border: `1px solid ${C.border}`, textAlign: 'center',
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
                        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px', color: C.text }}>{item.name}</div>
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
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: C.text, margin: '0 0 20px 0' }}>
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
              <div style={{ fontSize: '18px', fontWeight: 800, color: isUp ? '#ef4444' : C.accent2 }}>
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
      <h2 style={{ fontSize: '22px', fontWeight: 800, color: C.text, margin: '0 0 24px 0' }}>
        Your grocery snapshot
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {[
          { label: 'Total spent', value: `$${stats.totalSpent.toFixed(2)}`, color: C.accent },
          { label: 'Receipts', value: stats.receiptCount, color: C.accent3 },
          { label: 'Items scanned', value: stats.totalItems, color: C.accent2 },
          { label: 'Avg per trip', value: `$${stats.avgPerTrip.toFixed(2)}`, color: C.dark },
          { label: 'Stores visited', value: stats.storesWithReceipts.length, color: '#0891b2' },
          { label: 'Unique items', value: Object.keys(stats.itemStats).length, color: '#059669' },
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
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: C.text, margin: '0 0 20px 0' }}>
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
            <span style={{ flex: 1, fontSize: '15px', textTransform: 'capitalize', color: C.text }}>{category}</span>
            <span style={{ fontSize: '14px', color: C.sub }}>{pct.toFixed(0)}%</span>
            <span style={{ fontSize: '14px', fontWeight: 700, width: '70px', textAlign: 'right', color: C.text }}>
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
