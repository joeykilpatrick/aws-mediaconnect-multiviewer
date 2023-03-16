FROM alpine:latest

RUN apk add --no-cache ffmpeg

CMD ffmpeg \
    -i ${GALAXY_SOURCE_URL} \
    -i ${SURF_SOURCE_URL} \
    -i ${TUNNEL_SOURCE_URL} \
    -i ${WAVES_SOURCE_URL} \
    -filter_complex "[0:v][1:v]hstack=inputs=2[col1]; [2:v][3:v]hstack=inputs=2[col2]; [col1][col2]vstack=inputs=2[v]" \
    -map "[v]" \
    -f mpegts \
    ${OUTPUT_URL}
