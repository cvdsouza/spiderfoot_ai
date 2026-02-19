#
# Spiderfoot Dockerfile
#
# http://www.spiderfoot.net
#
# Usage:
#
#   sudo docker build -t spiderfoot .
#   sudo docker run -p 5001:5001 --security-opt no-new-privileges spiderfoot
#
# Using Docker volume for spiderfoot data
#
#   sudo docker run -p 5001:5001 -v /mydir/spiderfoot:/var/lib/spiderfoot spiderfoot
#
# Using SpiderFoot remote command line with web server
#
#   docker run --rm -it spiderfoot sfcli.py -s http://my.spiderfoot.host:5001/
#
# Running spiderfoot commands without web server (can optionally specify volume)
#
#   sudo docker run --rm spiderfoot sf.py -h
#
# Running a shell in the container for maintenance
#   sudo docker run -it --entrypoint /bin/sh spiderfoot
#
# Running spiderfoot unit tests in container
#
#   sudo docker build -t spiderfoot-test --build-arg REQUIREMENTS=test/requirements.txt .
#   sudo docker run --rm spiderfoot-test -m pytest .

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python dependencies
FROM python:3.12-alpine AS python-build
ARG REQUIREMENTS=requirements.txt
RUN apk add --no-cache gcc git curl python3-dev musl-dev openssl-dev libffi-dev \
    libxslt-dev libxml2-dev jpeg-dev openjpeg-dev zlib-dev cargo rust swig tinyxml-dev
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY $REQUIREMENTS requirements.txt ./
RUN pip install -U pip && pip install -r requirements.txt

# Stage 3: Final image
FROM python:3.12-alpine
WORKDIR /home/spiderfoot

# Place database and logs outside installation directory
ENV SPIDERFOOT_DATA /var/lib/spiderfoot
ENV SPIDERFOOT_LOGS /var/lib/spiderfoot/log
ENV SPIDERFOOT_CACHE /var/lib/spiderfoot/cache

RUN apk --update --no-cache add musl openssl libxslt tinyxml libxml2 jpeg zlib openjpeg \
    && addgroup spiderfoot \
    && adduser -G spiderfoot -h /home/spiderfoot -s /sbin/nologin \
               -g "SpiderFoot User" -D spiderfoot \
    && rm -rf /var/cache/apk/* \
    && rm -rf /lib/apk/db \
    && rm -rf /root/.cache \
    && mkdir -p $SPIDERFOOT_DATA || true \
    && mkdir -p $SPIDERFOOT_LOGS || true \
    && mkdir -p $SPIDERFOOT_CACHE || true \
    && chown spiderfoot:spiderfoot $SPIDERFOOT_DATA \
    && chown spiderfoot:spiderfoot $SPIDERFOOT_LOGS \
    && chown spiderfoot:spiderfoot $SPIDERFOOT_CACHE

COPY . .
COPY --from=python-build /opt/venv /opt/venv
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

ENV PATH="/opt/venv/bin:$PATH"

USER spiderfoot

EXPOSE 5001

# Run the application.
ENTRYPOINT ["python"]
CMD ["sf.py", "-l", "0.0.0.0:5001"]
