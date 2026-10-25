import { useEffect, useRef } from 'react'
import { WHISPER_TRANSCRIBE_URL } from './serviceUrls'

export default function LeoAssistant() {
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const listeningRef = useRef(false)
  const processingRef = useRef(false)
  const speakingRef = useRef(false)
  const discardRecordingRef = useRef(false)
  const speechTokenRef = useRef(0)
  const wakeWordUntilRef = useRef(0)

  const stopLeo = () => {
    listeningRef.current = false
    speakingRef.current = false
    discardRecordingRef.current = false
    speechTokenRef.current += 1
    window.speechSynthesis?.cancel()

    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    }

    recorderRef.current = null

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }

  const processAudio = async (blob) => {
    if (processingRef.current) return

    try {
      processingRef.current = true

      const formData = new FormData()
      formData.append('file', blob, 'leo-command.webm')

      if (!WHISPER_TRANSCRIBE_URL) {
        throw new Error('Set VITE_WHISPER_BASE_URL to enable voice transcription on this site.')
      }
      const whisperResponse = await fetch(WHISPER_TRANSCRIBE_URL, {
          method: 'POST',
          body: formData
        }
      )

      if (!whisperResponse.ok) throw new Error('Whisper failed')

      const whisperData = await whisperResponse.json()
      const text = (whisperData.text || '').trim()

      if (!text) return

      // Whisper can mishear this very short phrase as “Hey, what?” or “Hello”.
      // Accept common wake-word transcriptions, but still require a supported
      // command before dispatching any player action.
      const wakeWord = text.match(/\b(?:hey\s*,?\s*(?:leo|leah|neo|yo|what)|heyho|hello(?:\s*,?\s*leo)?)\b/i)
      let command = text
      if (wakeWord) {
        wakeWordUntilRef.current = Date.now() + 10_000
        command = text.slice(wakeWord.index + wakeWord[0].length)
      } else if (Date.now() > wakeWordUntilRef.current) {
        return
      }

      command = command
        .replace(/^(yeah|yes|okay|ok)[,\s]*/i, '')
        .replace(/^[\s,.:;!?-]+|[\s,.:;!?-]+$/g, '')
        .trim()

      if (!command) {
        speak('Yes?')
        return
      }

      const normalized = command.toLowerCase().replace(/[.!?,;:]+$/g, '').trim()
      const playMatch = normalized.match(/^play\s+(?:(?:the\s+)?(?:song|track)\s+)?(.+)$/i)
      let action

      if (playMatch) {
        const requestedSong = playMatch[1].replace(/^['"“”]|['"“”]$/g, '').trim()
        if (requestedSong) action = { action: 'play', song: requestedSong }
      } else if (/^pause(?:\s+(?:the\s+)?(?:song|music|track))?$/.test(normalized)) {
        action = { action: 'pause' }
      } else if (/^(?:volume\s+up|increase\s+(?:the\s+)?volume|turn\s+(?:the\s+)?volume\s+up)$/.test(normalized)) {
        action = { action: 'volume_delta', value: 10 }
      } else if (/^(?:volume\s+down|decrease\s+(?:the\s+)?volume|turn\s+(?:the\s+)?volume\s+down)$/.test(normalized)) {
        action = { action: 'volume_delta', value: -10 }
      } else if (/^mute(?:\s+music)?$/.test(normalized)) {
        action = { action: 'mute' }
      } else if (/^unmute(?:\s+music)?$/.test(normalized)) {
        action = { action: 'unmute' }
      } else if (/^(?:skip|next)(?:\s+(?:the\s+)?(?:song|track))?$/.test(normalized)) {
        action = { action: 'next' }
      } else if (/^(?:prev|previous)(?:\s+(?:the\s+)?(?:song|track))?$/.test(normalized)) {
        action = { action: 'previous' }
      }

      if (action) {
        console.log('Leo command:', action.action, action.song || '')
        window.dispatchEvent(new CustomEvent('leo-command', { detail: action }))
      } else if (wakeWord) {
        speak('Try play a song, pause, volume up or down, mute, skip, or previous song.')
      }
    } catch (error) {
      console.error('Leo error:', error)
    } finally {
      processingRef.current = false
    }
  }

  const speak = (text) => {
    if (!('speechSynthesis' in window)) return

    const speechToken = ++speechTokenRef.current
    speakingRef.current = true

    if (recorderRef.current?.state === 'recording') {
      discardRecordingRef.current = true
      recorderRef.current.stop()
    }

    window.speechSynthesis.cancel()

    const speech = new SpeechSynthesisUtterance(text)
    speech.rate = 1
    speech.pitch = 1
    speech.volume = 1
    const resumeListening = () => {
      if (speechToken !== speechTokenRef.current) return
      setTimeout(() => {
        if (speechToken === speechTokenRef.current) speakingRef.current = false
      }, 700)
    }
    speech.onend = resumeListening
    speech.onerror = resumeListening

    window.speechSynthesis.speak(speech)
  }

  const startLeo = async () => {
    if (listeningRef.current) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      streamRef.current = stream
      listeningRef.current = true

      const listen = () => {
        if (!listeningRef.current) return
        if (speakingRef.current || window.speechSynthesis?.speaking) {
          setTimeout(listen, 300)
          return
        }
        if (recorderRef.current?.state === 'recording') return

        const mimeType =
          MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm'

        const recorder = new MediaRecorder(stream, { mimeType })
        recorderRef.current = recorder

        const chunks = []

        recorder.ondataavailable = event => {
          if (event.data.size > 0) {
            chunks.push(event.data)
          }
        }

        recorder.onstop = async () => {
          recorderRef.current = null
          const discardRecording = discardRecordingRef.current
          discardRecordingRef.current = false

          if (!discardRecording && chunks.length > 0) {
            await processAudio(
              new Blob(chunks, { type: mimeType })
            )
          }

          if (listeningRef.current) {
            setTimeout(listen, 300)
          }
        }

        recorder.onerror = () => {
          recorderRef.current = null

          if (listeningRef.current) {
            setTimeout(listen, 500)
          }
        }

        recorder.start()

        setTimeout(() => {
          if (recorder.state === 'recording') {
            recorder.stop()
          }
        }, 4000)
      }

      console.log('Leo microphone started')
      listen()
    } catch (error) {
      console.error('Leo microphone error:', error)
      localStorage.setItem('leoVoiceAssistantEnabled', 'false')
    }
  }

  useEffect(() => {
    const checkLeo = () => {
      const enabled =
        localStorage.getItem('leoVoiceAssistantEnabled') === 'true'

      if (enabled) {
        startLeo()
      } else {
        stopLeo()
      }
    }

    checkLeo()

    const interval = setInterval(checkLeo, 1000)

    return () => {
      clearInterval(interval)
      stopLeo()
    }
  }, [])

  return null
}
