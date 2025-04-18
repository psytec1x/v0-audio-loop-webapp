"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Play, Square, Mic, Download, Plus } from "lucide-react"
import AudioTrack from "./audio-track"
import Knob from "./knob"

export default function AudioLooper() {
  const [tracks, setTracks] = useState<Array<{ id: number; audioBuffer: AudioBuffer | null }>>([
    { id: 1, audioBuffer: null },
  ])
  const [masterTempo, setMasterTempo] = useState(120)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<BlobPart[]>([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null)

  useEffect(() => {
    // Initialize AudioContext on first user interaction
    const initAudioContext = () => {
      if (!audioContextRef.current) {
        try {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
          // Create a destination for recording
          destinationRef.current = audioContextRef.current.createMediaStreamDestination()
        } catch (error) {
          console.error("Failed to initialize AudioContext:", error)
        }
      }
    }

    window.addEventListener("click", initAudioContext, { once: true })
    window.addEventListener("touchstart", initAudioContext, { once: true })

    return () => {
      window.removeEventListener("click", initAudioContext)
      window.removeEventListener("touchstart", initAudioContext)
      if (audioContextRef.current) {
        audioContextRef.current.close().catch((err) => console.error("Error closing AudioContext:", err))
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
    }
  }, [])

  const addTrack = () => {
    if (tracks.length < 16) {
      setTracks([...tracks, { id: Date.now(), audioBuffer: null }])
    }
  }

  const handleMasterPlay = () => {
    // Resume AudioContext if it's suspended (needed for iOS/Safari)
    if (audioContextRef.current?.state === "suspended") {
      audioContextRef.current.resume().catch((err) => console.error("Error resuming AudioContext:", err))
    }
    setIsPlaying(true)
  }

  const handleMasterStop = () => {
    setIsPlaying(false)
  }

  const startMasterRecording = () => {
    if (!audioContextRef.current || !destinationRef.current || isRecording) return

    // Resume AudioContext if it's suspended (needed for iOS/Safari)
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume().catch((err) => console.error("Error resuming AudioContext:", err))
    }

    // Reset recording state
    recordedChunksRef.current = []
    setRecordingTime(0)
    setRecordedBlob(null)

    try {
      // Create MediaRecorder from the destination stream
      const mediaRecorder = new MediaRecorder(destinationRef.current.stream)
      mediaRecorderRef.current = mediaRecorder

      // Set up event handlers
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        if (recordedChunksRef.current.length === 0) {
          console.warn("No data recorded")
          return
        }

        const blob = new Blob(recordedChunksRef.current, { type: "audio/webm" })
        setRecordedBlob(blob)

        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current)
          recordingTimerRef.current = null
        }
      }

      // Start recording
      mediaRecorder.start()
      setIsRecording(true)

      // Start playback if not already playing
      if (!isPlaying) {
        setIsPlaying(true)
      }

      // Start timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
    } catch (error) {
      console.error("Error starting master recording:", error)
    }
  }

  const stopMasterRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return

    try {
      mediaRecorderRef.current.stop()
      setIsRecording(false)

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
    } catch (error) {
      console.error("Error stopping master recording:", error)
      setIsRecording(false)
    }
  }

  const downloadRecording = () => {
    if (!recordedBlob) return

    try {
      const url = URL.createObjectURL(recordedBlob)
      const a = document.createElement("a")
      a.style.display = "none"
      a.href = url
      a.download = `audio-looper-recording-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.webm`
      document.body.appendChild(a)
      a.click()

      // Clean up
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 100)
    } catch (error) {
      console.error("Error downloading recording:", error)
    }
  }

  // Format recording time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-zinc-900/80 backdrop-blur-sm p-4 sm:p-5 rounded-xl border border-purple-800/50 shadow-lg shadow-purple-900/20">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-purple-400">Master Controls</h2>
            <Button
              onClick={addTrack}
              size="sm"
              className="bg-purple-800/80 hover:bg-purple-700 text-xs w-full sm:w-auto"
              disabled={tracks.length >= 16}
            >
              <Plus className="mr-1 h-3 w-3" /> Track ({tracks.length}/16)
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-center">
            {/* Transport Controls */}
            <div className="flex gap-2 justify-center sm:justify-start">
              <Button
                onClick={handleMasterPlay}
                size="sm"
                className="bg-purple-700/80 hover:bg-purple-600 px-3 h-8 flex-1 sm:flex-none"
              >
                <Play className="mr-1 h-3 w-3" /> Play
              </Button>
              <Button
                onClick={handleMasterStop}
                size="sm"
                className="bg-red-700/80 hover:bg-red-600 px-3 h-8 flex-1 sm:flex-none"
              >
                <Square className="mr-1 h-3 w-3" /> Stop
              </Button>
            </div>

            {/* Tempo Knob */}
            <div className="flex justify-center">
              <Knob
                value={masterTempo}
                min={60}
                max={200}
                step={1}
                size={70}
                onChange={setMasterTempo}
                label="Master Tempo"
                unit=" BPM"
                color="#a855f7"
              />
            </div>

            {/* Recording Controls */}
            <div className="flex gap-2 justify-center sm:justify-end">
              <Button
                onClick={isRecording ? stopMasterRecording : startMasterRecording}
                size="sm"
                className={`${
                  isRecording ? "bg-red-600/90 hover:bg-red-700" : "bg-purple-700/80 hover:bg-purple-600"
                } px-3 h-8 flex-1 sm:flex-none`}
              >
                <Mic className="mr-1 h-3 w-3" />
                {isRecording ? "Stop Rec" : "Record"}
              </Button>

              {recordedBlob && (
                <Button
                  onClick={downloadRecording}
                  size="sm"
                  className="bg-green-700/80 hover:bg-green-600 px-3 h-8 flex-1 sm:flex-none"
                >
                  <Download className="mr-1 h-3 w-3" /> Save
                </Button>
              )}
            </div>
          </div>

          {/* Recording Status */}
          {(isRecording || recordedBlob) && (
            <div className="mt-1 flex justify-center">
              {isRecording && (
                <div className="flex items-center gap-2 bg-zinc-800/70 px-3 py-1 rounded-full">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                  <span className="text-xs font-mono">{formatTime(recordingTime)}</span>
                </div>
              )}

              {recordedBlob && !isRecording && (
                <div className="text-xs text-zinc-400 bg-zinc-800/70 px-3 py-1 rounded-full">
                  Recording: {formatTime(recordingTime)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {tracks.map((track) => (
          <AudioTrack
            key={track.id}
            trackId={track.id}
            masterTempo={masterTempo}
            isPlaying={isPlaying}
            audioContext={audioContextRef.current}
            destinationNode={destinationRef.current}
          />
        ))}
      </div>
    </div>
  )
}
