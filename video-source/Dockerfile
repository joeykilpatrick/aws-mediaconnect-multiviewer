FROM alpine:latest

COPY . .

RUN apk add --no-cache ffmpeg

CMD ffmpeg -re -loop 1 -i solid-color-${COLOR}.png -f mpegts ${TARGET_URL}