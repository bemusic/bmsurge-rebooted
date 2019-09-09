# bmsurge-renderer/manager

## Environment variables configuration

```
# .env
MONGO_URL=mongodb+srv://<user>:<password>@<host>/<db>
WORKER_URL=https://<domain>.run.app
MP3_URL_PATTERN=https://<domain>/<path>/%s.mp3
SONG_UPDATER_URL=https://<user>:<password>@us-central1-be-music-surge-frontend.cloudfunctions.net
```

## Install dependencies

```
yarn
```

## Preparing a BMS event for rendering

Create a ZIP file for each song in the event. The ZIP file should meet the
following requirements:

1. Filenames must be encoded in UTF-8.

2. Files must reside at the root of the ZIP file. They may not be inside a
   directory.

Upload all the ZIP files to a web server where it can be downloaded by the
[worker](../worker).

## Importing URLs

Create a file containing list URLs to the ZIP files to render, name it as
`<eventId>.urls.json`. For example, `g2r2018.urls.json` may look like this:

```json
[
  "https://<url>/%21%21%21%21%21%21%21%21KANPAI%21%21%21%21%21%21OGG%E3%81%A0%E3%81%9E.zip",
  "https://<url>/%21littlegirl_complex.zip",
  "https://<url>/%28U.F.M.%29.zip",
  "https://<url>/03_twinkle_memories_001.zip",
  "https://<url>/5-Acht-Omegatische_Liebe.zip",
  "https://<url>/5192296858534827628530496329220096.zip",
  "https://<url>/6-LU-zemerim.zip",
  "https://<url>/7ost%20chapt3r%20ogg.zip",
  "https://<url>/8-lu_remixed_by_kju8-My_CAKES_AND_ALE.zip",
  "..."
]
```

Then, import the URLs into the database using:

```
node src/index.js import <path/to/event>.urls.json
```

The above command will do a dry run. To confirm the changes, add `-f`. This will
import the songs into the MongoDB database.

## Render the BMS songs to MP3

```
node src/index.js work
```

This will read from the database to find all songs that need to be rendered,
then it will invoke the [worker](../worker) service that has been deployed to
Google Cloud Run. Thanks to Google Cloud Run, we can render hundreds of songs
simultaneously. From my test 1,000 songs can be rendered in less than 30
minutes!

## Update the songlist on downstream services

```
node src/index.js songlist -o private/_songlist.json --update --index=YYYY-MM-DDT00:00:00Z
```

This will read from the database to find all songs that have been rendered
successfully, and generate a songlist.

- `-o` saves the generated songlist to a JSON file.
- `--update` uploads the songlist to the [dj](../dj/) system, which allows the
  song to be streamed on the station.
- `--index` uploads the songlist to the
  [song request system](https://github.com/bemusic/bmsurge-music-request)’s
  search index. Due to Algolia’s limits, we can’t upload the full songlist; we
  must upload only the changes to stay within the free operations limit. Send in
  a timestamp to specify the minimum update time to index.

## Web-based dashboard (unused)

```
env PORT=8082 node src/index.js server
```

This will start a web server that displays the dashboard.
