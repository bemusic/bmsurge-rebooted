# == bmsampler ==
FROM node:12.9.1-buster AS bmsampler-builder
WORKDIR /opt

# Build target images, optimize for rebuild speed
RUN apt-get update

# bmsampler deps
RUN apt-get install -y build-essential libsndfile1 libsndfile1-dev

# Compile bmsampler
RUN git clone https://github.com/bemusic/bmsampler.git && \
  cd bmsampler && \
  g++ -std=c++11 bmsampler.cpp -I./vendor/json/include -lsndfile -o bmsampler && \
  cp bmsampler /usr/bin

# == worker ==
FROM node:12.9.1-buster

# Install p7zip and sox
RUN sed -i "s/buster main/buster main contrib non-free/" /etc/apt/sources.list \
  && apt-get update \
	&& apt-get install -y \
    p7zip-full \
    p7zip-rar \
    sox \
    libsox-fmt-mp3 \
    libsndfile1 \
    lame \
	&& rm -rf /var/lib/apt/lists/*

# Install WaveGain
RUN wget https://launchpad.net/~stefanobalocco/+archive/ubuntu/multimedia/+files/wavegain_1.3.1-1~xenial1_amd64.deb && \
  dpkg -i wavegain_1.3.1-1~xenial1_amd64.deb && \
  rm -f wavegain_1.3.1-1~xenial1_amd64.deb

# Install bms-renderer
RUN npm i -g bms-renderer@3.0.0-0 --unsafe

# Install bmsampler
COPY --from=bmsampler-builder /usr/bin/bmsampler /usr/bin/bmsampler

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
COPY yarn.lock /usr/src/app/
COPY package.json /usr/src/app/
RUN yarn install --frozen-lockfile

ENV LANG C.UTF-8
COPY src/ /usr/src/app/src/
CMD ["bash", "-c", "node src/index.js server"]