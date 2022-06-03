# bmsurge-rebooted/streamer

The set up that should be run on a box that produces the stream.

## Configuration

### `private/credentials/bmsurge.service-account.json`

The Firebase service account key file.

### `private/dj.env`

```
API_KEY=
FIREBASE_BUCKET=
FIREBASE_DATABASE_URL=
MP3_URL_PATTERN=
```

### `private/icecast.env`

```
ICECAST_SOURCE_PASSWORD=
ICECAST_ADMIN_PASSWORD=
ICECAST_PASSWORD=
ICECAST_RELAY_PASSWORD=
```

### `private/shouter.env`

```
SHOUTER_PASSWORD=$ICECAST_SOURCE_PASSWORD
SHOUTER_GET_SONG_URL=http://api:$API_KEY@dj:57263/getSong
SHOUTER_PUT_SONG_URL=http://api:$API_KEY@dj:57263/Song
```
