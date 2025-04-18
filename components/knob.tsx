"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"

interface KnobProps {
  value: number
  min: number
  max: number
  step?: number
  size?: number
  onChange: (value: number) => void
  label?: string
  unit?: string
  color?: string
}

export default function Knob({
  value,
  min,
  max,
  step = 1,
  size = 60,
  onChange,
  label,
  unit = "",
  color = "#a855f7",
}: KnobProps) {
  const knobRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startY, setStartY] = useState(0)
  const [startX, setStartX] = useState(0) // For horizontal movement on mobile
  const [startValue, setStartValue] = useState(0)

  // Normalize value to 0-1 range
  const normalizedValue = (value - min) / (max - min)
  // Convert to degrees (0-270 degrees rotation)
  const degrees = normalizedValue * 270 - 135

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return

      // Calculate vertical movement (negative = up, positive = down)
      const deltaY = e.clientY - startY

      // Adjust sensitivity - lower number = more sensitive
      const sensitivity = 200

      // Calculate new value based on mouse movement
      let newValue = startValue - (deltaY / sensitivity) * (max - min)

      // Clamp value to min/max
      newValue = Math.max(min, Math.min(max, newValue))

      // Round to nearest step if needed
      if (step !== 0) {
        newValue = Math.round(newValue / step) * step
      }

      onChange(newValue)
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || e.touches.length === 0) return

      // Calculate movement based on both vertical and horizontal touch movement
      const touch = e.touches[0]
      const deltaY = touch.clientY - startY
      const deltaX = touch.clientX - startX

      // Use the larger of the movements for better control on mobile
      const delta = Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : -deltaX

      // Adjust sensitivity - lower number = more sensitive
      const sensitivity = 200

      // Calculate new value based on touch movement
      let newValue = startValue - (delta / sensitivity) * (max - min)

      // Clamp value to min/max
      newValue = Math.max(min, Math.min(max, newValue))

      // Round to nearest step if needed
      if (step !== 0) {
        newValue = Math.round(newValue / step) * step
      }

      onChange(newValue)

      // Prevent scrolling while adjusting knob
      e.preventDefault()
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    const handleTouchEnd = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      document.addEventListener("touchmove", handleTouchMove, { passive: false })
      document.addEventListener("touchend", handleTouchEnd)
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      document.removeEventListener("touchmove", handleTouchMove)
      document.removeEventListener("touchend", handleTouchEnd)
    }
  }, [isDragging, startY, startX, startValue, min, max, step, onChange])

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setStartY(e.clientY)
    setStartX(e.clientX)
    setStartValue(value)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0]
      setIsDragging(true)
      setStartY(touch.clientY)
      setStartX(touch.clientX)
      setStartValue(value)
    }
  }

  // Format display value
  const displayValue = () => {
    if (max - min >= 1000) {
      return Math.round(value).toLocaleString()
    } else if (max - min >= 10) {
      return value.toFixed(1)
    } else {
      return value.toFixed(2)
    }
  }

  return (
    <div className="flex flex-col items-center">
      {label && <div className="text-xs text-zinc-400 mb-1">{label}</div>}
      <div
        ref={knobRef}
        className="relative cursor-pointer select-none touch-none"
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        {/* Knob background */}
        <div
          className="absolute rounded-full bg-zinc-800 border border-zinc-700 shadow-inner shadow-black/50"
          style={{
            width: size,
            height: size,
            top: 0,
            left: 0,
          }}
        />

        {/* Value indicator track */}
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute top-0 left-0">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - 4}
            fill="none"
            stroke="#3f3f46"
            strokeWidth="3"
            strokeDasharray={`${(size / 2) * Math.PI * 1.5} ${(size / 2) * Math.PI * 0.5}`}
            transform={`rotate(-135 ${size / 2} ${size / 2})`}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - 4}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={`${(size / 2) * Math.PI * 1.5 * normalizedValue} ${(size / 2) * Math.PI * 2 - (size / 2) * Math.PI * 1.5 * normalizedValue}`}
            transform={`rotate(-135 ${size / 2} ${size / 2})`}
          />
        </svg>

        {/* Indicator line */}
        <div
          className="absolute bg-white rounded-full"
          style={{
            width: 2,
            height: size / 3,
            left: size / 2 - 1,
            top: 4,
            transformOrigin: `1px ${size / 2 - 4}px`,
            transform: `rotate(${degrees}deg)`,
          }}
        />

        {/* Center dot */}
        <div
          className="absolute bg-zinc-600 rounded-full"
          style={{
            width: 8,
            height: 8,
            left: size / 2 - 4,
            top: size / 2 - 4,
          }}
        />
      </div>
      <div className="text-xs text-center mt-1 font-mono">
        {displayValue()}
        {unit}
      </div>
    </div>
  )
}
