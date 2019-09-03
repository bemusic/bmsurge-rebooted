# bmsurge-renderer

The scripts and infrastructures that are used to render the MP3 file for the Be-Music Surge radio station.

## song database

The song database runs on MongoDB.

## song storage

The rendered song files are stored on Google Cloud Storage.

## [worker](worker)

A service on Cloud Run that downloads a BMS archive from a URL,
renders it into MP3, and uploads it to Google Cloud Storage.

## [manager](manager)

Manages the song database and invokes the worker when new BMS songs need to be processed.
