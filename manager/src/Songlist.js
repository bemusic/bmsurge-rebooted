const _ = require('lodash')

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
  /** @type {ScoreEntry[]} */
  const scoreList = []
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
        if (entry.impressions && entry.total) {
          scoreList.push({
            songId: String(s._id),
            eventId: s.eventId,
            impressions: entry.impressions,
            total: entry.total
          })
        }
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
      weight: 1,
      ...entryInfo
    }
  })
  const weightMap = new Map()
  for (const [_eventId, scores] of Object.entries(
    _.groupBy(scoreList, s => s.eventId)
  )) {
    const rankScorer = createRankScorer(scores)
    const sortedRows = _.sortBy(
      scores.map(s => ({ scoreEntry: s, score: rankScorer(s) })),
      row => row.score
    ).reverse()
    let currentScore = Infinity
    let currentWeight = Infinity
    for (const [index, { scoreEntry, score }] of sortedRows.entries()) {
      if (score < currentScore) {
        currentScore = score
        currentWeight = Math.pow(2, 1 - (index / sortedRows.length) * 2)
      }
      weightMap.set(scoreEntry.songId, currentWeight)
    }
  }
  for (const song of songlist) {
    if (weightMap.has(song.songId)) {
      song.weight = weightMap.get(song.songId)
    }
  }
  return { updatedTimeMap, songlist }
}

/**
 * @typedef {{
 *   songId: string;
 *   eventId: string;
 *   total: number;
 *   impressions: number;
 * }} ScoreEntry
 */

/**
 * @param {ScoreEntry[]} scores
 * @returns {(entry: ScoreEntry) => number}
 */
function createRankScorer(_scores) {
  return s => s.total / s.impressions
}
