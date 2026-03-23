FROM heroiclabs/nakama-pluginbuilder:3.22.0 AS builder

WORKDIR /backend
COPY go.mod go.sum ./
RUN go mod download

COPY modules/ ./modules/
RUN go build -buildmode=plugin -trimpath -o ./tictactoe.so ./modules/

FROM registry.heroiclabs.com/heroiclabs/nakama:3.22.0
COPY --from=builder /backend/tictactoe.so /nakama/data/modules/tictactoe.so
