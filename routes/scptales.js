const express = require('express');
const scpTalesRoutes = express.Router();
const dbo = require('../db/connection');

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

// Get all SCPTales (with pagination), or filter by tale_id if provided
scpTalesRoutes.route('/SCPTales').get(async function (req, res) {
    console.log('GET request received at /SCPTales');

    const dbConnect = dbo.getDb();
    if (!checkDbConnection(dbConnect, res)) return;

    try {
        const scpTaleId = req.query.tale_id;  // Get the tale_id from query parameters
        const page = parseInt(req.query.page) || 1;  // Get the page number, default to 1
        const limit = parseInt(req.query.limit) || 50;  // Number of results per page, default to 50
        const skip = (page - 1) * limit;  // Skip results from previous pages
        let scpTales;

        if (scpTaleId) {
            // If tale_id is provided, find the specific SCPTale by its tale_id
            scpTales = await dbConnect.collection('SCPTales').findOne({ tale_id: scpTaleId });

            if (!scpTales) {
                return res.status(404).send(`Tale with tale_id ${scpTaleId} not found.`);
            }
        } else {
            // If no tale_id is provided, fetch SCPTales with pagination
            scpTales = await dbConnect.collection('SCPTales')
                .find({})
                .skip(skip)
                .limit(limit)
                .toArray();
        }

        const totalCount = await dbConnect.collection('SCPTales').countDocuments();
        const totalPages = Math.ceil(totalCount / limit);

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
        const { tale_id, title, content, scp_id, rating, url } = req.body;

        // 1. Check if all SCPs exist
        const missingScps = await validateScpIds(dbConnect, scp_id);
        if (missingScps.length > 0) {
            return res.status(400).send(`SCP(s) not found: ${missingScps.join(', ')}`);
        }

        // 2. Insert the new tale
        const tale = { tale_id, title, content, scp_id, rating, url };
        const insertedTale = await dbConnect.collection('SCPTales').insertOne(tale);

        // 3. Update the related SCP(s)
        for (let scp of scp_id) {
            await dbConnect.collection('SCPs').updateOne(
                { scp_id: scp },
                {
                    $addToSet: { scp_tales: tale_id }
                }
            );
        }

        console.log(`Successfully added Tale with ID: ${tale_id}`);
        res.status(201).send(`Tale added successfully with ID: ${tale_id}`);
    } catch (error) {
        console.error('Error adding Tale and updating SCP(s):', error);
        res.status(500).send('Error adding Tale and updating SCP(s)');
    }
});

// Delete a Tale by tale_id
scpTalesRoutes.route('/SCPTales/:tale_id').delete(async function (req, res) {
    console.log('DELETE request received at /SCPTales/:tale_id');

    const dbConnect = dbo.getDb();
    if (!checkDbConnection(dbConnect, res)) return;

    const { tale_id } = req.params;

    try {
        // Find and delete the Tale
        const tale = await dbConnect.collection('SCPTales').findOne({ tale_id: tale_id });
        if (!tale) return res.status(404).send(`Tale with tale_id ${tale_id} not found.`);

        await dbConnect.collection('SCPTales').deleteOne({ tale_id: tale_id });

        // Remove the tale reference from related SCPs
        for (let scp of tale.scp_id) {
            await dbConnect.collection('SCPs').updateOne(
                { scp_id: scp },
                { $pull: { scp_tales: tale_id } }
            );
        }

        console.log(`Successfully deleted Tale with tale_id ${tale_id}`);
        res.status(200).send(`Tale with tale_id ${tale_id} deleted successfully!`);
    } catch (err) {
        console.error('Error deleting Tale:', err);
        res.status(500).send('Error deleting Tale!');
    }
});

// Update a Tale by tale_id (Partial Update)
scpTalesRoutes.route('/SCPTales/:tale_id').put(async function (req, res) {
    console.log('PUT request received at /SCPTales/:tale_id');

    const dbConnect = dbo.getDb();
    if (!checkDbConnection(dbConnect, res)) return;

    const { tale_id } = req.params;
    const updatedFields = req.body;

    if (Object.keys(updatedFields).length === 0) {
        return res.status(400).send('No fields provided to update.');
    }

    try {
        const existingTale = await dbConnect.collection('SCPTales').findOne({ tale_id: tale_id });
        if (!existingTale) return res.status(404).send(`Tale with tale_id ${tale_id} not found.`);

        await dbConnect.collection('SCPTales').updateOne(
            { tale_id: tale_id },
            { $set: updatedFields }
        );

        // Update related SCP(s) if `scp_id` is updated
        if (updatedFields.scp_id) {
            const removedScps = existingTale.scp_id.filter(scp => !updatedFields.scp_id.includes(scp));
            const addedScps = updatedFields.scp_id.filter(scp => !existingTale.scp_id.includes(scp));

            for (let scp of removedScps) {
                await dbConnect.collection('SCPs').updateOne(
                    { scp_id: scp },
                    { $pull: { scp_tales: tale_id } }
                );
            }

            for (let scp of addedScps) {
                await dbConnect.collection('SCPs').updateOne(
                    { scp_id: scp },
                    { $addToSet: { scp_tales: tale_id } }
                );
            }
        }

        console.log(`Successfully updated Tale with tale_id ${tale_id}`);
        res.status(200).send(`Tale with tale_id ${tale_id} updated successfully!`);
    } catch (err) {
        console.error('Error updating Tale:', err);
        res.status(500).send('Error updating Tale!');
    }
});

module.exports = scpTalesRoutes;
