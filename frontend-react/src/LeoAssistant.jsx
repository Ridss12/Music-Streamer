import { useEffect, useRef } from 'react'
import { RASA_REST_URL, WHISPER_TRANSCRIBE_URL } from './serviceUrls'

export default function LeoAssistant() {
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const listeningRef = useRef(false)
  const processingRef = useRef(false)
  const speakingRef = useRef(false)
  const discardRecordingRef = useRef(false)
  const speechTokenRef = useRef(0)

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

      console.log('Leo heard:', text, `(source language: ${whisperData.language || 'unknown'})`)

      // Whisper is configured to translate supported languages to English,
      // which gives the existing Rasa model one consistent input language.
      // Keep the detected source language for diagnostics and future replies.
      const wakeWord = text.match(/\b(?:hey\s*,?\s*(?:leo|leah|neo|yo)|heyho|hello\s*,?\s*leo)\b/i)

      let command = (wakeWord
        ? text.slice(wakeWord.index + wakeWord[0].length)
        : text)
        .replace(/^[\s,.:;!?-]+|[\s,.:;!?-]+$/g, '')
        .trim()

      command = command
        .replace(/^(yeah|yes|okay|ok)[,\s]*/i, '')
        .replace(/^[\s,.:;!?-]+|[\s,.:;!?-]+$/g, '')
        .trim()

      if (!command) {
        speak('Yes, I am listening.')
        return
      }

      const directCommand = /\b(?:play|put on|start|listen to|i want|give me|can i hear|pause|resume|continue|stop|next|skip|previous|go back|volume|louder|quieter|mute|unmute|shuffle|repeat|playlist|search|find|show lyrics)\b/i.test(command)

      // Leo listens continuously, but should only send commands after its wake
      // phrase or when the user says a supported command directly. This keeps
      // ordinary speech and Leo's own spoken reply out of the Rasa conversation.
      if (!wakeWord && !directCommand) return

      console.log('Leo command:', command)

      if (!RASA_REST_URL) {
        throw new Error('Set VITE_RASA_BASE_URL to enable voice commands on this site.')
      }

      // Split coordinated requests such as “play this and turn it up” so the
      // NLU can classify and execute each action independently.
      const commands = command.split(/\s+(?:and then|then|and)\s+(?=(?:please\s+)?(?:play|put on|start|pause|resume|continue|stop|next|skip|previous|go back|increase|decrease|set|turn|raise|lower|mute|unmute|shuffle|repeat|create|delete|search|find|show)\b)/i).map(part => part.trim()).filter(Boolean)
      for (const part of commands) {
        const rasaResponse = await fetch(RASA_REST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender: 'leo-user', message: part })
        })

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
