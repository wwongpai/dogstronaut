import React, { useState, useRef, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import BookingPage from './pages/BookingPage.jsx'
import PaymentPage from './pages/PaymentPage.jsx'
import ConfirmationPage from './pages/ConfirmationPage.jsx'

const CHAT_URL = 'https://live-chat-app-cn4wkmlbva-as.a.run.app'
const CHAT_WIDTH = 350

function ChatPanel({ open, onToggle }) {
  const iframeRef = useRef(null)
  const location = useLocation()

  // Send page context to chat iframe whenever route changes
  useEffect(() => {
    if (!open || !iframeRef.current) return
    const msg = { type: 'PAGE_CONTEXT', path: location.pathname, search: location.search }
    iframeRef.current.contentWindow?.postMessage(msg, CHAT_URL)
  }, [location, open])

  return (
    <>
      {/* Toggle button — always visible on the right edge */}
      <button
        onClick={onToggle}
        title={open ? 'Collapse chat' : 'Open chat'}
        style={{
          position: 'fixed',
          right: open ? CHAT_WIDTH : 0,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 1000,
          width: 28,
          height: 72,
          background: '#000',
          color: '#fff',
          border: 'none',
          borderRadius: '8px 0 0 8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          boxShadow: '-2px 0 8px rgba(0,0,0,0.15)',
          transition: 'right 0.25s ease',
          padding: 0,
          lineHeight: 1,
        }}
        aria-label={open ? 'Collapse chat' : 'Open chat'}
      >
        {open ? '›' : '‹'}
      </button>

      {/* Chat iframe panel */}
      <div
        style={{
          width: open ? CHAT_WIDTH : 0,
          minWidth: open ? CHAT_WIDTH : 0,
          height: '100vh',
          borderLeft: open ? '1px solid #E2E2E2' : 'none',
          overflow: 'hidden',
          transition: 'width 0.25s ease, min-width 0.25s ease',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <iframe
          ref={iframeRef}
          src={CHAT_URL}
          title="Live Chat"
          style={{
            width: CHAT_WIDTH,
            height: '100%',
            border: 'none',
            display: 'block',
          }}
          allow="microphone; camera"
        />
      </div>
    </>
  )
}

function AppLayout() {
  const [chatOpen, setChatOpen] = useState(true)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Main content — shrinks when chat is open */}
      <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/book/:destinationId" element={<BookingPage />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/confirmation" element={<ConfirmationPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {/* Chat panel */}
      <ChatPanel open={chatOpen} onToggle={() => setChatOpen(o => !o)} />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  )
}
