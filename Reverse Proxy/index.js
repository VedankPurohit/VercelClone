import express, { urlencoded } from 'express';
import httpProxy from 'http-proxy';

import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = 8000;

const BASE_PATH = process.env.BASE_S3_PATH+"/__outputs"
const proxy = httpProxy.createProxy()



app.use((req, res) => {
    const hostname = req.hostname;
    const subdomain = hostname.split('.')[0];
    
    const resolvesto = `${BASE_PATH}/${subdomain}`;
    return proxy.web(req, res, { target: resolvesto, changeOrigin: true });
});

proxy.on("proxyReq", (proxyReq, req, res) => {
    const url = req.url;
    if (url ==="/")
        proxyReq.path += "index.html";
});

app.listen(PORT,() => console.log(`Server is running on http://localhost:${PORT}`));