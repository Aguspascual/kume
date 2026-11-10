FROM golang:1.27-alpine AS build

WORKDIR /src
RUN apk add --no-cache ca-certificates

COPY go.mod ./
RUN go mod download

COPY . ./
RUN CGO_ENABLED=0 GOOS=linux go build -mod=mod -trimpath -buildvcs=false -ldflags="-s -w" -o /out/api ./cmd/api

FROM scratch

COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build --chown=65532:65532 /out/api /api

USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/api"]
