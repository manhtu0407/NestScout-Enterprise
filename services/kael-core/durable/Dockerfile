FROM rust:1.90-bookworm@sha256:3914072ca0c3b8aad871db9169a651ccfce30cf58303e5d6f2db16d1d8a7e58f AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked --bin kael-durable

FROM debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc
RUN useradd --system --uid 10001 --home-dir /var/lib/kael kael \
  && mkdir -p /var/lib/kael \
  && chown kael /var/lib/kael
COPY --from=build /src/target/release/kael-durable /usr/local/bin/kael-durable
USER kael
ENV KAEL_DURABLE_DATA_DIR=/var/lib/kael KAEL_DURABLE_BIND=0.0.0.0:8787
EXPOSE 8787
VOLUME ["/var/lib/kael"]
ENTRYPOINT ["/usr/local/bin/kael-durable"]
