import express from 'express';
import { generateSlug } from 'random-word-slugs';
import { ECSClient,RunTaskCommand } from '@aws-sdk/client-ecs';
import { Server } from 'socket.io';
import {z} from 'zod'
// import {PrismaClient} from '@prisma/client';
import { PrismaClient } from './generated/prisma/index.js'
import cors from 'cors'
import {createClient} from "@clickhouse/client"
import {Kafka} from 'kafkajs'
import {v4 as uuid4} from 'uuid';


import path from 'path';
import fs from 'fs';

import * as dotenv from 'dotenv';


// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = 9000;

const prisma = new PrismaClient({})

const kafka = new Kafka({
    clientId: `api-server`,
    brokers: [process.env.KAFKA_BROKER_URL],
    ssl: {
        ca: fs.readFileSync(path.join( './kafka.pem'), 'utf-8'),
    },
    sasl: {
        username: process.env.KAFKA_USERNAME,
        password: process.env.KAFKA_PASSWORD,
        mechanism: 'plain'
    }

});

const client = createClient({
    host: process.env.CLICKHOUSE_SERVICE_URL,
    database: "default",
    username: process.env.CLICKHOUSE_USERNAME,
    password: process.env.CLICKHOUSE_PASSWORD
})

const io = new Server({cors: "*"})

const consumer = kafka.consumer({groupId: 'api-server-logs-consumer'})

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
app.use(cors())


app.post(`/project`, async (req,res) => {
    const schema = z.object({
        name: z.string(),
        gitURL: z.string()
    })

    const safeParseResult = schema.safeParse(req.body)
    if (safeParseResult.error) {
        return res.status(400).send({error:safeParseResult.error.message})
    }
    const {name, gitURL} = safeParseResult.data

    //check if the project already exists
    const project = await prisma.project.findMany({
        where: {
            name: name
        }
    })
    if (project) {
        return res.status(400).send({error: "Project already exists"})
    }

    const deployment = await prisma.project.create({
        data: {
            name: name,
            gitURL: gitURL,
            subDomain: generateSlug()
        }
    })
    return res.json({status: 'success', data: {deployment}})


})


app.post('/deploy', async (req, res) => {
    const schema = z.object({
        projectId: z.string()
    })

    const safeParseResult = schema.safeParse(req.body)
    if (safeParseResult.error) {
        return res.status(400).send({error:safeParseResult.error.message})
    }
    const {projectId} = safeParseResult.data

    const project = await prisma.project.findUnique({
        where : {
            id: projectId
        }
    })

    if (!project) {
        return res.status(404).send({error: "Project not found"})
    }
    console.log(`Project ID: ${projectId}`)
    // check of the project isnt in deployment and if it is, check the status of last deployment
    const deployements = await prisma.deployement.findMany({
        where: {
            projectId: projectId
        },
        orderBy: {
            createdAt: 'desc'
        }
    })

    // if (deployements.length > 0 && (deployements[0].status =='IN_PROGRESS' || deployements[0].status == 'QUEUED')) {
    //     return res.json({error: "Project is already in deployment", status: deployements[0].status, data: deployements[0]})
    // }

    const newDeployement = await prisma.deployement.create({
        data:{
            project: {
                connect: {
                    id: projectId
                }},
            status: 'QUEUED'
            
        }
    })


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
                        {name: 'GIT_REPOSITORY__URL', value: project.gitURL},
                        {name: 'PROJECT_ID', value: project.name},
                        {name: 'DEPLOYEMENT_ID', value: newDeployement.id},
                    ]
                }
            ]
        }


    })

    await ecsClient.send(command);
    return res.json({status: "queued", data: {deployement_id: newDeployement.id,
                                                projectName: project.name,
                                                subDomain: project.subDomain
    } } )


})

app.get(`/logs/:id`,async(req, res) => {
        const id = req.params.id
        console.log(`Getting logs for ${id}`)
        const logs = await client.query({query: `select * from log_events where deployement_id = '${id}'`,
        format: 'JSONEachRow'
    })
    const rawLogs = await logs.json()
    return res.json({data: rawLogs})
})


async function initKafkaConsumer(){
    await consumer.connect();
    await consumer.subscribe({topic: 'container-logs'});

    await consumer.run({
        autoCommit: false,
        eachBatch: async function ({ batch,heartbeat,commitOffsetsIfNecessary, resolveOffset}) {
            const messages = batch.messages;
            console.log(`Recv. ${messages.length} messages..`);
            for (const message of messages) {
                const stringMessage = message.value.toString();
                let {PROJECT_ID, DEPLOYEMENT_ID, log} = JSON.parse(stringMessage);
                // DEPLOYEMENT_ID = String(DEPLOYEMENT_ID).trim()
                
                if (!DEPLOYEMENT_ID || DEPLOYEMENT_ID.trim() === '') {
                        console.warn(`Skipping ClickHouse insert for message with empty or null DEPLOYEMENT_ID: ${stringMessage}`);
                        // You might choose to throw an error here, or handle it differently
                        // For now, we'll just log and continue, but this is a sign of a problem
                    } 
                // console.log(`Project ID: ${PROJECT_ID}, deployement ID: ${DEPLOYEMENT_ID}, log: ${log}`);
                const insertValues = {
                            event_id: uuid4(),
                            deployement_id: DEPLOYEMENT_ID,
                            log: log
                        };
                        console.log(`Deployement ID: ${DEPLOYEMENT_ID}, log: ${log}`);
                        console.log("Inserting into ClickHouse:", insertValues);
                const {query_id} =  await client.insert({
                    table: 'log_events',
                    values: [insertValues],
                    format: 'JSONEachRow'

                })
                resolveOffset(message.offset);
                await commitOffsetsIfNecessary(message.offset);
                await heartbeat();
                console.log(`Query ID: ${query_id}, deployement ID: ${DEPLOYEMENT_ID}, log: ${log}`);
            }


        }
            
    })
}

initKafkaConsumer();

app.listen(PORT,() => console.log(`Api Server is running on http://localhost:${PORT}`));