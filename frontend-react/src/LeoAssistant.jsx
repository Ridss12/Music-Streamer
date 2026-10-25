import { useEffect, useRef } from 'react'
import { RASA_REST_URL, WHISPER_TRANSCRIBE_URL } from './serviceUrls'

export default function LeoAssistant() {
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const listeningRef = useRef(false)
  const startingRef = useRef(false)
  const startTokenRef = useRef(0)
  const processingRef = useRef(false)
  const speakingRef = useRef(false)
  const discardRecordingRef = useRef(false)
  const speechTokenRef = useRef(0)
  const awaitingCommandRef = useRef(false)
  const wakeTimeoutRef = useRef(null)

  const setCommandListening = (active) => {
    awaitingCommandRef.current = active
    document.body.classList.toggle('leo-command-listening', active)
    window.dispatchEvent(new CustomEvent('leo-listening-state', { detail: { active } }))
    if (wakeTimeoutRef.current) {
      clearTimeout(wakeTimeoutRef.current)
      wakeTimeoutRef.current = null
    }
    if (active) {
      console.info('Leo is listening for your command')
      wakeTimeoutRef.current = setTimeout(() => {
        setCommandListening(false)
        console.info('Leo command window closed')
      }, 30000)
    }
  }

  const stopLeo = () => {
    setCommandListening(false)
    startTokenRef.current += 1
    startingRef.current = false
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

  const fetchWithTimeout = async (url, options, timeoutMs) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, { ...options, signal: controller.signal })
    } finally {
      clearTimeout(timeout)
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
      const whisperResponse = await fetchWithTimeout(WHISPER_TRANSCRIBE_URL, {
          method: 'POST',
          body: formData
        }, 30000)

      if (!whisperResponse.ok) throw new Error('Whisper failed')

      const whisperData = await whisperResponse.json()
      const text = (whisperData.text || '').trim()

      if (!text) return

      // Whisper can invent repeated command words when a recording is quiet.
      // Never pass those low quality chunks to Rasa.
      const words = text.toLowerCase().match(/[a-z0-9']+/g) || []
      const repeatedWordCount = words.reduce((count, word, index) =>
        count + (index > 0 && word === words[index - 1] ? 1 : 0), 0)
      if (words.length > 12 || repeatedWordCount >= 3) {
        console.debug('Leo ignored a noisy transcription')
        return
      }

      console.log('Leo heard:', text, `(source language: ${whisperData.language || 'unknown'})`)

      // Whisper is configured to translate supported languages to English,
      // which gives the existing Rasa model one consistent input language.
      // Keep the detected source language for diagnostics and future replies.
      const wakeWord = text.match(/\b(?:(?:hey|hail|he'll|hell|hill|here|a)\s*,?\s*(?:leo|leah|neo|yo|you)|heyho|hello\s*,?\s*leo)\b/i)

      let command = (wakeWord
        ? text.slice(wakeWord.index + wakeWord[0].length)
        : (awaitingCommandRef.current ? text : ''))
        .replace(/^[\s,.:;!?-]+|[\s,.:;!?-]+$/g, '')
        .trim()

      command = command
        .replace(/^(yeah|yes|okay|ok)[,\s]*/i, '')
        .replace(/^[\s,.:;!?-]+|[\s,.:;!?-]+$/g, '')
        .trim()

      if (wakeWord) setCommandListening(true)

      if (wakeWord && !command) {
        speak('Yes, I am listening.')
        return
      }

      // The wake phrase opens a short command window. Ignore all other speech
      // while idle, then accept the next utterance in any translated language.
      if (!wakeWord && !awaitingCommandRef.current) return
      if (!command) return

      // Leo listens continuously, but should only send commands after its wake
      // phrase. Wake-word commands can arrive in translated or transliterated
      // wording, so pass the next utterance to Rasa as-is.
      console.log('Leo command:', command)
      setCommandListening(false)

      if (!RASA_REST_URL) {
        throw new Error('Set VITE_RASA_BASE_URL to enable voice commands on this site.')
      }

      // Split coordinated requests such as “play this and turn it up” so the
      // NLU can classify and execute each action independently.
      const commands = command.split(/\s+(?:and then|then|and)\s+(?=(?:please\s+)?(?:play|put on|start|pause|resume|continue|stop|next|skip|previous|go back|increase|decrease|set|turn|raise|lower|mute|unmute|shuffle|repeat|create|delete|search|find|show)\b)/i).map(part => part.trim()).filter(Boolean)
      for (const part of commands) {
        const rasaResponse = await fetchWithTimeout(RASA_REST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender: 'leo-user', message: part })
        }, 15000)

        if (!rasaResponse.ok) throw new Error(`Rasa request failed (${rasaResponse.status})`)

        const rasaData = await rasaResponse.json()
        for (const item of rasaData) {
          const rasaCommand = item.custom?.leo_command || item.leo_command
          if (rasaCommand?.action) {
            window.dispatchEvent(new CustomEvent('leo-command', { detail: rasaCommand }))
          }
        }
        const responseText = rasaData.map(item => item.text || '').filter(Boolean).join(' ')
        if (responseText) speak(responseText)
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
    if (listeningRef.current || startingRef.current) return
    startingRef.current = true
    const startToken = ++startTokenRef.current

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      // React development mode can mount, clean up, and mount the component
      // again while the browser permission prompt is still pending.
      if (startToken !== startTokenRef.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }

      streamRef.current = stream
      listeningRef.current = true
      startingRef.current = false

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
        }, awaitingCommandRef.current ? 4000 : 6000)
      }

      console.log('Leo microphone started')
      listen()
    } catch (error) {
      if (startToken !== startTokenRef.current) return
      console.error('Leo microphone error:', error)
      localStorage.setItem('leoVoiceAssistantEnabled', 'false')
    } finally {
      if (startToken === startTokenRef.current) startingRef.current = false
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
