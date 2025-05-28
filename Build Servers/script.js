const {exec} = require('child_process');
const path = require('path');
const fs = require('fs');
const {S3Client, PutObjectsCommand} = require('@aws-sdk/client-s3');
const mime = require("mime-types");
//import dotenv
import * as dotenv from 'dotenv';
dotenv.config();


const s3 = new S3Client{
    region: 'us-east-1',
    Credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
}

async function inti() {
    console.log('Executing build');
    const outDirPath = path.join(__dirname, "output")

    const p = exec('cd ${outDirPath} && npm install && npm run build')

    p.stdout.on('data', (data) => {
        console.log(data.toString());
    });

    p.stderr.on('error', (data) => {
        console.log("Error" , data.toString());
    });

    p.on('close', async function (){
        console.log(`child process exited`)
        const distFolderPath = path.join(__dirname,"output" ,"dist")
        const distFolderContents = fs.readdirSync(distFolderPath, {recursive: true})
        
        for (const file of distFolderContents) {
            if (fs.lstatSync(file).isDirectory()) continue

            console.log("uploading", file)

            const command = new PutObjectsCommand({ 
               Bucket: '',
               Key: `__outputs/${PROJECT_ID}/${file}`,
               Body: fs.createReadStream(file),
               ContentType: mime.lookup(file)
            })
            await s3.send(command);
            console.log('uploaded', file)
        }
        console.log("Done")
        
    
    });   

}