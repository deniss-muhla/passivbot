FROM nvidia/cuda:12.6.2-devel-ubuntu20.04

WORKDIR /usr/src/passivbot

COPY requirements.txt ./
COPY passivbot-rust/Cargo.toml passivbot-rust/Cargo.lock ./passivbot-rust/
COPY passivbot-rust/src ./passivbot-rust/src/

RUN apt-get update && apt-get install -y \
    git \
    curl \
    build-essential \
    libssl-dev \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    && rm -rf /var/lib/apt/lists/* \
    && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
    && . $HOME/.cargo/env \
    && rustup install stable \
    && rustup default stable

ENV PATH="/root/.cargo/bin:${PATH}"

# RUN python3 -m venv /opt/venv
# ENV PATH="/opt/venv/bin:$PATH"

RUN pip install setuptools-rust wheel maturin jupyterlab

RUN pip install --no-cache-dir -r requirements.txt

WORKDIR /usr/src/passivbot/passivbot-rust

#RUN maturin develop --release
RUN maturin build --release \
    && pip install target/wheels/passivbot_rust-*.whl

WORKDIR /usr/src/passivbot
