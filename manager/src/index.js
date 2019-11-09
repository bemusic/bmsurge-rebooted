// @ts-check
const { cli, logger, invariant } = require('tkt')
const fs = require('fs')
const path = require('path')
const { MongoClient, ObjectID } = require('mongodb')
const Bluebird = require('bluebird')
const axios = require('axios').default
const uuidv4 = require('uuid/v4')
const { generateReport } = require('./Reporting')
const { generatePlaylist } = require('./Playlist')
const { generateSonglist } = require('./Songlist')

require('dotenv').config()
cli()
  .command(
    'import <file>',
    'Adds files to be processed',
    {
      file: {
        desc: 'JSON file of URLs, filename should be *.urls.json',
        type: 'string'
      },
      f: {
        desc: 'Apply the changes',
        type: 'boolean'
      }
    },
    async args => {
      const eventId = path.basename(args.file, '.urls.json')
      invariant(
        eventId.match(/^[a-z0-9]+$/),
        'Event ID must be an alphanumeric string; received: %s',
        eventId
      )
      const log = logger('import')
      const operations = JSON.parse(fs.readFileSync(args.file, 'utf8')).map(
        url => ({
          updateOne: {
            filter: { url },
            update: {
              $setOnInsert: { url, eventId: eventId, addedAt: new Date() }
            },
            upsert: true
          }
        })
      )
      log.info({ docs: operations }, 'Calculated operations to perform...')
      if (args.f) {
        const client = await connectToMongoDB()
        try {
          const result = await client
            .db()
            .collection('songs')
            .bulkWrite(operations)
          log.info({ result }, 'Bulk operation completed!')
        } finally {
          client.close()
        }
      }
    }
  )
  .command(
    'work',
    'Invokes the worker to process BMS archives',
    {
      retry: { type: 'boolean', desc: 'Retry previously failed archives' },
      force: { type: 'boolean', desc: 'Actually work', alias: ['f'] },
      eventId: { type: 'string', desc: 'Filter by event', alias: ['e'] }
    },
    async args => {
      const log = logger('work')
      const client = await connectToMongoDB()
      try {
        const songsCollection = client.db().collection('songs')
        const filter = args.eventId
          ? { eventId: args.eventId }
          : {}
        const found = await songsCollection
          .find({
            ...filter,
            ...args.retry
              ? { 'renderResult.uploadedAt': { $exists: false } }
              : { renderedAt: { $exists: false } }
          })
          .toArray()
        log.info('Found %s songs to work on.', found.length)
        if (!args.force) return
        await Bluebird.map(
          found,
          async song => {
            // @ts-ignore
            const operationId = uuidv4()
            const songLog = log.child(`${song._id}`)
            songLog.info('Start operation "%s"', operationId)
            try {
              const response = await axios.put(
                `${process.env.WORKER_URL}/renders/${operationId}`,
                { url: song.url },
                {
                  timeout: 900e3,
                  responseType: 'text',
                  transformResponse: undefined
                }
              )
              songLog.info('Operation "%s" finished', operationId)
              const result = JSON.parse(
                response.data
                  .split('\n')
                  .filter(r => r.trim())
                  .pop()
              )
              await songsCollection.updateOne(
                { _id: song._id },
                {
                  $set: {
                    renderResult: result,
                    renderedAt: new Date()
                  }
                }
              )
            } catch (error) {
              songLog.error({ err: error }, 'Cannot render!')
              await songsCollection.updateOne(
                { _id: song._id },
                {
                  $set: {
                    renderError:
                      String(error && error.stack) +
                      (error.response
                        ? `\nResponse: ${error.response.data}`
                        : ''),
                    renderedAt: new Date()
                  }
                }
              )
            }
          },
          { concurrency: 128 }
        )
      } finally {
        client.close()
      }
    }
  )
  .command(
    'playlist',
    'Prints the URLs of the songs as an M3U playlist',
    {
      eventId: { type: 'string', alias: ['e'], description: 'Filter by event' }
    },
    async args => {
      const client = await connectToMongoDB()
      try {
        console.log(await generatePlaylist(client, args))
      } finally {
        client.close()
      }
    }
  )
  .command('report', 'Generates a report', {}, async args => {
    const client = await connectToMongoDB()
    try {
      const report = await generateReport(client, args)
      console.log(JSON.stringify(report, null, 2))
    } finally {
      client.close()
    }
  })
  .command(
    'songlist',
    'Exports or updates the songlist',
    {
      output: { alias: ['o'], type: 'string' },
      update: { alias: ['u'], type: 'boolean' },
      index: { type: 'string' }
    },
    async args => {
      const indexTime = args.index
      const indexDate = new Date(indexTime)
      if (indexTime && !+indexDate) {
        throw new Error(
          'Invalid index time specified (e.g. date cannot be parsed)'
        )
      }
      const log = logger('songlist')
      const client = await connectToMongoDB()
      try {
        const { songlist, updatedTimeMap } = await generateSonglist(client)
        log.info('Found %s songs', songlist.length)
        if (args.output) {
          const json = Buffer.from(
            '[' +
              songlist.map(s => '\n  ' + JSON.stringify(s)).join(',') +
              '\n]'
          )
          fs.writeFileSync(args.output, json)
          log.info('Saved to "%s" (%s bytes)', args.output, json.length)
        }
        if (args.update) {
          const response = await axios.put(
            `${process.env.SONG_UPDATER_URL}/updateSongDatabase`,
            songlist
          )
          log.info({ responseData: response.data }, 'Songlist updated on DJ')
        }
        if (args.index) {
          const filteredSonglist = songlist.filter(
            s => +updatedTimeMap.get(s.songId) >= +indexDate
          )
          log.info('Indexing %s songs', filteredSonglist.length)
          const response2 = await axios.patch(
            `${process.env.MUSIC_REQUEST_URL}/songlist`,
            filteredSonglist
          )
          log.info(
            { responseData: response2.data },
            'Songlist updated on music request'
          )
        }
      } finally {
        client.close()
      }
    }
  )
  .command(
    'disable <id> <reason>',
    'Disables a song',
    {
      id: { type: 'string', desc: 'Song ID' },
      reason: { type: 'string', desc: 'Reason for disabling' }
    },
    async args => {
      const log = logger('work')
      const client = await connectToMongoDB()
      try {
        const songsCollection = client.db().collection('songs')
        await songsCollection.updateOne(
          { _id: new ObjectID(args.id) },
          {
            $set: {
              disabled: true,
              disableReason: args.reason,
              disabldAt: new Date()
            }
          }
        )
      } finally {
        client.close()
      }
    }
  )
  .command('server', 'Runs a server', {}, async args => {
    const client = await connectToMongoDB()
    const express = require('express')
    const app = express()
    app.use(express.static(__dirname + '/../static'))
    app.use(require('compression')())
    app.use(require('body-parser').json())
    app.patch('/entry-mapping', async (req, res, next) => {
      try {
        const operations = req.body.mappings.map(mapping => ({
          updateOne: {
            filter: { _id: new ObjectID(mapping.songId) },
            update: { $set: { entryId: String(mapping.entryId) } },
            upsert: false
          }
        }))
        const result = await client
          .db()
          .collection('songs')
          .bulkWrite(operations)
        res.json(result)
      } catch (e) {
        next(e)
      }
    })
    app.get('/report.json', async (req, res, next) => {
      try {
        const report = await generateReport(client, req.query)
        res.json(report)
      } catch (e) {
        next(e)
      }
    })
    app.get('/playlist.m3u', async (req, res, next) => {
      try {
        res.set('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8')
        res.send(await generatePlaylist(client, req.query))
      } catch (e) {
        next(e)
      }
    })
    app.listen(+process.env.PORT || 8080)
  })
  .parse()

async function connectToMongoDB() {
  const log = logger('mongodb')
  log.info('Connecting to MongoDB...')
  const client = new MongoClient(
    process.env.MONGO_URL ||
      invariant(false, 'Missing environment variable: MONGO_URL')
  )
  await client.connect()
  log.info('Connected to MongoDB!')
  return client
}
