import express from 'express';
import { generateSlug } from 'random-word-slugs';
import { ECSClient,RunTaskCommand } from '@aws-sdk/client-ecs';
import Redis from 'ioredis';
import { Server } from 'socket.io';

import * as dotenv from 'dotenv';


// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = 9000;


const subscriber = new Redis(process.env.REDIS_SERVICE_URL)

const io = new Server({cors: "*"})

io.on('connection', socket => {
    socket.on('subscribe', channel => {
        socket.join(channel);
        socket.emit('message',`Joined ${channel}`)
    })
})

io.listen(9001,() => {
    console.log("listening on port 9001")
})

const ecsClient = new ECSClient({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const config = {
    cluster: process.env.BUILDER_CLUSTER_ARN,
    taskDefinition: process.env.BUILDER_TASK_DEFINITION_ARN,
}

app.use(express.json())

app.post('/project', async (req, res) => {
    const {gitURL, slug} = req.body
    const projectSlug  = slug ? slug :  generateSlug();

    const command = new RunTaskCommand({
        cluster: config.cluster,
        taskDefinition: config.taskDefinition,
        launchType: 'FARGATE',
        count: 1,
        networkConfiguration: {
            awsvpcConfiguration:{
                assignPublicIp:"ENABLED",
                subnets: [
                    process.env.SUBNET_1,
                    process.env.SUBNET_2,
                    process.env.SUBNET_3
                ],
                securityGroups: [process.env.SECURITY_GROUP]
            }
        },
        overrides: {
            containerOverrides: [
                {
                    name: process.env.CONTAINER_NAME,
                    environment: [
                        {name: 'GIT_REPOSITORY__URL', value: gitURL},
                        {name: 'PROJECT_ID', value: projectSlug}
                    ]
                }
            ]
        }


    })

    await ecsClient.send(command);
    return res.json({status: "queued", data: {projectSlug,url: `http://${projectSlug}.localhost:8000`} } )


})

async function initRedisSubscribe(){
    console.log("Subscribed to logs..")
    subscriber.psubscribe(`logs:*`)
    subscriber.on('pmessage', (pattern, channel, message) => {
        io.to(channel).emit('message', message)
    })
}

initRedisSubscribe()

app.listen(PORT,() => console.log(`Api Server is running on http://localhost:${PORT}`));