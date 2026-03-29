interface AudioLevelIndicatorProps {
  level: number // 0-1
}

export function AudioLevelIndicator({ level }: AudioLevelIndicatorProps) {
  const bars = 5
  return (
    <div className="flex items-end gap-0.5 h-4">
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = (i + 1) / bars
        const active = level >= threshold * 0.5
        return (
          <div
            key={i}
            className={`w-1 rounded-full transition-all duration-75 ${
              active ? 'bg-red-500' : 'bg-geoff-border'
            }`}
            style={{
              height: `${((i + 1) / bars) * 100}%`,
              opacity: active ? 0.8 + level * 0.2 : 0.3,
            }}
          />
        )
      })}
    </div>
  )
}
