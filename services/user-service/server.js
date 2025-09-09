import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.join(__dirname, '../../proto/user.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const userProto = grpc.loadPackageDefinition(packageDefinition).user;


const users = new Map();


const userService = {
  GetUser: (call, callback) => {
    const { user_id } = call.request;
    
    console.log('GetUser called with user_id:', user_id);
    console.log("call request:", call.request);
    console.log('Available users:', Array.from(users.keys()));
    
    if (!user_id) {
      console.log('Error: User ID is required');
      return callback(null, {
        success: false,
        message: 'User ID is required',
        user: null
      });
    }

    const user = users.get(user_id);
    
    if (!user) {
      console.log('Error: User not found for ID:', user_id);
      return callback(null, {
        success: false,
        message: 'User not found',
        user: null
      });
    }

    console.log('User found:', user);
    callback(null, {
      success: true,
      message: 'User found',
      user: user
    });
  },

  CreateUser: (call, callback) => {
    const { name, email } = call.request;

    if (!name || !email) {
      return callback(null, {
        success: false,
        message: 'Name and email are required',
        user: null
      });
    }

    const user = {
      id: uuidv4(),
      name,
      email,
      created_at: new Date().toISOString()
    };

    users.set(user.id, user);

    console.log(`User created: ${user.name} (${user.id})`);

    callback(null, {
      success: true,
      message: 'User created successfully',
      user: user
    });
  },

  ListUsers: (call, callback) => {
    const userList = Array.from(users.values());
    
    callback(null, {
      success: true,
      message: `Found ${userList.length} users`,
      users: userList
    });
  }
};

// Create and start server
const server = new grpc.Server();
server.addService(userProto.UserService.service, userService);

const port = process.env.USER_SERVICE_PORT || 50051;
server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    console.error('Failed to start User Service:', err);
    return;
  }
  
  console.log(`User Service running on port ${port}`);
  server.start();
});


process.on('SIGINT', () => {
  console.log('\nShutting down User Service...');
  server.tryShutdown((error) => {
    if (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    } else {
      console.log('User Service shut down gracefully');
      process.exit(0);
    }
  });
});