# bmsurge-rebooted

The scripts and infrastructures that are used to operate the
[Be-Music Surge](https://be-music.surge.sh) non-stop BMS radio station.

## About the reboot

Be-Music Surge was previously unmaintained for 2 years. The reason that I got
unmotivated to maintain the radio station is because it took me a lot of time
and effort to process a BMS event for inclusion in the radio station. For
example, it took about 2 minutes to render a single BMS archive. That means
processing a big event means I need to run it overnight, while processing a
smaller event can still takes hours, which is not practical to do often. Also, I
originally built Be-Music Surge by stringing many tools together. For example,
music is being streamed by the [Music Player Daemon](https://www.musicpd.org)
which maintains its own music database. Getting it to play songs the way I want
means writing even more code to synchronize between the file storage, MPD’s song
database, and the station’s own database.

Fast-forward for two years, we now have
[Google Cloud Run](https://cloud.google.com/run/) which lets me run compute
tasks (such as rendering the BMS archive to MP3) on Google’s cloud
infrastructures. The most important feature is that I can run hundreds of tasks
simultaneously and get billed by the number of seconds I’m using the service.
With this, now I can render 100 hours of music, and I only have to wait for 20
minutes!

I also built [shouter](https://github.com/bemusic/shouter), a simple application
that requests the next song to play via a JSON-based HTTP endpoint, and then
streams that song to the Icecast server. It doesn’t maintain any database. Due
to this decoupled nature, the shouter client, the song files, the song database,
and the code that manages the playlist can all be run on different providers for
most ease-of-use and cost-effectiveness.

- The shouter client runs on the same
  [DigitalOcean (referral link)](https://m.do.co/c/302d31171899) machine that
  runs Icecast. That machine doesn’t have enough storage space to store all the
  songs, though.

- The music files are stored in
  [Google Cloud Storage](https://cloud.google.com/storage/). Tasks running on
  Cloud Run can write to Cloud Storage without hassle, making it the ideal
  storage target. However, the bandwidth cost is expensive. Therefore, the
  storage contents is mirrored to [Feral Hosting](https://www.feralhosting.com)
  to save bandwidth costs.

- The song database is hosted on
  [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) which has a free tier.
  This means I don’t have to manage a database server myself.

- The playlist management code is run on
  [Cloud Functions for Firebase](https://firebase.google.com/docs/functions), so
  that I don’t have to manage or deploy any server here. This also makes it very
  easy for me to deploy and update the playlist management code by just running
  `firebase deploy`.

## Components

### song database

The song database runs on MongoDB.

### song storage

The rendered song files are stored on Google Cloud Storage.

### [worker](worker)

A service on Cloud Run that downloads a BMS archive from a URL, renders it into
MP3, and uploads it to Google Cloud Storage.

### [manager](manager)

Manages the song database and invokes the worker when new BMS songs need to be
processed.
