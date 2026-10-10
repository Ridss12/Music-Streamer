import { useEffect, useRef } from 'react'

export default function LeoAssistant() {
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const listeningRef = useRef(false)
  const processingRef = useRef(false)

  const stopLeo = () => {
    listeningRef.current = false

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

      const whisperResponse = await fetch(
        'http://127.0.0.1:8001/transcribe',
        {
          method: 'POST',
          body: formData
        }
      )

      if (!whisperResponse.ok) throw new Error('Whisper failed')

      const whisperData = await whisperResponse.json()
      const text = (whisperData.text || '').trim()

      if (!text) return

      console.log('Leo heard:', text)

      // Whisper sometimes transcribes “Hey Leo” as “Heyho” or “Hey yo”.
      // Leo is already explicitly enabled by the user, so also accept a
      // direct supported command when the wake phrase is missed entirely.
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

      console.log('Leo command:', command)

      const lowerCommand = command.toLowerCase().replace(/[.!?,;:]+$/g, '').trim()

      if (/^(play|put on|start)\s+/i.test(command)) {
        window.dispatchEvent(
          new CustomEvent('leo-command', {
            detail: {
              action: 'play',
              song: command.replace(/^(play|put on|start)\s+/i, '').trim()
            }
          })
        )
      } else if (
        lowerCommand === 'pause' ||
        lowerCommand === 'pause music'
      ) {
        window.dispatchEvent(
          new CustomEvent('leo-command', {
            detail: { action: 'pause' }
          })
        )
      } else if (
        lowerCommand === 'resume' ||
        lowerCommand === 'resume music'
      ) {
        window.dispatchEvent(
          new CustomEvent('leo-command', {
            detail: { action: 'resume' }
          })
        )
      } else if (
        lowerCommand === 'stop' ||
        lowerCommand === 'stop music'
      ) {
        window.dispatchEvent(
          new CustomEvent('leo-command', {
            detail: { action: 'stop' }
          })
        )
      } else if (
        /^(next|skip)(\s+(song|track))?$/.test(lowerCommand) ||
        lowerCommand === 'play the next song'
      ) {
        window.dispatchEvent(
          new CustomEvent('leo-command', {
            detail: { action: 'next' }
          })
        )
      } else if (
        lowerCommand === 'previous' ||
        lowerCommand === 'previous song' ||
        lowerCommand === 'previous track' ||
        lowerCommand === 'go back'
      ) {
        window.dispatchEvent(
          new CustomEvent('leo-command', {
            detail: { action: 'previous' }
          })
        )
      } else if (/^(mute|mute music)$/.test(lowerCommand)) {
        window.dispatchEvent(new CustomEvent('leo-command', { detail: { action: 'mute' } }))
      } else if (/^(unmute|unmute music)$/.test(lowerCommand)) {
        window.dispatchEvent(new CustomEvent('leo-command', { detail: { action: 'unmute' } }))
      } else if (/^(shuffle|shuffle music|shuffle playlist)$/.test(lowerCommand)) {
        window.dispatchEvent(new CustomEvent('leo-command', { detail: { action: 'shuffle' } }))
      } else if (/^(repeat|repeat song|repeat this song)$/.test(lowerCommand)) {
        window.dispatchEvent(new CustomEvent('leo-command', { detail: { action: 'repeat' } }))
      }

      // Start the player action immediately. Rasa is only used for a spoken
      // reply, so an unavailable or slow Rasa server must not block playback.
      void (async () => {
        try {
          const rasaResponse = await fetch(
            'http://127.0.0.1:5005/webhooks/rest/webhook',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sender: 'leo-user', message: command })
            }
          )

          if (rasaResponse.ok) {
            const rasaData = await rasaResponse.json()
            const responseText = rasaData
              .map(item => item.text || '')
              .filter(Boolean)
              .join(' ')
            if (responseText) speak(responseText)
          }
        } catch (error) {
          console.warn('Leo conversational service unavailable:', error)
        }
      })()
    } catch (error) {
      console.error('Leo error:', error)
    } finally {
      processingRef.current = false
    }
  }

  const speak = (text) => {
    if (!('speechSynthesis' in window)) return

    window.speechSynthesis.cancel()

    const speech = new SpeechSynthesisUtterance(text)
    speech.rate = 1
    speech.pitch = 1
    speech.volume = 1

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

          if (chunks.length > 0) {
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
