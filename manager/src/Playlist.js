/**
 * @param {import("mongodb").MongoClient} client
 * @param {any} args
 */
exports.generatePlaylist = async function generatePlaylist(client, args = {}) {
  const songsCollection = client.db().collection('songs')
  const filters = {}
  if (args.eventId) filters.eventId = String(args.eventId)
  const found = await songsCollection
    .find({ 'renderResult.uploadedAt': { $exists: true }, ...filters })
    .toArray()
  const out = []
  out.push('#EXTM3U')
  for (const song of found) {
    const chart = song.renderResult.selectedChart
    out.push(
      `#EXTINF:${Math.floor(chart.duration)},[${chart.info.genre}] ${
        chart.info.artist
      } - ${chart.info.title} #${song.eventId}`
    )
    out.push(
      `${process.env.MP3_URL_PATTERN.replace(
        '%s',
        song.renderResult.operationId
      )}`
    )
  }
  return out.join('\n')
}
