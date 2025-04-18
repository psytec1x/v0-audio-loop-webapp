"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Play, Square, Rewind, Mic, Upload, RefreshCw } from "lucide-react"
import WaveformDisplay from "./waveform-display"
import Knob from "./knob"

interface AudioTrackProps {
  trackId: number
  masterTempo: number
  isPlaying: boolean
  audioContext: AudioContext | null
  destinationNode: MediaStreamAudioDestinationNode | null
}

export default function AudioTrack({
  trackId,
  masterTempo,
  isPlaying,
  audioContext,
  destinationNode,
}: AudioTrackProps) {
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [trackPlaying, setTrackPlaying] = useState(false)
  const [syncToMaster, setSyncToMaster] = useState(false)
  const [loopStart, setLoopStart] = useState(0)
  const [loopEnd, setLoopEnd] = useState(1)
  const [trackTempo, setTrackTempo] = useState(120)

  // Effect parameters
  const [reverbAmount, setReverbAmount] = useState(0)
  const [delayAmount, setDelayAmount] = useState(0)
  const [filterFreq, setFilterFreq] = useState(20000)

  // Audio nodes
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const reverbNodeRef = useRef<ConvolverNode | null>(null)
  const delayNodeRef = useRef<DelayNode | null>(null)
  const filterNodeRef = useRef<BiquadFilterNode | null>(null)
  const reverbImpulseRef = useRef<AudioBuffer | null>(null)

  // For recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<BlobPart[]>([])
  const [isRecording, setIsRecording] = useState(false)

  useEffect(() => {
    if (audioContext && !reverbImpulseRef.current) {
      // Create a simple impulse response for reverb
      createReverbImpulse()
    }
  }, [audioContext])

  useEffect(() => {
    if (syncToMaster) {
      setTrackTempo(masterTempo)
    }
  }, [masterTempo, syncToMaster])

  useEffect(() => {
    if (isPlaying && audioBuffer && audioContext) {
      playAudio()
    } else if (!isPlaying) {
      stopAudio()
    }

    return () => {
      stopAudio()
    }
  }, [isPlaying, audioBuffer, loopStart, loopEnd, reverbAmount, delayAmount, filterFreq])

  const createReverbImpulse = async () => {
    if (!audioContext) return

    try {
      // Create a simple impulse response for reverb (2 seconds)
      const sampleRate = audioContext.sampleRate
      const length = 2 * sampleRate
      const impulse = audioContext.createBuffer(2, length, sampleRate)

      const leftChannel = impulse.getChannelData(0)
      const rightChannel = impulse.getChannelData(1)

      // Exponential decay
      for (let i = 0; i < length; i++) {
        const decay = Math.exp(-i / (sampleRate * 0.5))
        leftChannel[i] = (Math.random() * 2 - 1) * decay
        rightChannel[i] = (Math.random() * 2 - 1) * decay
      }

      reverbImpulseRef.current = impulse
    } catch (error) {
      console.error("Error creating reverb impulse:", error)
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !audioContext) return

    setIsLoading(true)

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer
        const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer)
        setAudioBuffer(decodedBuffer)
        setLoopEnd(decodedBuffer.duration)
      } catch (error) {
        console.error("Error decoding audio data:", error)
      } finally {
        setIsLoading(false)
      }
    }
    reader.onerror = () => {
      console.error("Error reading file")
      setIsLoading(false)
    }
    reader.readAsArrayBuffer(file)
  }

  const setupAudioNodes = () => {
    if (!audioContext || !audioBuffer) return null

    try {
      // Clean up previous nodes
      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect()
      }

      // Create nodes
      const sourceNode = audioContext.createBufferSource()
      sourceNode.buffer = audioBuffer
      sourceNode.loop = true

      const gainNode = audioContext.createGain()
      gainNodeRef.current = gainNode

      const filterNode = audioContext.createBiquadFilter()
      filterNode.type = "lowpass"
      filterNode.frequency.value = filterFreq
      filterNodeRef.current = filterNode

      const delayNode = audioContext.createDelay(5.0)
      delayNode.delayTime.value = delayAmount
      delayNodeRef.current = delayNode

      const delayGainNode = audioContext.createGain()
      delayGainNode.gain.value = delayAmount > 0 ? 0.5 : 0

      let reverbNode: ConvolverNode | null = null
      if (reverbImpulseRef.current && reverbAmount > 0) {
        reverbNode = audioContext.createConvolver()
        reverbNode.buffer = reverbImpulseRef.current
        reverbNodeRef.current = reverbNode
      }

      const reverbGainNode = audioContext.createGain()
      reverbGainNode.gain.value = reverbAmount

      const dryGainNode = audioContext.createGain()
      dryGainNode.gain.value = 1 - Math.max(reverbAmount, 0)

      // Connect nodes
      sourceNode.connect(filterNode)
      filterNode.connect(gainNode)

      // Delay effect path
      if (delayAmount > 0) {
        filterNode.connect(delayNode)
        delayNode.connect(delayGainNode)
        delayGainNode.connect(gainNode)
      }

      // Reverb effect path
      if (reverbNode && reverbAmount > 0) {
        filterNode.connect(reverbNode)
        reverbNode.connect(reverbGainNode)
        reverbGainNode.connect(gainNode)
      }

      // Connect to main output
      gainNode.connect(audioContext.destination)

      // Also connect to the recording destination if available
      if (destinationNode) {
        gainNode.connect(destinationNode)
      }

      sourceNodeRef.current = sourceNode
      return sourceNode
    } catch (error) {
      console.error("Error setting up audio nodes:", error)
      return null
    }
  }

  const playAudio = () => {
    if (!audioContext || !audioBuffer) return

    try {
      // Resume AudioContext if it's suspended (needed for iOS/Safari)
      if (audioContext.state === "suspended") {
        audioContext.resume().catch((err) => console.error("Error resuming AudioContext:", err))
      }

      stopAudio()

      const sourceNode = setupAudioNodes()
      if (!sourceNode) return

      // Set loop points
      sourceNode.loopStart = loopStart
      sourceNode.loopEnd = loopEnd

      // Start playback
      sourceNode.start(0, loopStart)
      setTrackPlaying(true)
    } catch (error) {
      console.error("Error playing audio:", error)
    }
  }

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop()
      } catch (e) {
        // Ignore errors if already stopped
      }
      sourceNodeRef.current = null
    }
    setTrackPlaying(false)
  }

  const handleTrackPlay = () => {
    if (audioBuffer && audioContext) {
      playAudio()
    }
  }

  const handleTrackStop = () => {
    stopAudio()
  }

  const startRecording = async () => {
    if (!audioContext) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      recordedChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        if (recordedChunksRef.current.length === 0) {
          console.warn("No data recorded")
          return
        }

        const blob = new Blob(recordedChunksRef.current, { type: "audio/webm" })
        const arrayBuffer = await blob.arrayBuffer()
        try {
          const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer)
          setAudioBuffer(decodedBuffer)
          setLoopEnd(decodedBuffer.duration)
        } catch (error) {
          console.error("Error decoding recorded audio:", error)
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error("Error starting recording:", error)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      try {
        mediaRecorderRef.current.stop()
      } catch (error) {
        console.error("Error stopping recording:", error)
      } finally {
        setIsRecording(false)
      }
    }
  }

  const handleLoopRegionChange = (start: number, end: number) => {
    setLoopStart(start)
    setLoopEnd(end)

    if (trackPlaying && sourceNodeRef.current) {
      // Restart playback with new loop points
      playAudio()
    }
  }

  return (
    <div className="bg-zinc-900/80 backdrop-blur-sm p-4 rounded-xl border border-purple-800/50 shadow-lg shadow-purple-900/20">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h3 className="text-lg font-semibold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-purple-600">
            Track {trackId}
          </h3>
          <div className="flex gap-2 w-full sm:w-auto">
            <label className="relative cursor-pointer flex-1 sm:flex-none">
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                className="sr-only"
                disabled={isLoading}
              />
              <Button
                variant="outline"
                size="sm"
                className="border-purple-500/50 text-purple-400 h-8 w-full sm:w-auto"
                disabled={isLoading}
              >
                <Upload className="mr-1 h-3 w-3" />
                {isLoading ? "Loading..." : "Load Sample"}
              </Button>
            </label>
            <Button
              variant={syncToMaster ? "default" : "outline"}
              size="sm"
              className={`${
                syncToMaster ? "bg-purple-600/80 hover:bg-purple-500" : "border-purple-500/50 text-purple-400"
              } h-8 flex-1 sm:flex-none`}
              onClick={() => setSyncToMaster(!syncToMaster)}
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              Sync
            </Button>
          </div>
        </div>

        {/* Waveform display */}
        <div className="h-32 bg-zinc-800/80 rounded-lg overflow-hidden border border-zinc-700/50">
          {audioBuffer ? (
            <WaveformDisplay
              audioBuffer={audioBuffer}
              loopStart={loopStart}
              loopEnd={loopEnd}
              onRegionChange={handleLoopRegionChange}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-500">No audio loaded</div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Transport controls */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleTrackPlay}
              disabled={!audioBuffer}
              size="sm"
              className="bg-purple-700/80 hover:bg-purple-600 h-8 flex-1 sm:flex-none"
            >
              <Play className="mr-1 h-3 w-3" /> Play
            </Button>
            <Button
              onClick={handleTrackStop}
              disabled={!trackPlaying}
              size="sm"
              className="bg-red-700/80 hover:bg-red-600 h-8 flex-1 sm:flex-none"
            >
              <Square className="mr-1 h-3 w-3" /> Stop
            </Button>
            <Button
              onClick={() => {
                if (sourceNodeRef.current && audioBuffer) {
                  sourceNodeRef.current.stop()
                  playAudio()
                }
              }}
              disabled={!audioBuffer}
              size="sm"
              className="bg-zinc-700/80 hover:bg-zinc-600 h-8 flex-1 sm:flex-none"
            >
              <Rewind className="mr-1 h-3 w-3" /> Reset
            </Button>
            <Button
              onClick={isRecording ? stopRecording : startRecording}
              size="sm"
              className={`${isRecording ? "bg-red-600/90" : "bg-zinc-700/80 hover:bg-zinc-600"} h-8 flex-1 sm:flex-none`}
            >
              <Mic className="mr-1 h-3 w-3" /> {isRecording ? "Stop Rec" : "Record"}
            </Button>
          </div>

          {/* Tempo control (if not synced) */}
          <div className="flex justify-center">
            {!syncToMaster ? (
              <Knob
                value={trackTempo}
                min={60}
                max={200}
                step={1}
                onChange={setTrackTempo}
                label="Tempo"
                unit=" BPM"
                color="#a855f7"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-zinc-400">
                Synced to Master Tempo
              </div>
            )}
          </div>
        </div>

        {/* Effects section */}
        <div className="mt-2 p-4 bg-zinc-800/60 rounded-lg border border-zinc-700/50">
          <h4 className="text-sm font-semibold mb-4 text-center text-purple-400">Effects</h4>
          <div className="flex flex-wrap justify-around gap-6">
            <Knob
              value={reverbAmount}
              min={0}
              max={1}
              step={0.01}
              onChange={setReverbAmount}
              label="Reverb"
              unit="%"
              color="#a855f7"
              size={50}
            />

            <Knob
              value={delayAmount}
              min={0}
              max={1}
              step={0.01}
              onChange={setDelayAmount}
              label="Delay"
              unit="%"
              color="#a855f7"
              size={50}
            />

            <Knob
              value={filterFreq}
              min={20}
              max={20000}
              step={1}
              onChange={setFilterFreq}
              label="Filter"
              unit="Hz"
              color="#a855f7"
              size={50}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
