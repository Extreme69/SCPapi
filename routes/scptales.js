const express = require('express');
const scpTalesRoutes = express.Router();
const dbo = require('../db/connection');

// Get all SCPTales (limit 50)
scpTalesRoutes.route('/SCPTales').get(async function (req, res) {
    console.log('GET request received at /SCPTales'); 

    const dbConnect = dbo.getDb();
    if (!dbConnect) {
        console.error('Database connection not established');
        return res.status(500).send('Database connection error');
    }

    try {
        const scpTaleId = req.query.tale_id; // Get the tale_id from query parameters
        let scpTales;

        if (scpTaleId) {
            // If tale_id is provided, find the specific SCPTale by its tale_id
            scpTales = await dbConnect
                .collection('SCPTales')
                .findOne({ tale_id: scpTaleId }); // Use findOne to directly fetch the tale

            if (!scpTales) {
                // If no results are found, return a 404 error with a message
                return res.status(404).send(`Tale with tale_id ${scpTaleId} not found.`);
            }
        } else {
            // If no tale_id is provided, fetch the first 50 SCPTales
            scpTales = await dbConnect
                .collection('SCPTales')
                .find({})
                .limit(50)
                .toArray();
        }

        console.log('Successfully fetched SCPTales');
        res.json(scpTales);
    } catch (err) {
        console.error('Error fetching SCPTales:', err);
        res.status(500).send('Error fetching SCPTales!');
    }
});

// Add a new Tale and update related SCP(s)
scpTalesRoutes.route('/SCPTales').post(async function (req, res) {
    const dbConnect = dbo.getDb();
    if (!dbConnect) {
        console.error('Database connection not established');
        return res.status(500).send('Database connection error');
    }

    try {
        const { tale_id, title, content, scp_id, rating, url } = req.body;

        // 1. Check if all SCPs exist
        const missingScps = [];
        if (scp_id && Array.isArray(scp_id)) {
            for (let scp of scp_id) {
                const scpExists = await dbConnect.collection('SCPs').findOne({ scp_id: scp });
                if (!scpExists) {
                    missingScps.push(scp);
                }
            }
        }

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
                    $addToSet: { scp_tales: tale_id } // Add `tale_id` to `scp_tales` if not already present
                }
            );
        }

        console.log(`Successfully added Tale with ID: ${tale_id}`);
        res.status(201).send(`Tale added successfully with ID: ${tale_id}`);
    } catch (error) {
        console.error('Error adding Tale and updating SCP(s):', error);

        // Log the validation error details for debugging
        if (error.errInfo?.details) {
            console.error('Validation Error Details:', JSON.stringify(error.errInfo.details, null, 2));
        }

        res.status(500).send('Error adding Tale and updating SCP(s)');
    }
});

// Delete a Tale by tale_id
scpTalesRoutes.route('/SCPTales/:tale_id').delete(async function (req, res) {
    console.log('DELETE request received at /SCPTales/:tale_id');

    const dbConnect = dbo.getDb();
    if (!dbConnect) {
        console.error('Database connection not established');
        return res.status(500).send('Database connection error');
    }

    const { tale_id } = req.params; // Get the tale_id from the URL parameters

    try {
        // First, find the Tale to check if it exists
        const tale = await dbConnect.collection('SCPTales').findOne({ tale_id: tale_id });

        if (!tale) {
            // If the tale doesn't exist, return a 404 error with a message
            return res.status(404).send(`Tale with tale_id ${tale_id} not found.`);
        }

        // Remove the tale from the "SCPTales" collection
        const result = await dbConnect.collection('SCPTales').deleteOne({ tale_id: tale_id });

        // Optionally, remove the tale reference from related SCPs' `scp_tales` arrays
        if (tale.scp_id && Array.isArray(tale.scp_id)) {
            for (let scp of tale.scp_id) {
                await dbConnect.collection('SCPs').updateOne(
                    { scp_id: scp },
                    { $pull: { scp_tales: tale_id } } // Remove `tale_id` from the `scp_tales` array of the associated SCPs
                );
            }
        }

        console.log(`Successfully deleted Tale with tale_id ${tale_id}`);
        res.status(200).send(`Tale with tale_id ${tale_id} deleted successfully!`);
    } catch (err) {
        console.error('Error deleting Tale:', err);
        res.status(500).send('Error deleting Tale!');
    }
});

module.exports = scpTalesRoutes;
