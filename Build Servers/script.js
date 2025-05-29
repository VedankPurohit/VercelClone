console.log("script.js: Starting execution...");

import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
// Import necessary for __dirname equivalent in ESM
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Corrected: Use PutObjectCommand for single file uploads
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import mime from "mime-types";
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Define __dirname equivalent for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize S3 Client
const s3 = new S3Client({
    region: "eu-north-1",
    // Corrected: 'Credentials' should be 'credentials' (lowercase 'c')
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// Ensure PROJECT_ID is available
const PROJECT_ID = process.env.PROJECT_ID;
if (!PROJECT_ID) {
    console.error("Error: PROJECT_ID environment variable is not set.");
    process.exit(1); // Exit if critical variable is missing
}
console.log(`script.js: PROJECT_ID is ${PROJECT_ID}`);


async function inti() {
    console.log('script.js: Executing build process...');
    const outDirPath = path.join(__dirname, "output");

    // Check if the output directory exists
    if (!fs.existsSync(outDirPath)) {
        console.error(`script.js: Error: Output directory not found: ${outDirPath}`);
        process.exit(1);
    }

    // Command to run npm install and npm run build inside the cloned project
    // Use backticks for template literals in exec command
    const buildCommand = `cd "${outDirPath}" && npm install && npm run build`;
    console.log(`script.js: Running build command: ${buildCommand}`);

    const p = exec(buildCommand);

    p.stdout.on('data', (data) => {
        console.log(`script.js (stdout): ${data.toString().trim()}`);
    });

    // Corrected: stderr emits 'data' events for output, not 'error' events for regular messages
    p.stderr.on('data', (data) => {
        console.error(`script.js (stderr): ${data.toString().trim()}`);
    });

    p.on('close', async function (code) {
        console.log(`script.js: Child process exited with code ${code}`);

        if (code !== 0) {
            console.error(`script.js: Build process failed with exit code ${code}. Aborting upload.`);
            process.exit(1);
        }

        const distFolderPath = path.join(outDirPath, "dist"); // dist is inside output
        console.log(`script.js: Checking for built files in: ${distFolderPath}`);

        if (!fs.existsSync(distFolderPath)) {
            console.error(`script.js: Error: 'dist' directory not found at ${distFolderPath}. Build might have failed or created files elsewhere.`);
            process.exit(1);
        }

        const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true });
        console.log(`script.js: Found ${distFolderContents.length} items in dist folder.`);

        if (distFolderContents.length === 0) {
            console.warn("script.js: No files found in 'dist' folder to upload.");
        }

        for (const fileSPath of distFolderContents) {
            const file = path.join(distFolderPath, fileSPath);

            // Skip directories
            if (fs.lstatSync(file).isDirectory()) {
                console.log(`script.js: Skipping directory: ${fileSPath}`);
                continue;
            }

            console.log(`script.js: Uploading file: ${fileSPath}`);

            try {
                const command = new PutObjectCommand({
                    Bucket: process.env.S3_BUCKET_NAME,
                    Key: `__outputs/${PROJECT_ID}/${fileSPath}`, // S3 Key path
                    Body: fs.createReadStream(file),
                    ContentType: mime.lookup(file) || 'application/octet-stream' // Fallback for unknown mime types
                });
                await s3.send(command);
                console.log(`script.js: Successfully uploaded: ${fileSPath}`);
            } catch (s3Error) {
                console.error(`script.js: Error uploading ${fileSPath}:`, s3Error);
                // Decide whether to exit or continue on individual file upload errors
                // For now, we'll log and continue, but you might want to exit.
            }
        }
        console.log("script.js: All operations completed.");
    });

    p.on('error', (err) => {
        console.error(`script.js: Failed to start child process: ${err.message}`);
        process.exit(1);
    });
}

// Call the main function and catch any unhandled errors
inti().catch(error => {
    console.error("script.js: An unhandled error occurred during script execution:", error);
    process.exit(1); // Exit with an error code
});
