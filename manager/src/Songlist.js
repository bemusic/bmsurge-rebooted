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
  const eventMap = new Map(
    (await client
      .db()
      .collection('events')
      .find({})
      .toArray()).map(e => [
      e._id,
      {
        ...e,
        entryMap: new Map((e.entries || []).map(n => [n.entryId, n]))
      }
    ])
  )
  const updatedTimeMap = new Map(songs.map(s => [String(s._id), s.renderedAt]))
  const songlist = songs.map(s => {
    const chart = s.renderResult.selectedChart
    const entryInfo = {}
    const event = eventMap.get(s.eventId)
    if (event) {
      entryInfo.eventTitle = event.title
      entryInfo.eventUrl = event.url
      const entry = s.entryId && event.entryMap.get(s.entryId)
      if (entry) {
        entryInfo.entryId = s.entryId
        entryInfo.entryUrl = entry.url
      }
    }
    return {
      songId: String(s._id),
      fileId: s.renderResult.operationId,
      genre: chart.info.genre,
      title: chart.info.title,
      artist: chart.info.artist,
      md5: chart.md5,
      duration: s.renderResult.wavSizeAfterTrimEnd / (44100 * 2 * 2),
      event: s.eventId,
      updatedAt: s.renderedAt,
      ...entryInfo
    }
  })
  return { updatedTimeMap, songlist }
}
