# bmsurge-renderer/manager

## Environment variables configuration

```
# .env
MONGO_URL=mongodb+srv://<user>:<password>@<host>/<db>
WORKER_URL=https://<domain>.run.app
MP3_URL_PATTERN=https://<domain>/<path>/%s.mp3
```

## Install dependencies

```
yarn
```

## Importing URLs

Create a file containing list URLs to the BMS packages to render, name it as
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

The above command will do a dry run. To confirm the changes, add `-f`.
