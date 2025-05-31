Okay, here's a `README.md` for your VercelClone project, designed to be clear, informative, and easy for others to understand and potentially set up. I've structured it to explain the project, its architecture, and provide clear setup instructions. Remember to replace placeholders like `[YOUR_ECR_REPO_URL]` with your actual information.

-----

# VercelClone: Cloud-Native Web Deployment Platform

## Table of Contents

  * [About the Project](https://www.google.com/search?q=%23about-the-project)
  * [Features](https://www.google.com/search?q=%23features)
  * [Architecture](https://www.google.com/search?q=%23architecture)
  * [Getting Started](https://www.google.com/search?q=%23getting-started)
      * [Prerequisites](https://www.google.com/search?q=%23prerequisites)
      * [Environment Variables](https://www.google.com/search?q=%23environment-variables)
      * [AWS Setup](https://www.google.com/search?q=%23aws-setup)
      * [Docker Image Setup](https://www.google.com/search?q=%23docker-image-setup)
      * [Running Locally](https://www.google.com/search?q=%23running-locally)
  * [Project Structure](https://www.google.com/search?q=%23project-structure)
  * [Contributing](https://www.google.com/search?q=%23contributing)
  * [License](https://www.google.com/search?q=%23license)
  * [Contact](https://www.google.com/search?q=%23contact)

-----

## About the Project

VercelClone is an ambitious open-source project designed to replicate the core functionality of automatic web application deployment platforms like Vercel. It allows users to effortlessly deploy their frontend web applications (e.g., React, Angular, Three.js, plain HTML/CSS/JS) by simply providing a GitHub repository URL.

This platform automates the entire CI/CD pipeline, from fetching your code to building it and serving it live, all powered by a robust cloud-native architecture on AWS. It includes real-time logging, scalable build orchestration, and a custom serving layer.

## Features

  * **Automated Deployments:** Deploy web applications directly from a GitHub repository.
  * **Framework Agnostic:** Supports various frontend frameworks (React, Angular, Three.js, etc.).
  * **Cloud-Native Architecture:** Built on AWS for scalability and reliability.
  * **Containerized Builds:** Utilizes Docker and AWS ECS for isolated and efficient build processes.
  * **Real-time Logging:** Monitor your deployment progress with live build logs streamed via Kafka and queryable from ClickHouse.
  * **Static Asset Hosting:** Serves built applications efficiently from AWS S3.
  * **Custom Reverse Proxy:** Dynamically routes incoming requests to the correct deployed application.
  * **Deployment Tracking:** Persistence of project and deployment metadata using Prisma ORM.

## Architecture

VercelClone is composed of three main microservices, working together to manage the deployment lifecycle:

1.  **API Server (`/api-server`)**:

      * The central entry point for users.
      * Handles user requests to create new projects and initiate deployments.
      * Interacts with the database (via Prisma) to store project and deployment metadata.
      * Triggers build processes by sending messages to the build server.

2.  **Build Server (`/build-server`)**:

      * Responsible for fetching, building, and deploying applications.
      * Consumes messages from the API server to start new builds.
      * Spins up dedicated Docker containers on AWS ECS for each build process.
      * Downloads the specified GitHub repository, executes build commands (e.g., `npm install`, `npm run build`), and uploads the generated static assets to an AWS S3 bucket.
      * Streams real-time build logs to Kafka.

3.  **Reverse Proxy (`/reverse-proxy`)**:

      * The public-facing component that serves deployed applications.
      * A custom Node.js application that intercepts incoming web requests.
      * Based on the project name or custom domain, it retrieves the correct static files from the corresponding AWS S3 bucket and serves them to the user.

**Data Flow Overview:**

```
User Request
    |
    V
API Server
    | (Triggers Deployment)
    V
Build Server (AWS ECS + Docker)
    |
    +--- (Pushes Logs) ---> Kafka ---> ClickHouse (for log retrieval)
    |
    +--- (Uploads Build) --> AWS S3 (Static Hosting)
    |
    V
(Updates DB via Prisma)
    |
    V
Reverse Proxy <--- (Serves Content From S3) --- User Browser
```

## Getting Started

Follow these steps to get your VercelClone instance up and running.

### Prerequisites

Before you begin, ensure you have the following installed:

  * Docker
  * Node.js (LTS recommended)
  * npm or yarn
  * Git
  * AWS CLI configured with appropriate credentials
  * An AWS account with permissions for:
      * ECS (Elastic Container Service)
      * S3 (Simple Storage Service)
      * ECR (Elastic Container Registry) - for storing Docker images
      * IAM (for creating roles/policies)
  * Kafka and ClickHouse instances (either local, Dockerized, or managed services)

### Environment Variables

Each of the main services (`build-server`, `api-server`, `reverse-proxy`) requires its own `.env` file with specific environment variables. Create a `.env` file in the root directory of each service folder:

**`/build-server/.env`:**

```env
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=your_aws_region
S3_BUCKET_NAME=your_s3_bucket_name_for_deployments
KAFKA_BROKER_URL=your_kafka_broker_url:9092
# Add any other build-specific variables like default build commands, etc.
```

**`/api-server/.env`:**

```env
DATABASE_URL="postgresql://user:password@host:port/database_name?schema=public" # Your PostgreSQL connection string (for Prisma)
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=your_aws_region
KAFKA_BROKER_URL=your_kafka_broker_url:9092
# Add API-specific variables like PORT, etc.
```

**`/reverse-proxy/.env`:**

```env
S3_BUCKET_NAME=your_s3_bucket_name_for_deployments
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=your_aws_region
# Add proxy-specific variables like PORT, etc.
```

### AWS Setup

1.  **S3 Bucket:** Create an S3 bucket for storing your deployed static web applications. Ensure it's publicly accessible if you plan to serve directly, or accessible by your reverse proxy and build server.
2.  **ECS Cluster:** Set up an ECS cluster. The build server will launch tasks within this cluster. You'll need appropriate IAM roles for ECS tasks to interact with S3 and ECR.
3.  **ECR Repository:** Create an Elastic Container Registry (ECR) repository to store the Docker image for your build environment (explained in the next step).

### Docker Image Setup

The `build-server` requires a Docker image that contains the necessary tools (Node.js, npm/yarn, Python, etc.) to build various frontend applications.

1.  **Build the Docker Image:** Navigate to the `build-server` directory (or wherever your Dockerfile for the build environment is located) and build the image:
    ```bash
    cd build-server # Or relevant directory
    docker build -t vercelclone-build-env .
    ```
2.  **Tag the Image:** Tag your Docker image with your ECR repository URL.
    ```bash
    docker tag vercelclone-build-env:latest [YOUR_ECR_REPO_URL]/vercelclone-build-env:latest
    ```
    (e.g., `123456789012.dkr.ecr.your_aws_region.amazonaws.com/vercelclone-build-env:latest`)
3.  **Authenticate Docker to ECR:**
    ```bash
    aws ecr get-login-password --region your_aws_region | docker login --username AWS --password-stdin [YOUR_ECR_REPO_URL]
    ```
4.  **Push to ECR:** Push the image to your ECR repository.
    ```bash
    docker push [YOUR_ECR_REPO_URL]/vercelclone-build-env:latest
    ```
    **Note:** This image will be used by the AWS ECS tasks launched by your `build-server` to execute the actual application builds.

### Running Locally (for Development/Testing)

To run the entire VercelClone system locally, you'll need Docker Compose for Kafka and ClickHouse, and then run each service individually.

1.  **Start Kafka & ClickHouse (e.g., via Docker Compose):**
    You'll need a `docker-compose.yml` that sets up Kafka and ClickHouse. An example might look like:

    ```yaml
    # Simplified docker-compose.yml for Kafka and ClickHouse
    version: '3'
    services:
      zookeeper:
        image: 'bitnami/zookeeper:latest'
        ports:
          - '2181:2181'
        environment:
          - ALLOW_ANONYMOUS_LOGIN=yes
      kafka:
        image: 'bitnami/kafka:latest'
        ports:
          - '9092:9092'
        environment:
          - KAFKA_BROKER_ID=1
          - KAFKA_CFG_ZOOKEEPER_CONNECT=zookeeper:2181
          - ALLOW_PLAINTEXT_LISTENER=yes
          - KAFKA_CFG_LISTENERS=PLAINTEXT://:9092
          - KAFKA_CFG_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092
        depends_on:
          - zookeeper
      clickhouse:
        image: 'yandex/clickhouse-server'
        ports:
          - '8123:8123'
          - '9000:9000'
        volumes:
          - ./clickhouse_data:/var/lib/clickhouse
    ```

    Then run: `docker-compose up -d`

2.  **Run PostgreSQL Database:** Set up a PostgreSQL instance (e.g., via Docker) and ensure your `api-server/.env` `DATABASE_URL` is configured correctly.

    ```bash
    docker run --name some-postgres -e POSTGRES_PASSWORD=mysecretpassword -p 5432:5432 -d postgres
    ```

3.  **Initialize Prisma:** In the `api-server` directory, run Prisma migrations to set up your database schema:

    ```bash
    cd api-server
    npx prisma migrate dev --name init
    ```

4.  **Start Each Service:**
    Open three separate terminal windows and navigate to each service's root directory:

      * **API Server:**
        ```bash
        cd api-server
        npm install # or yarn install
        npm start # or yarn start
        ```
      * **Build Server:**
        ```bash
        cd build-server
        npm install # or yarn install
        npm start # or yarn start
        ```
      * **Reverse Proxy:**
        ```bash
        cd reverse-proxy
        npm install # or yarn install
        npm start # or yarn start
        ```

Now, the services should be running locally, and you can interact with the API server to initiate deployments.

## Project Structure

```
vercelclone/
├── api-server/         # Handles user requests, database, and triggers builds
│   ├── .env.example
│   ├── src/
│   ├── prisma/         # Prisma schema and migrations
│   └── package.json
├── build-server/       # Fetches, builds, and deploys applications to S3
│   ├── .env.example
│   ├── Dockerfile      # For the build environment (pushed to ECR)
│   ├── src/
│   └── package.json
├── reverse-proxy/      # Serves deployed applications from S3
│   ├── .env.example
│   ├── src/
│   └── package.json
├── README.md
└── (other shared config files or root-level scripts)
```

## Contributing

Contributions are welcome\! If you find a bug or want to add a feature, please open an issue or submit a pull request.

## License

This project is licensed under the MIT License - see the [LICENSE](https://www.google.com/search?q=LICENSE) file for details. (If you have one, otherwise remove)

## Contact

Vedank Purohit - [vedankpurohit@gmail.com](mailto:vedankpurohit@gmail.com)
LinkedIn: [VedankPurohit](https://www.linkedin.com/in/vedankpurohit)
Project Link: [https://github.com/VedankPurohit/VercelClone](https://github.com/VedankPurohit/VercelClone)

-----
