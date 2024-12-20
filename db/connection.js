const { MongoClient } = require('mongodb');
const connectionString = "mongodb://127.0.0.1:27017";

const client = new MongoClient(connectionString);

let dbConnection;

module.exports = {
    connectToServer: async function () {
        try {
            const db = await client.connect();
            dbConnection = db.db('scp');
            console.log('Successfully connected to MongoDB.');
        } catch (error) {
            console.error('Error connecting to MongoDB:', error);
            throw error;
        }
    },
    
    getDb: function () {
        return dbConnection;
    }
};
