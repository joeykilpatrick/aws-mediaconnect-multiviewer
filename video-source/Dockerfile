FROM alpine:latest

COPY . .

RUN apk add --no-cache ffmpeg

CMD ffmpeg -stream_loop -1 -i ${VIDEO}.mp4 -f mpegts ${TARGET_URL}