/**
 * @param {import("mongodb").MongoClient} client
 * @param {any} args
 */
exports.generatePlaylist = async function generatePlaylist(client, args = {}) {
  const songsCollection = client.db().collection('songs')
  const filters = {}
  if (args.eventId) filters.eventId = String(args.eventId)
  const found = await songsCollection
    .find({
      'renderResult.uploadedAt': { $exists: true },
      disabled: { $ne: true },
      ...filters,
    })
    .toArray()
  const out = []
  out.push('#EXTM3U')
  found.sort((a, b) => (a.entryId || 9999) - (b.entryId || 9999))
  for (const song of found) {
    const chart = song.renderResult.selectedChart
    const entryPrefix = song.entryId ? `${song.entryId}. ` : ''
    out.push(
      `#EXTINF:${Math.floor(chart.duration)},${entryPrefix}[${
        chart.info.genre
      }] ${chart.info.artist} - ${chart.info.title} #${song.eventId}`
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
