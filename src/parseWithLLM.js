const BACKEND_URL = 'https://receipt-backend-aved.onrender.com'

export async function parseWithLLM(ocrSegments, store, date) {
  const combinedText = ocrSegments.map((seg, i) =>
    `--- SEGMENT ${i + 1} ---\n${seg}`
  ).join('\n\n')

  const response = await fetch(`${BACKEND_URL}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ocrText: combinedText, store, date })
  })

  const data = await response.json()

  if (data.error) {
    throw new Error(data.error)
  }

  return data
}