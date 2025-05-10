// Importing required modules
import express from 'express'; // Importing Express framework for building web server
import mongoose from 'mongoose'; // Importing Mongoose to interact with MongoDB
import { createClient } from 'redis'; // Importing Redis client to handle caching

// Creating an Express app
const app = express(); // Initializing the Express app

// Middleware to parse incoming JSON requests
app.use(express.json()); // Automatically parse JSON in request bodies

// Connecting to Redis
const client = await createClient() // Creating and connecting a Redis client
    .on('error', (err) => console.log('Redis Client Error', err)) // Handling Redis connection errors
    .connect(); // Connecting the client to Redis server

// Connecting to MongoDB using Mongoose
mongoose.connect('mongodb://root:root@localhost:27017/node_cache?authSource=admin'); 
// Connecting to MongoDB at localhost with authentication, database name: node_cache

// Defining the schema for products collection
const productSchema = new mongoose.Schema({
    name: String, // Product name
    description: String, // Product description
    price: Number, // Product price
    category: String, // Product category
    specs: Object, // Product specifications (generic object)
});

// Creating a Product model from the schema
const Product = mongoose.model('Product', productSchema); // Compiling schema into a Mongoose model

// API endpoint to get products
app.get('/api/products', async (req, res) => {
    const key = generateCacheKey(req); // Generate a unique cache key based on request

    const cachedProducts = await client.get(key); // Check if response exists in Redis cache
    if (cachedProducts) { // If found in cache
        console.log('Cache hit'); // Log cache hit
        res.json(JSON.parse(cachedProducts)); // Send cached response
        return; // Exit early
    }
    console.log('Cache miss'); // Log cache miss

    const query = {}; // Initialize empty MongoDB query
    if (req.query.category) { // If category is passed in query string
        query.category = req.query.category; // Filter products by category
    }

    const products = await Product.find(query); // Fetch products from MongoDB using query

    if (products.length) { // If products are found
        await client.set(key, JSON.stringify(products)); // Store products in Redis cache
    }

    res.json(products); // Send fetched products as JSON response
});

// Helper function to generate a unique cache key based on URL and query params
function generateCacheKey(req) {
    const baseUrl = req.path.replace(/^\/+|\/+$/g, '').replace(/\//g, ':'); // Normalize path to baseKey (e.g., "api:products")
    const params = req.query; // Get query parameters
    const sortedParams = Object.keys(params) // Sort query params alphabetically
        .sort()
        .map((key) => `${key}=${params[key]}`) // Format params as key=value
        .join('&'); // Join all key=value pairs

    return sortedParams ? `${baseUrl}:${sortedParams}` : baseUrl; // Append sorted params to baseKey
}

// API endpoint to update a product by its ID
app.put('/api/products/:id', async (req, res) => {
    const productId = req.params.id; // Get product ID from URL params
    const updateData = req.body; // Get updated data from request body

    const updatedProduct = await Product.findByIdAndUpdate(
        productId, // Find product by ID
        { $set: updateData }, // Set new data
        { new: true } // Return the updated document
    );

    if (!updatedProduct) { // If product not found
        return res.status(404).json({
            success: false,
            message: 'Product not found', // Return error response
        });
    }

    const listCacheKey = 'api:products*'; // Key pattern to match cached product list entries
    const keys = await client.keys(listCacheKey); // Find all keys matching the pattern
    if (keys.length > 0) { // If matching keys exist
        await client.del(keys); // Delete them to invalidate cache
    }

    res.json({
        success: true,
        message: 'Product updated successfully', // Return success response
    });
});

// Start the server on port 4000
app.listen(4000, () => console.log('Server listening on port 4000')); // Server startup log
