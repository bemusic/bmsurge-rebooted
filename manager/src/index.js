// @ts-check
const { cli, logger, invariant } = require('tkt')
const fs = require('fs')
require('dotenv').config()
const { ObjectId, MongoClient } = require('mongodb')

cli()
  .command(
    'import <eventId> <file>',
    'Adds files to be processed',
    {
      eventId: {
        desc: 'Event ID',
        type: 'string'
      },
      file: {
        desc: 'JSON file of URLs',
        type: 'string'
      },
      f: {
        desc: 'Apply the changes',
        type: 'boolean'
      }
    },
    async args => {
      const log = logger('import')
      const operations = JSON.parse(fs.readFileSync(args.file, 'utf8')).map(
        url => ({
          updateOne: {
            filter: { url },
            update: {
              $setOnInsert: { url, eventId: args.eventId, addedAt: new Date() }
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
