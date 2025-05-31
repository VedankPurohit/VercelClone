#!/bin/bash

# Validate GIT_REPOSITORY__URL to prevent shell injection.
# This regex checks for common Git URL patterns (http(s)://, git@, ssh://).
# It's a basic but effective guard against simple malicious inputs.
if [[ ! "$GIT_REPOSITORY__URL" =~ ^(https?|git|ssh)://[^[:space:]]+$ && ! "$GIT_REPOSITORY__URL" =~ ^git@[^[:space:]]+:[^[:space:]]+$ ]]; then
    echo "Error: Invalid or insecure GIT_REPOSITORY__URL provided."
    exit 1
fi

# Clean and prepare the output directory before cloning.
# This ensures that no leftover files from previous runs interfere.
rm -rf /home/app/output/*
mkdir -p /home/app/output
chmod 755 /home/app/output # Set appropriate permissions for the directory.

# Clone the Git repository into the /home/app/output directory.
# --depth 1: Clones only the latest commit, reducing download size and time.
# --recurse-submodules: Include this if your projects use Git submodules.
git clone --depth 1 "$GIT_REPOSITORY__URL" /home/app/output

# Check if the git clone operation was successful.
if [ $? -ne 0 ]; then
    echo "Error: Git clone failed for $GIT_REPOSITORY__URL"
    exit 1
fi

# Execute the build_script.js.
# This script will handle npm install, npm run build, and log capturing.
# The `exec` command replaces the current shell process with the node process,
# ensuring that build_script.js is the final process in this container.
exec node build_script.js
