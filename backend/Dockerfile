FROM golang:1.26-alpine AS build

WORKDIR /src/backend

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/aurora-server ./cmd/server \
    && mkdir -p /out/data/exam-exports

FROM gcr.io/distroless/base-debian12:nonroot

WORKDIR /app
ENV EXAM_EXPORT_DIR=/app/data/exam-exports

COPY --from=build /out/aurora-server /app/aurora-server
COPY --from=build --chown=nonroot:nonroot /out/data /app/data

USER nonroot:nonroot
ENTRYPOINT ["/app/aurora-server"]
