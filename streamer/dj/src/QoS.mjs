export function getTimeToEnqueue(
  currentTime,
  requestedTimes,
  { margin = 600e3, insertSpace = 960e3, allRequestedTimes = [] } = {}
) {
  if (allRequestedTimes.length > 0) {
    const min = Math.min(...allRequestedTimes)
    const maxInMargin = Math.max(
      ...allRequestedTimes.filter((t) => t < min + margin)
    )
    currentTime = Math.max(currentTime, maxInMargin - margin + 1)
  }
  const possibleTimesToInsertAfter = [currentTime, ...requestedTimes]
  return (
    Math.max(
      Math.min(
        ...possibleTimesToInsertAfter.filter(
          (t) =>
            !possibleTimesToInsertAfter.some(
              (x) => t < x && x < t + insertSpace
            )
        )
      ),
      currentTime
    ) + margin
  )
}
