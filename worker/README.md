# bmsurge-renderer/worker

## Environment variables configuration

```
# .env
GOOGLE_APPLICATION_CREDENTIALS=/data/private/<service-account>.json
BMSURGE_RENDER_OUTPUT_BUCKET=<gcs-bucket-name>
BMSURGE_WORKER_GCR_REPOSITORY=gcr.io/<gcp-project>/<repo-name>
```

## Build Docker image

```
./scripts/build
```

## Try out locally

The `./script/run` shell script will mount the `src` directory into the
container, so that you don't need to rebuild the container everytime.

### Rendering process

```
./scripts/run render https://.../yamajet_is_sugoi.zip -o /data/output/foon.mp3
```

This will download the package and renders an MP3 file. After running this, you
will find the MP3 file at `./tmp/output/foon.mp3`. Metadata about the rendering
process is printed out to the console.

### Server

To test the server locally, you need to put a service account file into
`./private` directory and reference it inside `.env` file using the
`GOOGLE_APPLICATION_CREDENTIALS` environment variable.

The service account used needs to have access to the Google Cloud Storage bucket
named by the `BMSURGE_RENDER_OUTPUT_BUCKET` environment variable.

```
./scripts/run server
```

This will start a server on port 4567. Invoke it using httpie:

```
http -S --timeout=900 put http://localhost:4567/renders/00000000-0000-0000-0000-000000000000 url='https://.../yamajet_is_sugoi.zip'
```

The MP3 file shall appear at
`gs://<bucket>/00000000-0000-0000-0000-000000000000.mp3`

## Build and push Docker image to GCR

```
./scripts/push
```

## Deployment

See: <https://cloud.google.com/run/docs/deploying>

- Set memory limit to 2048 MB.
- Set request timeout to 900 seconds.
- Required environment variables:
  - `BMSURGE_RENDER_OUTPUT_BUCKET`
- Allow the service account to access the Google Cloud Storage bucket.
