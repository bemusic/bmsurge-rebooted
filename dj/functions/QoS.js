function getTimeToEnqueue(
  currentTime,
  requestedTimes,
  { margin = 600e3, insertSpace = 960e3 } = {}
) {
  const possibleTimesToInsertAfter = [currentTime, ...requestedTimes]
  return (
    Math.max(
      Math.min(
        ...possibleTimesToInsertAfter.filter(
          t =>
            !possibleTimesToInsertAfter.some(x => t < x && x < t + insertSpace)
        )
      ),
      currentTime
    ) + margin
  )
}

exports.getTimeToEnqueue = getTimeToEnqueue
