// @ts-check
const zlib = require('zlib')
const functions = require('firebase-functions')
const admin = require('firebase-admin')
const _ = require('lodash')
const QoS = require('./QoS')
const { createWeightedIndexer } = require('./Weighter')

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
      .storage()
      .bucket()
      .file('songlist.json.gz')
      .download()
      .then(([contents]) => JSON.parse(String(zlib.unzipSync(contents))))
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
  const requestTime = r =>
    Math.min(...Object.values((r && r.requesters) || {})) || 0
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
    .sortBy(a => requestTime(requests[a]))
    .sortBy(a => -requestCount(requests[a]))
    .filter(k => !recentlyPlayed.has(k))
    .value()[0]
  const getIndex = createWeightedIndexer(songlist.map(s => s.weight || 1))
  const random = getIndex(Math.random())
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
  const info = {
    song,
    requested,
    requesters:
      (requested &&
        requests[song.songId] &&
        requests[song.songId].requesters) ||
      null
  }
  await admin
    .database()
    .ref('station/next')
    .update(getPublicSongPayload(info))
  response.status(200).json({
    url: `${functions.config().mp3.urlpattern.replace('%s', song.fileId)}`,
    streamTitle: `[${song.genre}] ${song.artist} - ${song.title} [#${song.event}]`,
    info
  })
})

function getPublicSongPayload(info) {
  return {
    songId: info.song.songId || null,
    title: info.song.title || null,
    artist: info.song.artist || null,
    genre: info.song.genre || null,
    event: info.song.event || null,
    duration: info.song.duration || null,
    md5: info.song.md5 || null,
    set: info.song.event || null,
    requested: info.requested || false,
    requesters: info.requesters || null,
    eventTitle: info.eventTitle || null,
    eventUrl: info.eventUrl || null,
    entryId: info.entryId || null,
    entryUrl: info.entryUrl || null
  }
}

exports.putSong = functions.https.onRequest(async (request, response) => {
  if (!isAuthenticated(request)) {
    response.status(401).send('Unauthorized')
    return
  }
  console.log('Request body =>', request.body)
  const songPayload = {
    playedAt: Date.now(),
    ...getPublicSongPayload(request.body.info)
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
    const songlist = []
    for (const song of request.body) {
      songs[song.songId] = song
      songlist.push(song)
    }
    await admin
      .database()
      .ref('songs')
      .set(songs)
    await admin
      .storage()
      .bucket()
      .file('songlist.json')
      .save(JSON.stringify(songlist), { resumable: false })
    await admin
      .storage()
      .bucket()
      .file('songlist.json.gz')
      .save(
        zlib.gzipSync(Buffer.from(JSON.stringify(songlist)), { level: 9 }),
        { resumable: false }
      )
    response.status(200).send('OK!')
  }
)

/**
 * @param {string} userId
 * @param {string} username
 * @param {string} songId
 * @param {string} query
 */
async function requestSong(userId, username, songId, query) {
  const userIdHash = hashUserId(userId)
  const s = (await admin
    .database()
    .ref('songs')
    .child(songId)
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
    const originalRequestTime = Date.now()
    const requestedTimes = []
    const allRequestedTimes = []
    allRequestsSnapshot.forEach(request => {
      request.child('requesters').forEach(requester => {
        if (requester.key === userIdHash) {
          activeRequests++
          requestedTimes.push(requester.val())
        }
        allRequestedTimes.push(requester.val())
      })
    })
    const requestTime = QoS.getTimeToEnqueue(
      originalRequestTime,
      requestedTimes,
      { allRequestedTimes }
    )
    if (requestTime > originalRequestTime) {
      console.log(
        'Request time shifted by',
        requestTime - originalRequestTime,
        'ms due to QOS'
      )
    }
    if (activeRequests >= 20) {
      return {
        text:
          `You already reached a maximum limit of 20 active song requests. ` +
          `Please wait for your requested song to be played first before retrying the request.`,
        queued: false
      }
    }
    await requestRef
      .child('requesters')
      .child(userIdHash)
      .set(requestTime)
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
        userId: userId,
        username: username,
        songId: s.songId,
        songText: songText,
        query: query,
        requestedAt: admin.database.ServerValue.TIMESTAMP,
        queuedTime: requestTime
      })
    return {
      text: `Requested: ${songText}`,
      queued: true
    }
  } else {
    return {
      text: `Sorry, didn’t find the song you requested...`,
      queued: false
    }
  }
}

exports.requests = functions.https.onRequest(async (request, response) => {
  if (!isAuthenticated(request)) {
    response.status(401).send('Unauthorized')
    return
  }
  const username = request.body.username
  const songId = request.body.songId
  const userId = request.body.userId
  const query = request.body.content
  console.log('Request body =>', request.body)
  const result = await requestSong(userId, username, songId, query)
  response.status(200).json(result)
})

exports.requestFromWeb = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'The function must be called while authenticated.'
    )
  }
  console.log('AUTH', context.auth)
  console.log('AUTH TOKEN', context.auth.token)
  const username = context.auth.token.displayName
  const userId = context.auth.uid
  const songId = String(data.songId)
  const query = String(data.query)
  const result = await requestSong(userId, username, songId, query)
  return result
})

exports.token = functions.https.onRequest(async (request, response) => {
  if (!isAuthenticated(request)) {
    response.status(401).send('Unauthorized')
    return
  }
  const userId = request.body.userId
  const username = request.body.username
  const token = await admin.auth().createCustomToken(userId, {
    displayName: username,
    userIdHash: hashUserId(userId)
  })
  response.status(200).json({ token })
})

exports.reactions = functions.https.onRequest(async (request, response) => {
  if (!isAuthenticated(request)) {
    response.status(401).send('Unauthorized')
    return
  }
  const userId = request.body.userId
  const username = request.body.username
  const ref = admin
    .database()
    .ref('reactions')
    .child(userId)
    .child(request.body.songId)
    .child(request.body.emoji)
    .child(request.body.messageId)
    .set(
      request.body.action === 'add'
        ? admin.database.ServerValue.TIMESTAMP
        : null
    )
  response.status(200).json({ ok: true })
})

function hashUserId(userId) {
  return require('crypto')
    .createHash('md5')
    .update(userId)
    .digest('hex')
}
