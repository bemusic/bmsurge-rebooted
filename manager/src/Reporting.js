/**
 * @param {import("mongodb").MongoClient} client
 * @param {any} args
 */
exports.generateReport = async function generateReport(client, args) {
  const songFilters = {}
  const eventFilters = {}
  if (args.eventId) {
    songFilters.eventId = eventFilters._id = String(args.eventId)
  }
  songFilters.disabled = { $ne: true }
  const songs = await client
    .db()
    .collection('songs')
    .find(songFilters)
    .toArray()
  const events = await client
    .db()
    .collection('events')
    .find(eventFilters)
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
        entryId: s.entryId,
        addedAt: s.addedAt,
        renderedAt: s.renderedAt,
        status,
        duration: renderResult
          ? renderResult.wavSizeAfterTrimEnd / (44100 * 2 * 2)
          : null,
        packageFile: decodeURIComponent(s.url.split('/').pop()),
        selectedChart: selectedChart,
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
