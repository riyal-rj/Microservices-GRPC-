# gRPC Microservices Project with API Gateway

This project demonstrates a microservices architecture using gRPC for inter-service communication and a RESTful API Gateway as the public-facing entry point.

## Architecture Overview

The system consists of three main components:

1.  **User Service**: A gRPC microservice responsible for all user-related operations (create, read).
2.  **Order Service**: A gRPC microservice responsible for all order-related operations. It communicates with the User Service to validate user existence.
3.  **API Gateway**: An Express.js server that exposes a REST API to the outside world. It translates incoming HTTP requests into gRPC calls to the appropriate backend microservices.

### Communication Flow

The services run on different ports and communicate as follows:

*   **Clients (e.g., a web browser)** talk to the **API Gateway** using standard HTTP/REST (e.g., on port `3000`).
*   The **API Gateway** acts as a gRPC *client*. It forwards requests to the appropriate microservice using gRPC.
*   The **User Service** runs as a gRPC *server* on port `50051`.
*   The **Order Service** runs as a gRPC *server* on port `50052`.
*   The **Order Service** also acts as a gRPC *client* to the **User Service** to verify user data.

Here is a simple diagram of the architecture:

```
[Client] <-- HTTP/REST --> [API Gateway (:3000)] --+-- gRPC --> [User Service (:50051)]
                                                   |
                                                   +-- gRPC --> [Order Service (:50052)] -- gRPC --> [User Service (:50051)]
```

---

## Component Details

### 1. User Service

*   **Directory**: `services/user-service/`
*   **File**: `server.js`
*   **Port**: `50051`

This is a standalone gRPC server. As seen in its `server.js`, it binds to port `50051` and exposes gRPC methods for creating, retrieving, and listing users. It maintains its own data in memory.

```javascript
// services/user-service/server.js
const server = new grpc.Server();
server.addService(userProto.UserService.service, userService);

const port = process.env.USER_SERVICE_PORT || 50051;
server.bindAsync(`0.0.0.0:${port}`, ...);
```

### 2. Order Service

*   **Directory**: `services/order-service/`
*   **File**: `server.js`
*   **Port**: `50052`

This service also runs as a gRPC server, binding to port `50052`. Its primary role is to manage orders.

A key feature, visible in its `server.js`, is that it performs **service-to-service communication**. Before creating an order, it acts as a gRPC client to call the `GetUser` method on the **User Service** (`localhost:50051`) to ensure the user exists.

```javascript
// services/order-service/server.js

// Acts as a client to the User Service
const userClient = new userProto.UserService(
    'localhost:50051',
    grpc.credentials.createInsecure()
);

// Acts as a server for its own service
const server = new grpc.Server();
server.addService(orderProto.OrderService.service, orderService);
const port = process.env.ORDER_SERVICE_PORT || '50052';
server.bindAsync(`0.0.0.0:${port}`, ...);
```

### 3. API Gateway

*   **Directory**: `gateway/`
*   **File**: `server.js`
*   **Port**: `3000`

This is the system's front door. It's an Express.js application that listens for HTTP requests on port `3000`. It does **not** implement any business logic itself. Instead, its `server.js` shows that it creates gRPC clients for both the User Service and the Order Service.

When it receives an HTTP request (e.g., `GET /api/users/:userId`), it translates it into a gRPC call to the corresponding service and converts the gRPC response back into JSON for the original client.

```javascript
// gateway/server.js

// Client for User Service
const userClient = new userProto.UserService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

// Client for Order Service
const orderClient = new orderProto.OrderService(
  'localhost:50052',
  grpc.credentials.createInsecure()
);

// Example: Translating REST to gRPC
app.get('/api/users/:userId', (req, res) => {
  const { userId } = req.params;
  // Make gRPC call to User Service
  userClient.GetUser({ user_id: userId }, (error, response) => {
    // ... handle response
  });
});
```

---

## How to Run

1.  **Install Dependencies**: From the project's root directory, run the following command to install all necessary packages for the services and gateway:
    ```bash
    npm install
    ```

2.  **Start All Services (Development Mode)**: To start the User Service, Order Service, and API Gateway all at once, run the following command from the root directory:
    ```bash
    npm run dev
    ```
    This uses `concurrently` and `nodemon` to run all services in parallel with hot-reloading, which is ideal for development.

3.  **(Optional) Run Services Individually**: If you need to run each service in a separate terminal, you can use these commands from the root directory:
    *   `npm run start:user`
    *   `npm run start:order`
    *   `npm run start:gateway`

4.  **Interact with the API**: You can now send HTTP requests to the API Gateway on `http://localhost:3000`. A list of available endpoints is printed when the gateway starts.
