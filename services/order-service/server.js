import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ORDER_PROTO_PATH = path.join(__dirname, '../../proto/order.proto');
const USER_PROTO_PATH = path.join(__dirname, '../../proto/user.proto');


const orderPackageDefinition = protoLoader.loadSync(ORDER_PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
});

const userPackageDefinition = protoLoader.loadSync(USER_PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
});

const orderProto = grpc.loadPackageDefinition(orderPackageDefinition).order;
const userProto = grpc.loadPackageDefinition(userPackageDefinition).user;

const userClient = new userProto.UserService(
    'localhost:50051',
    grpc.credentials.createInsecure()
);

const orders = new Map(); // Using in-memory storage for orders

const verifyUser=(userId)=>{
    return new Promise((resolve, reject) => {
        userClient.GetUser({ user_id: userId }, (error, response) => {
            if (error) {
                return reject(error);
            }
            resolve(response.user);
        });
    });
};

const orderService = {
    CreateOrder: async (call, callback) => {
        const { user_id, product_name, amount, quantity } = call.request;
        console.log("User id from create order service",user_id);
        if(!user_id || !product_name || !amount || !quantity) {
            return callback(null, {
                success: false,
                message: "User ID, Product Name, Amount and Quantity are required",
                order: null,
            });
        }

        try {
            const userReponse=await verifyUser(user_id);
            console.log("User verified:",userReponse);
            if(!userReponse){
                return callback(null, {
                    success: false,
                    message: "Invalid User ID",
                    order: null,
                });
            }

            const order={
                id:uuidv4(),
                user_id,
                product_name,
                amount,
                quantity,
                status:'pending',
                created_at:new Date().toISOString(),
            };

            orders.set(order.id, order);

            console.log(`Order created: ${order.id} for User: ${user_id}`);

            callback(null, {
                success: true,
                message: "Order created successfully",
                order,
            });
        } catch (error) {
            console.log(`Error creating order: ${error}`);
            callback(null, {
                success: false,
                message: error.message,
                order: null,
            });
        }
    },
    GetOrder: (call, callback) => {
        const { order_id } = call.request;

        if (!order_id) {
            return callback(null, {
                success: false,
                message: "Order ID is required",
                order: null,
            });
        }

        const order = orders.get(order_id);
        if (!order) {
            return callback(null, {
                success: false,
                message: "Order not found",
                order: null,
            });
        }

        callback(null, {
            success: true,
            message: "Order retrieved successfully",
            order,
        });
    },
    GetOrdersByUser: (call, callback) => {
        const { user_id } = call.request;

        if (!user_id) {
            return callback(null, {
                success: false,
                message: "User ID is required",
                orders: [],
            });
        }

        const userOrders = Array.from(orders.values()).filter(order => order.user_id === user_id);

        callback(null, {
            success: true,
            message: "Orders retrieved successfully",
            orders: userOrders,
        });
    },
};


const server = new grpc.Server();

server.addService(orderProto.OrderService.service, orderService);

const port = process.env.ORDER_SERVICE_PORT || '50052';

server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    console.error('Failed to start Order Service:', err);
    return;
  }
  
  console.log(`Order Service running on port ${port}`);
  server.start();
});

process.on('SIGINT', () => {
  console.log('\nShutting down Order Service...');
  userClient.close();
  server.tryShutdown((error) => {
    if (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    } else {
      console.log('Order Service shut down gracefully');
      process.exit(0);
    }
  });
});
