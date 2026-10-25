const EMOTIONS = ['happy', 'sad', 'energetic', 'calm', 'angry', 'romantic']

function fftMagnitudes(input) {
  const n = input.length
  const real = Float64Array.from(input)
  const imag = new Float64Array(n)

  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[real[i], real[j]] = [real[j], real[i]]
      ;[imag[i], imag[j]] = [imag[j], imag[i]]
    }
  }

  for (let size = 2; size <= n; size <<= 1) {
    const angle = -2 * Math.PI / size
    const stepReal = Math.cos(angle)
    const stepImag = Math.sin(angle)
    for (let start = 0; start < n; start += size) {
      let wr = 1
      let wi = 0
      for (let offset = 0; offset < size / 2; offset += 1) {
        const even = start + offset
        const odd = even + size / 2
        const tr = wr * real[odd] - wi * imag[odd]
        const ti = wr * imag[odd] + wi * real[odd]
        real[odd] = real[even] - tr
        imag[odd] = imag[even] - ti
        real[even] += tr
        imag[even] += ti
        const nextWr = wr * stepReal - wi * stepImag
        wi = wr * stepImag + wi * stepReal
        wr = nextWr
      }
    }
  }

  return { real, imag }
}

function clamp(value) {
  return Math.max(0, Math.min(1, value))
}

export async function analyzeLocalAudio(file) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) throw new Error('This browser does not support local audio analysis.')

  const context = new AudioContextClass()
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer())
    const channel = buffer.getChannelData(0)
    const sampleRate = buffer.sampleRate
    const sampleLimit = Math.min(channel.length, sampleRate * 30)
    const blockSize = Math.max(1, Math.floor(sampleRate * 0.25))
    const rmsBlocks = []
    let squareSum = 0
    let crossings = 0
    let previous = channel[0] || 0

    for (let start = 0; start < sampleLimit; start += blockSize) {
      const end = Math.min(sampleLimit, start + blockSize)
      let blockSquares = 0
      for (let i = start; i < end; i += 1) {
        const sample = channel[i]
        blockSquares += sample * sample
        squareSum += sample * sample
        if ((sample >= 0) !== (previous >= 0)) crossings += 1
        previous = sample
      }
      rmsBlocks.push(Math.sqrt(blockSquares / Math.max(1, end - start)))
    }

    const rms = Math.sqrt(squareSum / Math.max(1, sampleLimit))
    const rmsMean = rmsBlocks.reduce((sum, value) => sum + value, 0) / Math.max(1, rmsBlocks.length)
    const rmsStd = Math.sqrt(rmsBlocks.reduce((sum, value) => sum + ((value - rmsMean) ** 2), 0) / Math.max(1, rmsBlocks.length))
    const zeroCrossing = clamp((crossings / Math.max(1, sampleLimit)) / 0.2)

    const fftSize = 2048
    const centroidFrames = []
    const frameCount = Math.min(24, Math.max(1, Math.floor(sampleLimit / fftSize)))
    for (let frame = 0; frame < frameCount; frame += 1) {
      const start = Math.floor(frame * Math.max(1, sampleLimit - fftSize) / Math.max(1, frameCount - 1))
      const samples = new Float64Array(fftSize)
      for (let i = 0; i < fftSize; i += 1) {
        const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1))
        samples[i] = (channel[start + i] || 0) * window
      }
      const { real, imag } = fftMagnitudes(samples)
      let weighted = 0
      let magnitudeSum = 0
      for (let bin = 1; bin < fftSize / 2; bin += 1) {
        const magnitude = Math.hypot(real[bin], imag[bin])
        weighted += (bin * sampleRate / fftSize) * magnitude
        magnitudeSum += magnitude
      }
      if (magnitudeSum) centroidFrames.push(weighted / magnitudeSum)
    }

    const centroid = centroidFrames.length
      ? centroidFrames.reduce((sum, value) => sum + value, 0) / centroidFrames.length
      : 2000
    const brightness = clamp((centroid - 1000) / 4000)
    const energy = clamp(rms / 0.15)
    const onset = clamp(rmsBlocks.slice(1).reduce((sum, value, i) => sum + Math.abs(value - rmsBlocks[i]), 0) / Math.max(1, rmsBlocks.length - 1) * 8)
    const tempo = 110
    const tempoFast = Math.min(1, tempo / 160)
    const tempoSlow = Math.max(0, 1 - tempo / 100)
    const tempoMid = Math.max(0, 1 - Math.abs(tempo - 110) / 80)
    const beatDensity = clamp(onset)
    const contrast = clamp(brightness * 0.7 + zeroCrossing * 0.3)
    const harmony = 0.5

    const emotions = {
      happy: 0.25 * tempoFast + 0.2 * brightness + 0.25 * energy + 0.15 * harmony + 0.15 * harmony,
      sad: 0.3 * tempoSlow + 0.25 * (1 - energy) + 0.25 * (1 - brightness) + 0.1 * (1 - onset) + 0.1 * (1 - beatDensity),
      energetic: 0.3 * tempoFast + 0.3 * energy + 0.2 * onset + 0.1 * beatDensity + 0.1 * Math.min(1, rmsStd * 10),
      calm: 0.25 * tempoSlow + 0.25 * (1 - energy) + 0.2 * (1 - onset) + 0.15 * (1 - brightness) + 0.15 * (1 - contrast),
      angry: 0.25 * energy + 0.2 * brightness + 0.2 * Math.min(1, rmsStd * 12) + 0.2 * zeroCrossing + 0.15 * (1 - harmony),
      romantic: 0.25 * tempoMid + 0.25 * harmony + 0.2 * harmony + 0.15 * (1 - onset) + 0.15 * contrast,
    }

    return Object.fromEntries(EMOTIONS.map(emotion => [emotion, clamp(emotions[emotion])]))
  } finally {
    await context.close()
  }
}
