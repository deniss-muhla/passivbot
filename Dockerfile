FROM python:3.8.20-slim

WORKDIR /usr/src/passivbot

COPY requirements.txt ./
COPY setup.py ./

RUN apt-get update && apt-get install -y \
    git \
    curl \
    build-essential \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/* \
    && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
    && . $HOME/.cargo/env \
    && rustup install stable \
    && rustup default stable

ENV PATH="/root/.cargo/bin:${PATH}"

RUN pip install --upgrade pip
RUN pip install setuptools-rust wheel maturin jupyterlab

RUN pip install --no-cache-dir -r requirements.txt

COPY passivbot-rust/src/ ./passivbot-rust/src/
COPY passivbot-rust/Cargo.lock ./passivbot-rust/Cargo.lock
COPY passivbot-rust/Cargo.toml ./passivbot-rust/Cargo.toml

WORKDIR /usr/src/passivbot/passivbot-rust

RUN maturin build --release

RUN pip install target/wheels/passivbot_rust-*.whl

WORKDIR /usr/src/passivbot
