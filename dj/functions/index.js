const functions = require('firebase-functions')
const admin = require('firebase-admin')
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
  const random = Math.floor(Math.random() * songlist.length)
  const song = songlist[random]
  response.status(200).json({
    url: `${functions.config().mp3.urlpattern.replace('%s', song.fileId)}`,
    streamTitle: `[${song.genre}] ${song.artist} - ${song.title} [#${song.event}]`,
    info: { song }
  })
})

exports.putSong = functions.https.onRequest(async (request, response) => {
  if (!isAuthenticated(request)) {
    response.status(401).send('Unauthorized')
    return
  }
  console.log('Request body =>', request.body)
  await admin
    .database()
    .ref('station')
    .update({
      title: request.body.info.song.title || null,
      artist: request.body.info.song.artist || null,
      genre: request.body.info.song.genre || null,
      event: request.body.info.song.event || null,
      duration: request.body.info.song.duration || null,
      md5: request.body.info.song.md5 || null,
      set: request.body.info.song.event || null
    })
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
