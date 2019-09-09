/**
 * @param {import("mongodb").MongoClient} client
 */
exports.generateReport = async function generateReport(client) {
  const songs = await client
    .db()
    .collection('songs')
    .find({})
    .toArray()
  const events = await client
    .db()
    .collection('events')
    .find({})
    .toArray()
  return {
    events,
    songs: songs.map(s => {
      const renderResult = s.renderResult
      const status =
        renderResult && renderResult.uploadedAt
          ? 'done'
          : renderResult || s.renderError
          ? 'error'
          : 'pending'
      const selectedChart = renderResult && renderResult.selectedChart
      const offset = renderResult
        ? (renderResult.wavSizeBeforeTrim -
            renderResult.wavSizeAfterTrimStart) /
            (44100 * 2 * 2) || 0
        : 0
      return {
        _id: s._id,
        eventId: s.eventId,
        addedAt: s.addedAt,
        renderedAt: s.renderedAt,
        status,
        packageFile: decodeURIComponent(s.url.split('/').pop()),
        chart: selectedChart,
        md5s: ((renderResult && renderResult.availableCharts) || []).map(
          c => c.md5
        ),
        operationId: renderResult && renderResult.operationId,
        offset: offset,
        timeRange: renderResult
          ? (() => {
              const renderEvents = renderResult.events
              return [
                renderEvents[0].time,
                renderEvents[renderEvents.length - 1].time
              ]
            })()
          : undefined
      }
    })
  }
}
