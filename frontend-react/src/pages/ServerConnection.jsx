import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useServer } from '../ServerContext.jsx'

export default function ServerConnection() {
  const { API_BASE, connected, serverIP, updateServerURL, testConnection } = useServer()
  const [inputURL, setInputURL] = useState(API_BASE)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [discoveredServers, setDiscoveredServers] = useState([])

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`${inputURL}/health`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const data = await res.json()
        setTestResult({ success: true, message: `Connected! Status: ${data.status}` })
      } else {
        setTestResult({ success: false, message: `Server responded with ${res.status}` })
      }
    } catch (err) {
      setTestResult({ success: false, message: 'Connection failed — server may be offline' })
    } finally {
      setTesting(false)
    }
  }

  function handleConnect() {
    updateServerURL(inputURL)
    testConnection()
  }

  async function handleScan() {
    setScanning(true)
    setDiscoveredServers([])
    const found = []

    // Extract base IP from current URL
    const url = new URL(inputURL.startsWith('http') ? inputURL : `http://${inputURL}`)
    const parts = url.hostname.split('.')
    const baseIP = parts.slice(0, 3).join('.')

    // Scan common IPs on the subnet
    for (let i = 1; i <= 25; i++) {
      try {
        const res = await fetch(`http://${baseIP}.${i}:8000/health`, {
          signal: AbortSignal.timeout(500)
        })
        if (res.ok) {
          const data = await res.json()
          if (data.status === 'healthy') {
            found.push({ ip: `${baseIP}.${i}`, port: 8000 })
          }
        }
      } catch (e) { }
    }

    setDiscoveredServers(found)
    setScanning(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a4e 0%, #2d1b4e 100%)',
      color: 'white',
      fontFamily: 'Montserrat, sans-serif',
      padding: '20px'
    }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '30px' }}>
          <Link to="/" style={{ color: '#6EE7FF', textDecoration: 'none', fontSize: '1.2rem' }}>
            ← Back
          </Link>
          <h1 style={{ margin: 0 }}>📡 Server Connection</h1>
        </div>

        {/* Current Status */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '20px',
          border: `1px solid ${connected ? 'rgba(76, 175, 80, 0.3)' : 'rgba(244, 67, 54, 0.3)'}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{
              width: '12px', height: '12px', borderRadius: '50%',
              background: connected ? '#4CAF50' : '#f44336'
            }}></span>
            <strong>{connected ? 'Connected' : 'Disconnected'}</strong>
          </div>
          <p style={{ color: '#aaa', margin: 0 }}>Current server: {API_BASE}</p>
          {serverIP && <p style={{ color: '#6EE7FF', margin: '5px 0 0' }}>Server IP: {serverIP}</p>}
        </div>

        {/* Connect to Server */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '20px'
        }}>
          <h3 style={{ marginTop: 0 }}>Connect to Server</h3>
          <p style={{ color: '#aaa', fontSize: '0.9rem' }}>
            Enter the server URL (e.g., http://192.168.1.100:8000)
          </p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <input
              type="text"
              value={inputURL}
              onChange={(e) => setInputURL(e.target.value)}
              placeholder="http://192.168.1.100:8000"
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.1)',
                color: 'white',
                fontSize: '1rem',
                outline: 'none'
              }}
            />
            <button
              onClick={handleTest}
              disabled={testing}
              style={{
                padding: '12px 20px',
                borderRadius: '8px',
                border: '1px solid rgba(110, 231, 255, 0.4)',
                background: 'rgba(110, 231, 255, 0.15)',
                color: '#6EE7FF',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              {testing ? 'Testing...' : 'Test'}
            </button>
            <button
              onClick={handleConnect}
              style={{
                padding: '12px 20px',
                borderRadius: '8px',
                border: 'none',
                background: '#6EE7FF',
                color: '#1a1a4e',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 'bold'
              }}
            >
              Connect
            </button>
          </div>

          {testResult && (
            <div style={{
              marginTop: '12px',
              padding: '10px 16px',
              borderRadius: '8px',
              background: testResult.success ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)',
              color: testResult.success ? '#4CAF50' : '#f44336',
              fontSize: '0.9rem'
            }}>
              {testResult.success ? '✅' : '❌'} {testResult.message}
            </div>
          )}
        </div>

        {/* Network Scan */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '20px'
        }}>
          <h3 style={{ marginTop: 0 }}>🔍 Scan Network</h3>
          <p style={{ color: '#aaa', fontSize: '0.9rem' }}>
            Automatically find the music server on your local network
          </p>
          <button
            onClick={handleScan}
            disabled={scanning}
            style={{
              marginTop: '12px',
              padding: '12px 24px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.1)',
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            {scanning ? '⏳ Scanning...' : '🔍 Scan Local Network'}
          </button>

          {discoveredServers.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <p style={{ color: '#4CAF50', fontSize: '0.9rem' }}>Found {discoveredServers.length} server(s):</p>
              {discoveredServers.map((server, i) => (
                <div
                  key={i}
                  onClick={() => {
                    setInputURL(`http://${server.ip}:${server.port}`)
                  }}
                  style={{
                    padding: '10px 16px',
                    marginTop: '6px',
                    borderRadius: '8px',
                    background: 'rgba(110, 231, 255, 0.1)',
                    border: '1px solid rgba(110, 231, 255, 0.2)',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    color: '#6EE7FF'
                  }}
                >
                  🖥️ http://{server.ip}:{server.port}
                </div>
              ))}
            </div>
          )}

          {scanning && (
            <p style={{ color: '#aaa', fontSize: '0.85rem', marginTop: '10px' }}>
              Scanning subnet... this may take a moment.
            </p>
          )}
        </div>

        {/* Instructions */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <h3 style={{ marginTop: 0 }}>📖 How It Works</h3>
          <ol style={{ color: '#aaa', fontSize: '0.9rem', lineHeight: '1.8' }}>
            <li>Start the backend server on your laptop</li>
            <li>Look for the IP address in the server console: <code style={{ color: '#6EE7FF' }}>http://192.168.x.x:8000</code></li>
            <li>Enter that URL above and click <strong style={{ color: 'white' }}>Connect</strong></li>
            <li>Your music library will stream directly from the laptop</li>
          </ol>
          <p style={{ color: '#888', fontSize: '0.8rem', marginTop: '12px' }}>
            Both devices must be on the same WiFi network. No songs are stored on your phone.
          </p>
        </div>
      </div>
    </div>
  )
}