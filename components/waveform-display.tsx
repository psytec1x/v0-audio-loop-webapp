"use client"

import type React from "react"

import { useRef, useEffect, useState } from "react"

interface WaveformDisplayProps {
  audioBuffer: AudioBuffer
  loopStart: number
  loopEnd: number
  onRegionChange: (start: number, end: number) => void
}

export default function WaveformDisplay({ audioBuffer, loopStart, loopEnd, onRegionChange }: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<number | null>(null)
  const [dragEnd, setDragEnd] = useState<number | null>(null)
  const [canvasWidth, setCanvasWidth] = useState(0)
  const [canvasHeight, setCanvasHeight] = useState(0)

  // Draw the waveform
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !audioBuffer) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas dimensions
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()

    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr

    setCanvasWidth(rect.width)
    setCanvasHeight(rect.height)

    ctx.scale(dpr, dpr)

    // Clear canvas
    ctx.fillStyle = "#18181b" // bg-zinc-900
    ctx.fillRect(0, 0, rect.width, rect.height)

    // Add a subtle grid
    ctx.strokeStyle = "rgba(63, 63, 70, 0.3)" // zinc-700 with opacity
    ctx.lineWidth = 0.5

    // Vertical grid lines
    const verticalLines = 10
    for (let i = 1; i < verticalLines; i++) {
      const x = (rect.width / verticalLines) * i
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, rect.height)
      ctx.stroke()
    }

    // Horizontal grid line in the middle
    ctx.beginPath()
    ctx.moveTo(0, rect.height / 2)
    ctx.lineTo(rect.width, rect.height / 2)
    ctx.stroke()

    // Draw waveform
    const data = audioBuffer.getChannelData(0)
    const step = Math.ceil(data.length / rect.width)
    const amp = rect.height / 2

    // Draw waveform with gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, rect.height)
    gradient.addColorStop(0, "#c084fc") // purple-400
    gradient.addColorStop(0.5, "#a855f7") // purple-500
    gradient.addColorStop(1, "#c084fc") // purple-400

    ctx.lineWidth = 1.5
    ctx.strokeStyle = gradient
    ctx.beginPath()

    for (let i = 0; i < rect.width; i++) {
      let min = 1.0
      let max = -1.0

      for (let j = 0; j < step; j++) {
        const index = i * step + j
        if (index < data.length) {
          const datum = data[index]
          if (datum < min) min = datum
          if (datum > max) max = datum
        }
      }

      ctx.moveTo(i, (1 + min) * amp)
      ctx.lineTo(i, (1 + max) * amp)
    }

    ctx.stroke()

    // Draw loop region
    const startPx = (loopStart / audioBuffer.duration) * rect.width
    const endPx = (loopEnd / audioBuffer.duration) * rect.width

    ctx.fillStyle = "rgba(168, 85, 247, 0.3)" // purple-500 with opacity
    ctx.fillRect(startPx, 0, endPx - startPx, rect.height)

    // Draw loop markers
    ctx.fillStyle = "#a855f7" // text-purple-500
    ctx.fillRect(startPx - 2, 0, 4, rect.height)
    ctx.fillRect(endPx - 2, 0, 4, rect.height)

    // Add time indicators
    ctx.fillStyle = "#a1a1aa" // text-zinc-400
    ctx.font = "10px monospace"
    ctx.fillText("0:00", 5, rect.height - 5)

    const duration = Math.floor(audioBuffer.duration)
    const minutes = Math.floor(duration / 60)
    const seconds = duration % 60
    ctx.fillText(`${minutes}:${seconds.toString().padStart(2, "0")}`, rect.width - 35, rect.height - 5)
  }, [audioBuffer, loopStart, loopEnd])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && audioBuffer) {
        const canvas = canvasRef.current
        const rect = canvas.getBoundingClientRect()
        setCanvasWidth(rect.width)
        setCanvasHeight(rect.height)
      }
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [audioBuffer])

  const getPositionFromEvent = (clientX: number) => {
    if (!canvasRef.current) return 0

    const rect = canvasRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    return (x / canvasWidth) * audioBuffer.duration
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const position = getPositionFromEvent(e.clientX)
    setIsDragging(true)
    setDragStart(position)
    setDragEnd(position)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !canvasRef.current || dragStart === null) return

    const position = getPositionFromEvent(e.clientX)
    setDragEnd(position)
  }

  const handleMouseUp = () => {
    if (isDragging && dragStart !== null && dragEnd !== null) {
      const start = Math.min(dragStart, dragEnd)
      const end = Math.max(dragStart, dragEnd)

      // Only update if the selection is meaningful (not a click)
      if (Math.abs(dragStart - dragEnd) > 0.01) {
        onRegionChange(start, end)
      }
    }

    setIsDragging(false)
  }

  // Touch event handlers for mobile
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length > 0) {
      const position = getPositionFromEvent(e.touches[0].clientX)
      setIsDragging(true)
      setDragStart(position)
      setDragEnd(position)
    }
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDragging || !canvasRef.current || dragStart === null || e.touches.length === 0) return

    const position = getPositionFromEvent(e.touches[0].clientX)
    setDragEnd(position)
    e.preventDefault() // Prevent scrolling while selecting
  }

  const handleTouchEnd = () => {
    if (isDragging && dragStart !== null && dragEnd !== null) {
      const start = Math.min(dragStart, dragEnd)
      const end = Math.max(dragStart, dragEnd)

      // Only update if the selection is meaningful (not a tap)
      if (Math.abs(dragStart - dragEnd) > 0.01) {
        onRegionChange(start, end)
      }
    }

    setIsDragging(false)
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-pointer touch-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    />
  )
}
