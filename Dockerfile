FROM python:3.10-slim-bullseye

ENV DEBIAN_FRONTEND=noninteractive
# Skip runtime Rust compilation; extensions are prebuilt at image build time
ENV SKIP_RUST_COMPILE=true

# Install system build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        python3-dev \
        pkg-config \
        libssl-dev \
        curl \
        git \
        nodejs \
        npm \
    && rm -rf /var/lib/apt/lists/*

# Install Rust toolchain
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /app

# Copy python source code
COPY requirements.txt ./
COPY requirements-rust.txt ./
COPY requirements-live.txt ./
COPY setup.py ./

# Install Python dependencies (including maturin for Rust extension builds)
RUN pip install --no-cache-dir -r requirements.txt

# Copy Rust source code
COPY passivbot-rust/ ./passivbot-rust/

# Build Rust extensions for backtesting and optimization
RUN cd passivbot-rust \
&& maturin build --release \
&& pip install target/wheels/*.whl

# Copy passivbot-configurator source code
COPY passivbot-configurator/package.json ./passivbot-configurator/package.json
COPY passivbot-configurator/package-lock.json ./passivbot-configurator/package-lock.json

# Install Node.js dependencies for configurator
WORKDIR /app/passivbot-configurator
RUN npm install

WORKDIR /app

# Copy all source code
COPY . .

# Default command to run the bot; override with docker-compose command or docker run args
CMD ["python", "src/main.py"]
