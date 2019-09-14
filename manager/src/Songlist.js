/**
 * @param {import("mongodb").MongoClient} client
 */
exports.generateSonglist = async function generateSonglist(client) {
  const songs = await client
    .db()
    .collection('songs')
    .find({
      'renderResult.uploadedAt': { $exists: true },
      disabled: { $ne: true }
    })
    .toArray()
  const updatedTimeMap = new Map(songs.map(s => [String(s._id), s.renderedAt]))
  const songlist = songs.map(s => {
    const chart = s.renderResult.selectedChart
    return {
      songId: String(s._id),
      fileId: s.renderResult.operationId,
      genre: chart.info.genre,
      title: chart.info.title,
      artist: chart.info.artist,
      md5: chart.md5,
      duration: s.renderResult.wavSizeAfterTrimEnd / (44100 * 2 * 2),
      event: s.eventId,
      updatedAt: s.renderedAt
    }
  })
  return { updatedTimeMap, songlist }
}
