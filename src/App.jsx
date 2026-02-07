import { useState, useEffect } from 'react'
import Tesseract from 'tesseract.js'
import { parseWithLLM } from './parseWithLLM'
import Analysis from './Analysis'
import './App.css'

/*
  App structure:
  - 'home': receipt list + analyze button
  - 'scan': multi-photo capture with store/date
  - 'receipt': single receipt detail view
  - 'analyze': the Wrapped slideshow
*/

// ===== THEME =====
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

function App() {
  const [view, setView] = useState('home')
  const [receipts, setReceipts] = useState([])

  // Scan state
  const [segments, setSegments] = useState([])
  const [scanning, setScanning] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState(null)

  // Metadata
  const [store, setStore] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [stores, setStores] = useState([])
  const [newStore, setNewStore] = useState('')

  // Viewing
  const [selectedReceipt, setSelectedReceipt] = useState(null)

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('receipts')
      if (saved) setReceipts(JSON.parse(saved))
      const savedStores = localStorage.getItem('stores')
      if (savedStores) setStores(JSON.parse(savedStores))
    } catch (e) {
      console.error('Failed to load saved data:', e)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('receipts', JSON.stringify(receipts))
  }, [receipts])

  useEffect(() => {
    localStorage.setItem('stores', JSON.stringify(stores))
  }, [stores])

  const addStore = () => {
    const trimmed = newStore.trim()
    if (trimmed && !stores.includes(trimmed)) {
      setStores([...stores, trimmed])
      setStore(trimmed)
      setNewStore('')
    }
  }

  const handleCapture = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setScanning(true)
    setOcrProgress(0)
    const reader = new FileReader()
    reader.onloadend = async () => {
      try {
        const result = await Tesseract.recognize(reader.result, 'eng', {
          logger: (m) => {
            if (m.status === 'recognizing text') setOcrProgress(Math.round(m.progress * 100))
          }
        })
        setSegments(prev => [...prev, { image: reader.result, ocrText: result.data.text }])
      } catch (err) {
        setError('OCR failed: ' + err.message)
      }
      setScanning(false)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const removeSegment = (index) => {
    setSegments(prev => prev.filter((_, i) => i !== index))
  }

  const finishScan = async () => {
    if (segments.length === 0) return
    if (!store) { setError('Please select or add a store'); return }
    setParsing(true)
    setError(null)
    try {
      const parsed = await parseWithLLM(segments.map(s => s.ocrText), store, date)
      const newReceipt = {
        id: Date.now(),
        store, date,
        items: parsed.items || [],
        total: (parsed.items || []).reduce((sum, i) => sum + i.totalPrice, 0),
        scannedAt: new Date().toISOString()
      }
      setReceipts(prev => [newReceipt, ...prev])
      setSegments([])
      setSelectedReceipt(newReceipt)
      setView('receipt')
    } catch (err) {
      setError('Parsing failed: ' + err.message)
    }
    setParsing(false)
  }

  const deleteReceipt = (id) => {
    setReceipts(prev => prev.filter(r => r.id !== id))
    if (selectedReceipt?.id === id) setView('home')
  }

  // ===== STYLES =====
  const page = {
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    maxWidth: '600px', margin: '0 auto', minHeight: '100vh',
    backgroundColor: C.bg, color: C.text,
  }

  const topBar = {
    padding: '16px 20px', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`,
    backgroundColor: C.card,
  }

  const content = { padding: '20px' }

  const btn = (color = C.accent, full = true) => ({
    padding: '14px 24px', backgroundColor: color, color: 'white',
    border: 'none', borderRadius: '12px', cursor: 'pointer',
    fontSize: '16px', fontWeight: 600,
    width: full ? '100%' : 'auto', textAlign: 'center',
    display: 'block', boxSizing: 'border-box',
  })

  const card = (highlight = false) => ({
    backgroundColor: C.card, borderRadius: '12px', padding: '16px',
    marginBottom: '10px', border: `1px solid ${highlight ? C.accent : C.border}`,
    cursor: 'pointer', transition: 'border-color 0.2s',
  })

  const inputStyle = {
    width: '100%', padding: '12px', borderRadius: '10px',
    border: `1px solid ${C.border}`, fontSize: '16px',
    backgroundColor: C.card, boxSizing: 'border-box',
    color: C.text,
  }

  const label = {
    fontWeight: 600, display: 'block', marginBottom: '6px',
    fontSize: '14px', color: C.sub, textTransform: 'uppercase',
    letterSpacing: '1px',
  }

  // ===== ANALYZE VIEW =====
  if (view === 'analyze') {
    return <Analysis receipts={receipts} onClose={() => setView('home')} />
  }

  // ===== HOME =====
  if (view === 'home') {
    return (
      <div style={page}>
        <div style={{ ...topBar, justifyContent: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>🧾 Receipt Scanner</h1>
        </div>
        <div style={content}>
          <button style={btn()} onClick={() => {
            setSegments([]); setError(null)
            setDate(new Date().toISOString().split('T')[0])
            setView('scan')
          }}>
            + Scan New Receipt
          </button>

          {receipts.length >= 1 && (
            <button style={{ ...btn(C.accent), marginTop: '10px' }} onClick={() => setView('analyze')}>
              ✦ Analyze My Data
            </button>
          )}

          <div style={{ marginTop: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: C.text }}>
              Receipts
            </h2>
            <span style={{ fontSize: '13px', color: C.sub }}>{receipts.length} saved</span>
          </div>

          {receipts.length === 0 && (
            <p style={{ color: C.sub, textAlign: 'center', marginTop: '48px', fontSize: '15px' }}>
              No receipts yet — scan your first one!
            </p>
          )}

          <div style={{ marginTop: '12px' }}>
            {receipts.map(r => (
              <div key={r.id} style={card()} onClick={() => {
                setSelectedReceipt(r); setView('receipt')
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '16px' }}>{r.store}</div>
                    <div style={{ color: C.sub, fontSize: '14px', marginTop: '2px' }}>{r.date}</div>
                    <div style={{ color: C.sub, fontSize: '13px', marginTop: '2px' }}>
                      {r.items.length} items
                    </div>
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: C.accent }}>
                    ${r.total.toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ===== SCAN =====
  if (view === 'scan') {
    return (
      <div style={page}>
        <div style={topBar}>
          <button onClick={() => setView('home')}
            style={{ background: 'none', border: 'none', fontSize: '15px', cursor: 'pointer', color: C.sub, fontWeight: 600 }}>
            ← Back
          </button>
          <span style={{ fontWeight: 700, fontSize: '17px' }}>New Receipt</span>
          <div style={{ width: '50px' }} />
        </div>
        <div style={content}>
          {/* Store */}
          <div style={{ marginBottom: '20px' }}>
            <span style={label}>Store</span>
            {stores.length > 0 && (
              <select value={store} onChange={(e) => setStore(e.target.value)}
                style={{ ...inputStyle, marginBottom: '8px' }}>
                <option value="">Select a store...</option>
                {stores.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" placeholder="Add new store..."
                value={newStore} onChange={(e) => setNewStore(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addStore()}
                style={{ ...inputStyle, flex: 1 }} />
              <button onClick={addStore} style={{
                ...btn(C.accent3, false), padding: '12px 18px', whiteSpace: 'nowrap',
              }}>Add</button>
            </div>
          </div>

          {/* Date */}
          <div style={{ marginBottom: '24px' }}>
            <span style={label}>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              style={inputStyle} />
          </div>

          {/* Segments */}
          <div style={{ marginBottom: '20px' }}>
            <span style={label}>Photos ({segments.length})</span>
            {segments.map((seg, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px', backgroundColor: C.card, borderRadius: '10px',
                marginBottom: '8px', border: `1px solid ${C.border}`,
              }}>
                <img src={seg.image} alt="" style={{
                  width: '50px', height: '66px', objectFit: 'cover', borderRadius: '6px',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>Segment {i + 1}</div>
                  <div style={{ fontSize: '12px', color: C.sub, marginTop: '2px' }}>
                    {seg.ocrText.substring(0, 40).trim()}...
                  </div>
                </div>
                <button onClick={() => removeSegment(i)} style={{
                  background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: C.sub,
                }}>✕</button>
              </div>
            ))}

            <label style={{
              ...btn(C.accent3), display: 'block', textAlign: 'center',
              opacity: scanning ? 0.6 : 1, marginTop: '8px',
            }}>
              {scanning ? `Reading... ${ocrProgress}%` : '📸 Add Photo Segment'}
              <input type="file" accept="image/*" capture="environment"
                onChange={handleCapture} disabled={scanning} style={{ display: 'none' }} />
            </label>
          </div>

          {error && (
            <div style={{
              padding: '12px', backgroundColor: '#fef2f2', borderRadius: '10px',
              color: '#b91c1c', fontSize: '14px', marginBottom: '12px',
              border: '1px solid #fecaca',
            }}>
              {error}
            </div>
          )}

          <button onClick={finishScan}
            disabled={segments.length === 0 || parsing}
            style={{
              ...btn(segments.length === 0 ? C.border : C.accent2),
              color: segments.length === 0 ? C.sub : 'white',
              cursor: segments.length === 0 ? 'default' : 'pointer',
            }}>
            {parsing
              ? '🧠 Parsing with AI...'
              : `✓ Done — Parse ${segments.length} segment${segments.length !== 1 ? 's' : ''}`
            }
          </button>
        </div>
      </div>
    )
  }

  // ===== RECEIPT DETAIL =====
  if (view === 'receipt' && selectedReceipt) {
    const r = selectedReceipt
    const byCategory = r.items.reduce((acc, item) => {
      acc[item.category] = acc[item.category] || []
      acc[item.category].push(item)
      return acc
    }, {})

    return (
      <div style={page}>
        <div style={topBar}>
          <button onClick={() => setView('home')}
            style={{ background: 'none', border: 'none', fontSize: '15px', cursor: 'pointer', color: C.sub, fontWeight: 600 }}>
            ← Back
          </button>
          <span style={{ fontWeight: 700, fontSize: '17px' }}>Receipt</span>
          <div style={{ width: '50px' }} />
        </div>
        <div style={content}>
          <div style={{
            padding: '20px', backgroundColor: C.card, borderRadius: '14px',
            marginBottom: '16px', border: `1px solid ${C.border}`,
            textAlign: 'center',
          }}>
            <h2 style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: 800 }}>{r.store}</h2>
            <p style={{ margin: 0, color: C.sub, fontSize: '15px' }}>📅 {r.date}</p>
            <p style={{ margin: '12px 0 0 0', fontSize: '36px', fontWeight: 800, color: C.accent }}>
              ${r.total.toFixed(2)}
            </p>
          </div>

          {Object.entries(byCategory).map(([category, items]) => (
            <div key={category} style={{ marginBottom: '16px' }}>
              <h3 style={{
                textTransform: 'capitalize', color: C.sub, fontSize: '13px',
                letterSpacing: '1.5px', fontWeight: 600, margin: '0 0 8px 0',
                textTransform: 'uppercase',
              }}>{category}</h3>
              {items.map((item, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '8px 0', borderBottom: `1px solid ${C.border}`,
                }}>
                  <span style={{ fontSize: '15px' }}>
                    {item.name}
                    {item.quantity > 1 && (
                      <span style={{ color: C.sub, fontSize: '13px' }}>
                        {' '}× {item.quantity} @ ${item.unitPrice.toFixed(2)}
                      </span>
                    )}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: '15px' }}>
                    ${item.totalPrice.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          ))}

          <button onClick={() => deleteReceipt(r.id)} style={{
            ...btn('transparent'),
            color: '#b91c1c', border: `1px solid #fecaca`,
            marginTop: '20px',
          }}>
            🗑 Delete Receipt
          </button>
        </div>
      </div>
    )
  }

  return null
}

export default App
