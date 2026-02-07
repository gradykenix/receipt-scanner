import { useState, useEffect } from 'react'
import Tesseract from 'tesseract.js'
import { parseWithLLM } from './parseWithLLM'
import './App.css'

/*
  App has three "screens" managed by a single `view` state variable:
  - 'home': see saved receipts, start a new scan
  - 'scan': multi-photo capture flow with store/date selection
  - 'receipt': view a single parsed receipt in detail
  
  All receipts are persisted in localStorage as a JSON array.
  localStorage is a browser API that stores key-value string pairs
  that survive page refreshes and browser restarts.
*/

function App() {
  const [view, setView] = useState('home')
  const [receipts, setReceipts] = useState([])

  // Scan state
  const [segments, setSegments] = useState([])       // array of {image, ocrText}
  const [scanning, setScanning] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState(null)

  // Metadata
  const [store, setStore] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [stores, setStores] = useState([])
  const [newStore, setNewStore] = useState('')

  // Viewing a receipt
  const [selectedReceipt, setSelectedReceipt] = useState(null)

  // Load saved data from localStorage on first render
  // useEffect with [] runs once when the component mounts
  useEffect(() => {
    const saved = localStorage.getItem('receipts')
    if (saved) setReceipts(JSON.parse(saved))

    const savedStores = localStorage.getItem('stores')
    if (savedStores) setStores(JSON.parse(savedStores))
  }, [])

  // Save receipts whenever they change
  // useEffect with [receipts] runs every time receipts updates
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
      const imageData = reader.result
      try {
        const result = await Tesseract.recognize(imageData, 'eng', {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              setOcrProgress(Math.round(m.progress * 100))
            }
          }
        })
        setSegments(prev => [...prev, {
          image: imageData,
          ocrText: result.data.text
        }])
      } catch (err) {
        setError('OCR failed: ' + err.message)
      }
      setScanning(false)
    }
    reader.readAsDataURL(file)
    // Reset the input so the same file can be re-selected
    e.target.value = ''
  }

  const removeSegment = (index) => {
    setSegments(prev => prev.filter((_, i) => i !== index))
  }

  const finishScan = async () => {
    if (segments.length === 0) return
    if (!store) {
      setError('Please select or add a store')
      return
    }

    setParsing(true)
    setError(null)

    try {
      const ocrTexts = segments.map(s => s.ocrText)
      const parsed = await parseWithLLM(ocrTexts, store, date)

      const newReceipt = {
        id: Date.now(),
        store: store,
        date: date,
        items: parsed.items || [],
        total: (parsed.items || []).reduce((sum, item) => sum + item.totalPrice, 0),
        scannedAt: new Date().toISOString()
      }

      setReceipts(prev => [newReceipt, ...prev])
      setSegments([])
      setError(null)
      setSelectedReceipt(newReceipt)
      setView('receipt')
    } catch (err) {
      setError('Parsing failed: ' + err.message)
    }

    setParsing(false)
  }

  const deleteReceipt = (id) => {
    setReceipts(prev => prev.filter(r => r.id !== id))
    if (selectedReceipt?.id === id) {
      setView('home')
    }
  }

  // ========== RENDER ==========

  const containerStyle = {
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    maxWidth: '600px',
    margin: '0 auto',
    minHeight: '100vh',
    backgroundColor: '#fafafa'
  }

  const buttonStyle = (color = '#4CAF50') => ({
    padding: '12px 24px',
    backgroundColor: color,
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    width: '100%',
    marginTop: '10px'
  })

  const cardStyle = {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '15px',
    marginBottom: '10px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    cursor: 'pointer'
  }

  // ===== HOME SCREEN =====
  if (view === 'home') {
    return (
      <div style={containerStyle}>
        <h1>🧾 Receipt Scanner</h1>
        <button style={buttonStyle()} onClick={() => {
          setSegments([])
          setError(null)
          setDate(new Date().toISOString().split('T')[0])
          setView('scan')
        }}>
          + Scan New Receipt
        </button>

        <h2 style={{ marginTop: '30px', color: '#333' }}>
          Saved Receipts ({receipts.length})
        </h2>

        {receipts.length === 0 && (
          <p style={{ color: '#999', textAlign: 'center', marginTop: '40px' }}>
            No receipts yet. Scan your first one!
          </p>
        )}

        {receipts.map(r => (
          <div key={r.id} style={cardStyle} onClick={() => {
            setSelectedReceipt(r)
            setView('receipt')
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{r.store}</strong>
                <div style={{ color: '#666', fontSize: '14px' }}>{r.date}</div>
                <div style={{ color: '#888', fontSize: '13px' }}>{r.items.length} items</div>
              </div>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                ${r.total.toFixed(2)}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ===== SCAN SCREEN =====
  if (view === 'scan') {
    return (
      <div style={containerStyle}>
        <button onClick={() => setView('home')}
          style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', padding: '5px 0' }}>
          ← Back
        </button>
        <h1>Scan Receipt</h1>

        {/* Store selector */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Store</label>
          {stores.length > 0 && (
            <select
              value={store}
              onChange={(e) => setStore(e.target.value)}
              style={{
                width: '100%', padding: '10px', borderRadius: '8px',
                border: '1px solid #ddd', fontSize: '16px', marginBottom: '8px'
              }}
            >
              <option value="">Select a store...</option>
              {stores.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Add new store..."
              value={newStore}
              onChange={(e) => setNewStore(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addStore()}
              style={{
                flex: 1, padding: '10px', borderRadius: '8px',
                border: '1px solid #ddd', fontSize: '16px'
              }}
            />
            <button onClick={addStore} style={{
              padding: '10px 16px', backgroundColor: '#2196F3', color: 'white',
              border: 'none', borderRadius: '8px', cursor: 'pointer'
            }}>Add</button>
          </div>
        </div>

        {/* Date picker */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              width: '100%', padding: '10px', borderRadius: '8px',
              border: '1px solid #ddd', fontSize: '16px', boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Segments */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>
            Photos ({segments.length} captured)
          </label>

          {segments.map((seg, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px', backgroundColor: 'white', borderRadius: '8px',
              marginBottom: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}>
              <img src={seg.image} alt={`Segment ${i + 1}`}
                style={{ width: '60px', height: '80px', objectFit: 'cover', borderRadius: '4px' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold' }}>Segment {i + 1}</div>
                <div style={{ fontSize: '12px', color: '#888' }}>
                  {seg.ocrText.substring(0, 50)}...
                </div>
              </div>
              <button onClick={() => removeSegment(i)} style={{
                background: 'none', border: 'none', fontSize: '20px',
                cursor: 'pointer', color: '#999'
              }}>✕</button>
            </div>
          ))}

          <label style={{
            ...buttonStyle('#2196F3'),
            display: 'block',
            textAlign: 'center',
            opacity: scanning ? 0.6 : 1
          }}>
            {scanning ? `📷 Reading... ${ocrProgress}%` : '📸 Add Photo Segment'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleCapture}
              disabled={scanning}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        {error && <p style={{ color: 'red' }}>❌ {error}</p>}

        {/* Submit */}
        <button
          onClick={finishScan}
          disabled={segments.length === 0 || parsing}
          style={{
            ...buttonStyle(segments.length === 0 ? '#ccc' : '#4CAF50'),
            cursor: segments.length === 0 ? 'default' : 'pointer'
          }}
        >
          {parsing ? '🧠 Parsing with AI...' : `✓ Done — Parse ${segments.length} segment${segments.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    )
  }

  // ===== RECEIPT DETAIL SCREEN =====
  if (view === 'receipt' && selectedReceipt) {
    const r = selectedReceipt
    const byCategory = r.items.reduce((acc, item) => {
      acc[item.category] = acc[item.category] || []
      acc[item.category].push(item)
      return acc
    }, {})

    return (
      <div style={containerStyle}>
        <button onClick={() => setView('home')}
          style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', padding: '5px 0' }}>
          ← Back
        </button>

        <div style={{
          padding: '15px', backgroundColor: '#f0f7f0',
          borderRadius: '12px', marginTop: '10px', marginBottom: '15px'
        }}>
          <h2 style={{ margin: '0 0 5px 0' }}>{r.store}</h2>
          <p style={{ margin: 0, color: '#666' }}>📅 {r.date}</p>
          <p style={{ margin: '5px 0 0 0', fontSize: '24px', fontWeight: 'bold' }}>
            ${r.total.toFixed(2)}
          </p>
        </div>

        {Object.entries(byCategory).map(([category, items]) => (
          <div key={category} style={{ marginBottom: '15px' }}>
            <h3 style={{
              textTransform: 'capitalize', color: '#555',
              borderBottom: '1px solid #ddd', paddingBottom: '5px'
            }}>{category}</h3>
            {items.map((item, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '6px 0', borderBottom: '1px solid #f0f0f0'
              }}>
                <span>
                  {item.name}
                  {item.quantity > 1 && (
                    <span style={{ color: '#888', fontSize: '13px' }}>
                      {' '}× {item.quantity} @ ${item.unitPrice.toFixed(2)}
                    </span>
                  )}
                </span>
                <span style={{ fontWeight: 'bold' }}>${item.totalPrice.toFixed(2)}</span>
              </div>
            ))}
          </div>
        ))}

        <button onClick={() => deleteReceipt(r.id)} style={buttonStyle('#e53935')}>
          🗑 Delete Receipt
        </button>
      </div>
    )
  }

  return null
}

export default App