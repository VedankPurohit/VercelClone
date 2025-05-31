console.log("upload_script.js: Starting upload and logging process...");

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { Kafka } from 'kafkajs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import mime from "mime-types";
import * as dotenv from 'dotenv'; // Still use dotenv for local testing, but emphasize runtime env vars.

// Load environment variables from .env file for local development/testing.
// In production, these variables will be passed directly to the Docker container at runtime.
dotenv.config();

// Define __dirname equivalent for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure critical environment variables are set.
// These should be passed to the runner container at runtime.
const PROJECT_ID = process.env.PROJECT_ID;
const DEPLOYEMENT_ID = process.env.DEPLOYEMENT_ID;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const KAFKA_BROKER_URL = process.env.KAFKA_BROKER_URL;
const KAFKA_USERNAME = process.env.KAFKA_USERNAME;
const KAFKA_PASSWORD = process.env.KAFKA_PASSWORD;

const requiredEnvVars = [
    'PROJECT_ID', 'DEPLOYEMENT_ID', 'S3_BUCKET_NAME',
    'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY',
    'KAFKA_BROKER_URL', 'KAFKA_USERNAME', 'KAFKA_PASSWORD'
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`Error: Required environment variable '${envVar}' is not set.`);
        process.exit(1);
    }
}

console.log(`upload_script.js: PROJECT_ID is ${PROJECT_ID}`);
console.log(`upload_script.js: DEPLOYEMENT_ID is ${DEPLOYEMENT_ID}`);

// Initialize Kafka Client
const kafka = new Kafka({
    clientId: `docker-upload-server-${PROJECT_ID}`,
    brokers: [KAFKA_BROKER_URL],
    ssl: {
        ca: fs.readFileSync(path.join('./kafka.pem'), 'utf-8'),
    },
    sasl: {
        username: KAFKA_USERNAME,
        password: KAFKA_PASSWORD,
        mechanism: 'plain'
    }
});

const producer = kafka.producer();

// Function to publish logs to Kafka.
async function publishLog(log) {
    try {
        await producer.send({
            topic: `container-logs`,
            messages: [
                {
                    key: 'log',
                    value: JSON.stringify({ PROJECT_ID, DEPLOYEMENT_ID, log })
                }
            ]
        });
    } catch (kafkaError) {
        console.error(`upload_script.js: Failed to publish log to Kafka: ${kafkaError.message}`);
        // Decide if you want to exit or continue on Kafka errors.
        // For critical logs, you might want to exit. For general logs, just log the error.
    }
}

// Initialize S3 Client
const s3 = new S3Client({
    region: "ap-south-1",
    credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
    }
});

async function initiateUploadProcess() {
    await producer.connect();
    await publishLog("Upload process started...");
    console.log('upload_script.js: Reading build logs and uploading artifacts...');

    const distFolderPath = path.join(__dirname, "output", "dist"); // Path to built files copied from builder stage.
    const buildLogFilePath = path.join(__dirname, "build_logs.txt"); // Path to build logs copied from builder stage.

    // --- 1. Read and publish build logs to Kafka ---
    if (fs.existsSync(buildLogFilePath)) {
        console.log(`upload_script.js: Publishing build logs from ${buildLogFilePath} to Kafka.`);
        await publishLog("--- Build Logs Start ---");
        try {
            const buildLogs = await fs.promises.readFile(buildLogFilePath, 'utf8');
            // Split logs by line and publish each line or chunk to Kafka.
            // Be mindful of Kafka message size limits.
            const logLines = buildLogs.split('\n');
            for (const line of logLines) {
                if (line.trim()) { // Only publish non-empty lines
                    await publishLog(line.trim());
                }
            }
            await publishLog("--- Build Logs End ---");
            console.log("upload_script.js: Build logs published to Kafka.");
        } catch (error) {
            console.error(`upload_script.js: Error reading or publishing build logs: ${error.message}`);
            await publishLog(`Error reading or publishing build logs: ${error.message}`);
        }
    } else {
        console.warn(`upload_script.js: Build log file not found at ${buildLogFilePath}. Skipping log upload.`);
        await publishLog("Warning: Build log file not found.");
    }

    // --- 2. Upload built 'dist' folder contents to S3 ---
    if (!fs.existsSync(distFolderPath)) {
        const errorMessage = `upload_script.js: Error: 'dist' directory not found at ${distFolderPath}. Build stage might have failed or produced no output.`;
        console.error(errorMessage);
        await publishLog(errorMessage);
        process.exit(1); // Critical error, exit.
    }

    const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true });
    console.log(`upload_script.js: Found ${distFolderContents.length} items in dist folder for upload.`);
    await publishLog(`Found ${distFolderContents.length} items in dist folder for upload.`);

    if (distFolderContents.length === 0) {
        console.warn("upload_script.js: No files found in 'dist' folder to upload.");
        await publishLog("No files found in 'dist' folder to upload.");
    }

    for (const fileSPath of distFolderContents) {
        const fileFullPath = path.join(distFolderPath, fileSPath);

        // Skip directories.
        if (fs.lstatSync(fileFullPath).isDirectory()) {
            console.log(`upload_script.js: Skipping directory: ${fileSPath}`);
            continue;
        }

        console.log(`upload_script.js: Uploading file: ${fileSPath}`);
        await publishLog(`Uploading file: ${fileSPath}`);

        try {
            const command = new PutObjectCommand({
                Bucket: S3_BUCKET_NAME,
                Key: `__outputs/${PROJECT_ID}/${fileSPath}`, // S3 Key path for the final deployment.
                Body: fs.createReadStream(fileFullPath),
                ContentType: mime.lookup(fileFullPath) || 'application/octet-stream' // Fallback for unknown mime types.
            });
            await s3.send(command);
            console.log(`upload_script.js: Successfully uploaded: ${fileSPath}`);
            await publishLog(`Successfully uploaded: ${fileSPath}`);
        } catch (s3Error) {
            console.error(`upload_script.js: Error uploading ${fileSPath}:`, s3Error);
            await publishLog(`Error uploading ${fileSPath}: ${s3Error.message}`);
            // Decide whether to exit or continue on individual file upload errors.
            // For now, we'll log and continue, but you might want to exit for critical files.
        }
    }

    console.log("upload_script.js: All upload and logging operations completed.");
    await publishLog("All upload and logging operations completed. Deployment ready.");
    process.exit(0); // Exit successfully after all operations.
}

// Call the main function and catch any unhandled errors.
initiateUploadProcess().catch(async (error) => {
    console.error("upload_script.js: An unhandled error occurred during script execution:", error);
    await publishLog(`An unhandled error occurred during script execution: ${error.message}`);
    process.exit(1); // Exit with an error code.
});