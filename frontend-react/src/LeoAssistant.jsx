import { useEffect, useRef } from 'react'

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

      const directCommand = /^(?:(?:please|can you|could you)\s+)?(?:play(?:\s+.+)?|put on\s+.+|start\s+.+|pause(?:\s+music)?|resume(?:\s+music)?|continue(?:\s+playing)?|stop(?:\s+music)?|(?:next|skip)(?:\s+(?:song|track|this song))?|(?:previous|go back)(?:\s+(?:song|track))?|mute(?:\s+music)?|unmute(?:\s+music)?|shuffle(?:\s+(?:music|playlist))?|repeat(?:\s+(?:music|song|this song))?|(?:create|make)\s+(?:a\s+)?playlist\b.+|delete\s+(?:my\s+)?playlist\b.+)$/i.test(command)

      // Leo listens continuously, but should only send commands after its wake
      // phrase or when the user says a supported command directly. This keeps
      // ordinary speech and Leo's own spoken reply out of the Rasa conversation.
      if (!wakeWord && !directCommand) return

      console.log('Leo command:', command)

      const lowerCommand = command.toLowerCase().replace(/[.!?,;:]+$/g, '').trim()
      const localCommandHandled =
        /^(play|put on|start)\s+/i.test(command) ||
        /^(pause|pause music|resume|resume music|stop|stop music|next|skip(\s+(song|track))?|play (the )?next song|previous|previous song|previous track|play (the )?previous song|go back|mute|mute music|unmute|unmute music|shuffle|shuffle music|shuffle playlist|repeat|repeat song|repeat this song)$/.test(lowerCommand)

      if (/^(next|skip)(\s+(song|track))?$/.test(lowerCommand) || /^(play )?(the )?next song$/.test(lowerCommand)) {
        window.dispatchEvent(new CustomEvent('leo-command', { detail: { action: 'next' } }))
      } else if (/^(previous|previous song|previous track|play (the )?previous song|go back)$/.test(lowerCommand)) {
        window.dispatchEvent(new CustomEvent('leo-command', { detail: { action: 'previous' } }))
      } else if (/^(play|put on|start)\s+/i.test(command)) {
        const requestedSong = command
          .replace(/^(play|put on|start)\s+/i, '')
          .replace(/^(the\s+song|song|me)\s+/i, '')
          .replace(/^['"“”]+|['"“”]+$/g, '')
          .trim()
        window.dispatchEvent(
          new CustomEvent('leo-command', {
            detail: {
              action: 'play',
              song: requestedSong
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
            if (!localCommandHandled) {
              const rasaCommand = rasaData
                .map(item => item.custom?.leo_command || item.leo_command)
                .find(Boolean)
              if (rasaCommand?.action) {
                window.dispatchEvent(
                  new CustomEvent('leo-command', { detail: rasaCommand })
                )
              }
            }
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
