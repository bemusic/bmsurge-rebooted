const functions = require('firebase-functions')
const admin = require('firebase-admin')
const _ = require('lodash')

admin.initializeApp()

function isAuthenticated(request) {
  const expectedApiKey = functions.config().api.key
  const expectedAuth = `Basic ${Buffer.from(`api:${expectedApiKey}`).toString(
    'base64'
  )}`
  return request.headers.authorization === expectedAuth
}

let songlistCache

function getSonglist() {
  if (songlistCache) {
    if (Date.now() > songlistCache.expiresAt) {
      songlistCache = null
    } else {
      return songlistCache.promise
    }
  }
  songlistCache = {
    promise: admin
      .database()
      .ref('songs')
      .once('value')
      .then(snapshot => Object.values(snapshot.val()))
      .catch(e => {
        songlistCache = null
        throw e
      }),
    expiresAt: Date.now() + 300e3
  }
  return songlistCache.promise
}

exports.getSong = functions.https.onRequest(async (request, response) => {
  if (!isAuthenticated(request)) {
    response.status(401).send('Unauthorized')
    return
  }

  const songlist = await getSonglist()
  const requestCount = r => Object.keys((r && r.requesters) || {}).length
  const requestTime = r => Math.min(...Object.values((r && r.requesters) || {})) || 0
  const requests =
    (await admin
      .database()
      .ref('requests')
      .once('value')).val() || {}
  const recentlyPlayed = new Set(
    Object.values(
      (await admin
        .database()
        .ref('station/history')
        .once('value')).val() || {}
    ).map(h => h.songId)
  )
  const fulfillableRequest = _(Object.keys(requests))
    .sortBy((a) => requestTime(requests[a]))
    .sortBy((a) => -requestCount(requests[a]))
    .filter(k => !recentlyPlayed.has(k))
    .value()[0]
  const random = Math.floor(Math.random() * songlist.length)
  const song =
    (fulfillableRequest &&
      songlist.filter(s => s.songId === fulfillableRequest)[0]) ||
    songlist[random]
  const requested = !!fulfillableRequest && song.songId === fulfillableRequest
  if (requested) {
    await admin
      .database()
      .ref('requests')
      .child(fulfillableRequest)
      .set(null)
  }
  response.status(200).json({
    url: `${functions.config().mp3.urlpattern.replace('%s', song.fileId)}`,
    streamTitle: `[${song.genre}] ${song.artist} - ${song.title} [#${song.event}]`,
    info: { song, requested }
  })
})

exports.putSong = functions.https.onRequest(async (request, response) => {
  if (!isAuthenticated(request)) {
    response.status(401).send('Unauthorized')
    return
  }
  console.log('Request body =>', request.body)
  const songPayload = {
    playedAt: Date.now(),
    songId: request.body.info.song.songId || null,
    title: request.body.info.song.title || null,
    artist: request.body.info.song.artist || null,
    genre: request.body.info.song.genre || null,
    event: request.body.info.song.event || null,
    duration: request.body.info.song.duration || null,
    md5: request.body.info.song.md5 || null,
    set: request.body.info.song.event || null,
    requested: request.body.info.requested || false
  }
  await admin
    .database()
    .ref('station')
    .update(songPayload)

  const historyRef = admin.database().ref('station/history')

  // Add new entry to history
  await admin
    .database()
    .ref('station/history')
    .push(songPayload)

  // Prune old history
  // https://stackoverflow.com/a/32012520/559913
  const snapshot = await historyRef
    .orderByChild('playedAt')
    .endAt(Date.now() - 3600e3)
    .once('value')
  const updates = {}
  snapshot.forEach(function(child) {
    updates[child.key] = null
  })
  await historyRef.update(updates)

  response.status(200).send('Done!')
})

exports.updateSongDatabase = functions.https.onRequest(
  async (request, response) => {
    if (!isAuthenticated(request)) {
      response.status(401).send('Unauthorized')
      return
    }
    const songs = {}
    for (const song of request.body) {
      songs[song.songId] = song
    }
    await admin
      .database()
      .ref('songs')
      .set(songs)
    response.status(200).send('OK!')
  }
)

exports.requests = functions.https.onRequest(async (request, response) => {
  if (!isAuthenticated(request)) {
    response.status(401).send('Unauthorized')
    return
  }
  const userId = request.body.userId
  const userIdHash = require('crypto').createHash('md5').update(userId).digest('hex')
  console.log('Request body =>', request.body)
  const s = (await admin
    .database()
    .ref('songs')
    .child(request.body.songId)
    .once('value')).val()
  if (s) {
    const requestRef = admin
      .database()
      .ref('requests')
      .child(s.songId)
    const allRequestsSnapshot = await admin
      .database()
      .ref('requests')
      .once('value')
    let activeRequests = 0
    allRequestsSnapshot.forEach(child => {
      activeRequests += Object.keys(child.child('requesters').val() || {}).filter(r => r === userIdHash).length
    })
    if (activeRequests >= 10) {
      response
        .status(200)
        .json({
          text: `You already reached a maximum limit of 10 active song requests. ` +
            `Please wait for your requested song to be played first before retrying the request.`,
          queued: false,
        })
      return
    }
    await requestRef
      .child('requesters')
      .child(userIdHash)
      .set(admin.database.ServerValue.TIMESTAMP)
    await requestRef.child('info').set({
      genre: s.genre,
      artist: s.artist,
      title: s.title,
      event: s.event
    })
    const songText = `[${s.genre}] ${s.artist} - ${s.title} [#${s.event}]`
    await admin
      .database()
      .ref('logs/requests')
      .push({
        userId: request.body.userId,
        username: request.body.username,
        songId: s.songId,
        songText: songText,
        query: request.body.content,
        requestedAt: admin.database.ServerValue.TIMESTAMP,
      })
    response
      .status(200)
      .json({
        text: `Requested: ${songText}`,
        queued: true,
      })
  } else {
    response.status(200).send(`Sorry, didn’t find the song you requested...`)
  }
})
