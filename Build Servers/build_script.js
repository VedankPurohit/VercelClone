console.log("build_script.js: Starting build process...");

import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Define __dirname equivalent for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define the path where build logs will be saved.
const BUILD_LOG_FILE = path.join(__dirname, "build_logs.txt");

// Function to append logs to the build log file.
async function appendLogToFile(log) {
    try {
        await fs.promises.appendFile(BUILD_LOG_FILE, log + '\n', 'utf8');
    } catch (error) {
        console.error(`build_script.js: Failed to write log to file: ${error.message}`);
    }
}

async function performBuild() {
    // Ensure the build log file is clean at the start.
    try {
        await fs.promises.writeFile(BUILD_LOG_FILE, '', 'utf8');
    } catch (error) {
        console.error(`build_script.js: Failed to clear build log file: ${error.message}`);
        process.exit(1);
    }

    await appendLogToFile("Build process started...");
    console.log('build_script.js: Executing build process...');

    const outDirPath = path.join(__dirname, "output");

    // Verify the output directory exists (created by main.sh).
    if (!fs.existsSync(outDirPath)) {
        const errorMessage = `build_script.js: Error: Output directory not found: ${outDirPath}. Git clone might have failed.`;
        console.error(errorMessage);
        await appendLogToFile(errorMessage);
        process.exit(1);
    }

    // Command to run npm install and npm run build inside the cloned project.
    // npm ci --production: Installs dependencies from package-lock.json, ideal for CI/CD.
    //                     --production ensures only production dependencies are installed.
    // npm run build: Executes the build script defined in package.json.
    // Adding a timeout to prevent builds from hanging indefinitely (e.g., 5 minutes = 300000 ms).
    const buildCommand = `cd "${outDirPath}" && npm ci --production && npm run build`;
    console.log(`build_script.js: Running build command: ${buildCommand}`);
    await appendLogToFile(`Running build command: ${buildCommand}`);

    const p = exec(buildCommand, { timeout: 300000 }); // 5 minutes timeout

    p.stdout.on('data', async (data) => {
        const log = data.toString().trim();
        console.log(`build_script.js (stdout): ${log}`);
        await appendLogToFile(log);
    });

    p.stderr.on('data', async (data) => {
        const log = data.toString().trim();
        console.error(`build_script.js (stderr): ${log}`);
        await appendLogToFile(`ERROR: ${log}`); // Prefix errors for clarity in logs.
    });

    p.on('close', async function (code) {
        const closeMessage = `build_script.js: Child process exited with code ${code}`;
        console.log(closeMessage);
        await appendLogToFile(closeMessage);

        if (code !== 0) {
            const errorMessage = `build_script.js: Build process failed with exit code ${code}.`;
            console.error(errorMessage);
            await appendLogToFile(errorMessage);
            process.exit(1); // Exit with error if build failed.
        }

        await appendLogToFile("Build process completed successfully.");
        console.log("build_script.js: Build process completed successfully.");
        process.exit(0); // Exit successfully.
    });

    p.on('error', async (err) => {
        const errorMessage = `build_script.js: Failed to start child process: ${err.message}`;
        console.error(errorMessage);
        await appendLogToFile(errorMessage);
        process.exit(1); // Exit with error if process failed to start.
    });
}

// Call the main build function and catch any unhandled errors.
performBuild().catch(async (error) => {
    const errorMessage = `build_script.js: An unhandled error occurred during script execution: ${error.message}`;
    console.error(errorMessage, error);
    await appendLogToFile(errorMessage);
    process.exit(1); // Exit with an error code.
});
