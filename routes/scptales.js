const express = require('express');
const scpTalesRoutes = express.Router();
const dbo = require('../db/connection');
const { ObjectId } = require('mongodb');

// Helper function for DB connection check
const checkDbConnection = (dbConnect, res) => {
    if (!dbConnect) {
        console.error('Database connection not established');
        res.status(500).send('Database connection error');
        return false;
    }
    return true;
};

// Helper function for validating SCP IDs
const validateScpIds = async (dbConnect, scpIds) => {
    const missingScps = [];
    if (scpIds && Array.isArray(scpIds)) {
        for (let scp of scpIds) {
            const scpExists = await dbConnect.collection('SCPs').findOne({ scp_id: scp });
            if (!scpExists) {
                missingScps.push(scp);
            }
        }
    }
    return missingScps;
};

// Get all SCPTales (with pagination and search), or filter by _id if provided
scpTalesRoutes.route('/SCPTales').get(async function (req, res) {
    console.log('GET request received at /SCPTales');

    const dbConnect = dbo.getDb();
    if (!checkDbConnection(dbConnect, res)) return;

    try {
        const scpTaleId = req.query._id;  // Get the _id from query parameters
        const search = req.query.search;  // Get the search term from query parameters
        const page = parseInt(req.query.page) || 1;  // Get the page number, default to 1
        const limit = parseInt(req.query.limit) || 50;  // Number of results per page, default to 50
        const skip = (page - 1) * limit;  // Skip results from previous pages
        let scpTales;

        // Validate page number
        if (page < 1) {
            return res.status(400).json({ error: 'Page number must be 1 or greater.' });
        }

        // Validate limit
        if (limit < 1) {
            return res.status(400).json({ error: 'Limit must be 1 or greater.' });
        }

        const query = {};

        if (scpTaleId) {
            // If _id is provided, find the specific SCPTale by its _id
            try {
                query._id = new ObjectId(scpTaleId);  // Convert _id to ObjectId
            } catch (error) {
                return res.status(400).json({ error: 'Invalid ObjectId format for _id.' });
            }
        }

        // Add text search if the search query is provided
        if (search) {
            query.$text = { $search: search };  // MongoDB text search
        }

        // Fetch total count for pagination metadata
        const totalCount = await dbConnect.collection('SCPTales').countDocuments(query);
        if (totalCount === 0) {
            return res.status(404).send(`No SCPTales found for the given criteria.`);
        }

        const totalPages = Math.ceil(totalCount / limit);

        // Fetch SCPTales with pagination and search
        scpTales = await dbConnect.collection('SCPTales')
            .find(query)
            .skip(skip)
            .limit(limit)
            .toArray();

        res.json({ totalPages, currentPage: page, data: scpTales });
    } catch (err) {
        console.error('Error fetching SCPTales:', err);
        res.status(500).send('Error fetching SCPTales!');
    }
});

// Add a new Tale and update related SCP(s)
scpTalesRoutes.route('/SCPTales').post(async function (req, res) {
    const dbConnect = dbo.getDb();
    if (!checkDbConnection(dbConnect, res)) return;

    try {
        const { title, content, scp_id, rating, url } = req.body;

        // 1. Check if all SCPs exist
        const missingScps = await validateScpIds(dbConnect, scp_id);
        if (missingScps.length > 0) {
            return res.status(400).send(`SCP(s) not found: ${missingScps.join(', ')}`);
        }

        // 2. Insert the new tale
        const tale = { title, content, scp_id, rating, url };
        const insertedTale = await dbConnect.collection('SCPTales').insertOne(tale);
        
        try{
            // 3. Update the related SCP(s)
            for (let scp of scp_id) {
                await dbConnect.collection('SCPs').updateOne(
                    { scp_id: scp },
                    { $addToSet: { scp_tales: insertedTale.insertedId.toString() } }
                );
            }
        } catch (error){
            console.error('Error updating SCP(s):', error);
            return res.status(500).send('Error updating SCP(s)');
        }


        console.log(`Successfully added Tale with ID: ${insertedTale.insertedId}`);
        res.status(201).send(`Tale added successfully with ID: ${insertedTale.insertedId}`);
    } catch (error) {
        console.error('Error adding Tale with and updating SCP(s):', error);
        res.status(500).send('Error adding Tale and updating SCP(s)');
    }
});

// Delete a Tale by _id
scpTalesRoutes.route('/SCPTales/:id').delete(async function (req, res) {
    console.log('DELETE request received at /SCPTales/:id');

    const dbConnect = dbo.getDb();
    if (!checkDbConnection(dbConnect, res)) return;

    const { id } = req.params; // Get the _id from the request parameters

    try {
        // Convert the id to ObjectId type
        const objectId = new ObjectId(id);

        // Find and delete the Tale
        const tale = await dbConnect.collection('SCPTales').findOne({ _id: objectId });
        if (!tale) return res.status(404).send(`Tale with _id ${id} not found.`);

        await dbConnect.collection('SCPTales').deleteOne({ _id: objectId });

        // Remove the tale reference from related SCPs
        for (let scp of tale.scp_id) {
            await dbConnect.collection('SCPs').updateOne(
                { scp_id: scp },
                { $pull: { scp_tales: objectId.toString() } } // Use ObjectId here instead of tale_id
            );
        }

        console.log(`Successfully deleted Tale with _id ${id}`);
        res.status(200).send(`Tale with _id ${id} deleted successfully!`);
    } catch (err) {
        console.error('Error deleting Tale:', err);
        res.status(500).send('Error deleting Tale!');
    }
});

// Update a Tale by _id (Partial Update)
scpTalesRoutes.route('/SCPTales/:id').put(async function (req, res) {
    console.log('PUT request received at /SCPTales/:id');

    const dbConnect = dbo.getDb();
    if (!checkDbConnection(dbConnect, res)) return;

    const { id } = req.params;  // Get the _id from request parameters
    const updatedFields = req.body;

    if (Object.keys(updatedFields).length === 0) {
        return res.status(400).send('No fields provided to update.');
    }

    try {
        // Convert the id to ObjectId type
        const objectId = new ObjectId(id);

        const existingTale = await dbConnect.collection('SCPTales').findOne({ _id: objectId });
        if (!existingTale) return res.status(404).send(`Tale with _id ${id} not found.`);

        // Validate SCP IDs before making any changes
        if (updatedFields.scp_id) {
            const missingScps = await validateScpIds(dbConnect, updatedFields.scp_id);
            if (missingScps.length > 0) {
                return res.status(400).send(
                    `Cannot update Tale: the following SCP IDs do not exist: ${missingScps.join(', ')}`
                );
            }
        }

        // Proceed with the update since all SCP IDs are valid
        await dbConnect.collection('SCPTales').updateOne(
            { _id: objectId },
            { $set: updatedFields }
        );

        // Update related SCP(s) if `scp_id` is updated
        if (updatedFields.scp_id) {
            const removedScps = existingTale.scp_id.filter(scp => !updatedFields.scp_id.includes(scp));
            const addedScps = updatedFields.scp_id.filter(scp => !existingTale.scp_id.includes(scp));

            for (let scp of removedScps) {
                await dbConnect.collection('SCPs').updateOne(
                    { scp_id: scp },
                    { $pull: { scp_tales: objectId.toString() } }
                );
            }

            for (let scp of addedScps) {
                await dbConnect.collection('SCPs').updateOne(
                    { scp_id: scp },
                    { $addToSet: { scp_tales: objectId.toString() } }
                );
            }
        }

        console.log(`Successfully updated Tale with _id ${id}`);
        res.status(200).send(`Tale with _id ${id} updated successfully!`);
    } catch (err) {
        console.error('Error updating Tale:', err);
        res.status(500).send('Error updating Tale!');
    }
});

module.exports = scpTalesRoutes;
