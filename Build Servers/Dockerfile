# --- Stage 1: Builder Stage ---
# This stage is responsible for cloning the repository and building the project.
# It contains all necessary build tools (git, nodejs) which will NOT be present in the final image.
# Using an official Node.js image as base, which comes with Node.js and npm pre-installed.
FROM node:20-slim as builder

# Install build dependencies: only git is needed now, as nodejs is pre-installed.
# These commands must run as root (default user) to have necessary permissions.
# apt-get update is run first, then install, and finally, the apt cache is cleaned up to reduce image size.
RUN apt-get update && \
    apt-get install -y git && \
    rm -rf /var/lib/apt/lists/*

# Create a non-root user for the builder stage to enhance security.
# Switch to this user AFTER installing system-wide packages.
RUN adduser --disabled-password --gecos "" builderuser
USER builderuser
WORKDIR /home/app

# Copy necessary files for the build process.
# main.sh: Orchestrates the cloning and build script execution.
# build_script.js: Contains the core build logic and log capturing.
# package*.json: For installing npm dependencies.
COPY --chown=builderuser:builderuser main.sh main.sh
COPY --chown=builderuser:builderuser build_script.js build_script.js
COPY --chown=builderuser:builderuser package*.json .

# Grant execute permissions only to main.sh. build_script.js is executed by node.
RUN chmod +x main.sh

# The ENTRYPOINT for the builder stage.
# It will execute main.sh, which in turn performs the git clone and triggers the build_script.js.
# The output (dist folder and logs) will be saved within this stage for the next stage to copy.
ENTRYPOINT [ "/home/app/main.sh" ]


# --- Stage 2: Runner Stage ---
# This stage is lean and only contains what's needed to process and upload the built artifacts.
# It does NOT have git or the full npm toolchain, only nodejs for the upload script (which is already present).
# Using an official Node.js image as base for consistency and pre-installed Node.js.
FROM node:20-slim as runner

# Create a non-root user for the runner stage.
# Switch to this user AFTER the base image's setup.
RUN adduser --disabled-password --gecos "" appuser
USER appuser
WORKDIR /home/app

# Copy only the built artifacts and the captured build logs from the 'builder' stage.
# This is the key step for isolating the build environment from the runtime environment.
# /home/app/output/dist is where the built project will reside.
# /home/app/build_logs.txt is the file containing the build logs captured in the builder stage.
COPY --from=builder --chown=appuser:appuser /home/app/output/dist /home/app/output/dist
COPY --from=builder --chown=appuser:appuser /home/app/build_logs.txt /home/app/build_logs.txt

# Copy the processing script and its dependencies for the runner stage.
# upload_script.js: Handles S3 upload and Kafka logging.
# package*.json: For installing npm dependencies specific to the upload script.
# kafka.pem: Kafka SSL certificate.
COPY --chown=appuser:appuser upload_script.js upload_script.js
COPY --chown=appuser:appuser package*.json .
COPY --chown=appuser:appuser kafka.pem kafka.pem

# Install Node.js dependencies for the upload_script.js.
# Using --production to only install production dependencies, further reducing image size.
RUN npm install --production

# The CMD for the final runner image.
# It will directly execute upload_script.js, which then handles S3 upload and Kafka logging.
CMD [ "node", "upload_script.js" ]
