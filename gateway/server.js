import express from 'express';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json());

const USER_PROTO_PATH = path.join(__dirname, '../proto/user.proto');
const ORDER_PROTO_PATH = path.join(__dirname, '../proto/order.proto');

const userPackageDefinition = protoLoader.loadSync(USER_PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const orderPackageDefinition = protoLoader.loadSync(ORDER_PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const userProto = grpc.loadPackageDefinition(userPackageDefinition).user;
const orderProto = grpc.loadPackageDefinition(orderPackageDefinition).order;

const userClient = new userProto.UserService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

const orderClient = new orderProto.OrderService(
  'localhost:50052',
  grpc.credentials.createInsecure()
);

const handleGrpcError = (error, res) => {
  console.error('gRPC Error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: error.message
  });
};

app.post('/api/users', (req, res) => {
  const { name, email } = req.body;
  
  userClient.CreateUser({ name, email }, (error, response) => {
    if (error) {
      return handleGrpcError(error, res);
    }
    
    res.json(response);
  });
});

app.get('/api/users/:userId', (req, res) => {
  const { userId } = req.params;
  
  console.log('Gateway: Get user request for userId:', userId);
  console.log('Gateway: req.params:', req.params);
  
  if (!userId || userId === 'undefined' || userId === 'null' || userId.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Valid user ID is required',
      user: null
    });
  }
  
  const request = { user_id: userId.trim() };
  console.log('Gateway: Sending gRPC request:', request);
  
  userClient.GetUser(request, (error, response) => {
    if (error) {
      console.error('Gateway: gRPC error getting user:', error);
      return handleGrpcError(error, res);
    }
    
    console.log('Gateway: User service response:', response);
    res.json(response);
  });
});

app.get('/api/users', (req, res) => {
  userClient.ListUsers({}, (error, response) => {
    if (error) {
      return handleGrpcError(error, res);
    }
    
    res.json(response);
  });
});

app.post('/api/orders', (req, res) => {
  const { user_id, product_name, amount, quantity } = req.body;
  console.log("User id from create order gateway server",user_id);
  orderClient.CreateOrder({ 
    user_id, 
    product_name, 
    amount: parseFloat(amount),
    quantity: parseInt(quantity)
  }, (error, response) => {
    if (error) {
      return handleGrpcError(error, res);
    }
    
    res.json(response);
  });
});

app.get('/api/orders/:orderId', (req, res) => {
  const { orderId } = req.params;
  
  orderClient.GetOrder({ order_id: orderId }, (error, response) => {
    if (error) {
      return handleGrpcError(error, res);
    }
    
    res.json(response);
  });
});

app.get('/api/users/:userId/orders', (req, res) => {
  const { userId } = req.params;
  
  orderClient.GetOrdersByUser({ user_id: userId }, (error, response) => {
    if (error) {
      return handleGrpcError(error, res);
    }
    
    res.json(response);
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    services: {
      user_service: 'localhost:50051',
      order_service: 'localhost:50052'
    }
  });
});

app.get('/api/users/:userId/profile', async (req, res) => {
  const { userId } = req.params;
  
  try {
    const userPromise = new Promise((resolve, reject) => {
      userClient.GetUser({ user_id: userId }, (error, response) => {
        if (error) reject(error);
        else resolve(response);
      });
    });
    
    const ordersPromise = new Promise((resolve, reject) => {
      orderClient.GetOrdersByUser({ user_id: userId }, (error, response) => {
        if (error) reject(error);
        else resolve(response);
      });
    });
    
    const [userResponse, ordersResponse] = await Promise.all([userPromise, ordersPromise]);
    
    if (!userResponse.success) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'User profile retrieved successfully',
      data: {
        user: userResponse.user,
        orders: ordersResponse.orders || [],
        order_count: ordersResponse.orders ? ordersResponse.orders.length : 0
      }
    });
    
  } catch (error) {
    handleGrpcError(error, res);
  }
});

const port = process.env.GATEWAY_PORT || 3000;
app.listen(port, () => {
  console.log(`API Gateway running on port ${port}`);
  console.log(`Available endpoints:`);
  console.log(`  POST /api/users - Create user`);
  console.log(`  GET  /api/users - List all users`);
  console.log(`  GET  /api/users/:userId - Get user by ID`);
  console.log(`  POST /api/orders - Create order`);
  console.log(`  GET  /api/orders/:orderId - Get order by ID`);
  console.log(`  GET  /api/users/:userId/orders - Get user's orders`);
  console.log(`  GET  /api/users/:userId/profile - Get user profile with orders`);
  console.log(`  GET  /health - Health check`);
});

process.on('SIGINT', () => {
  console.log('\nShutting down API Gateway...');
  userClient.close();
  orderClient.close();
  process.exit(0);
});