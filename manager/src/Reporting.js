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
      const status =
        s.renderResult && s.renderResult.uploadedAt
          ? 'done'
          : s.renderResult || s.renderError
          ? 'error'
          : 'pending'
      const selectedChart = s.renderResult && s.renderResult.selectedChart
      return {
        _id: s._id,
        eventId: s.eventId,
        addedAt: s.addedAt,
        renderedAt: s.renderedAt,
        status,
        packageFile: decodeURIComponent(s.url.split('/').pop()),
        chart: selectedChart,
        operationId: s.renderResult && s.renderResult.operationId
      }
    })
  }
}
