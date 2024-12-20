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

// Get all SCPTales (with pagination), or filter by tale_id if provided
scpTalesRoutes.route('/SCPTales').get(async function (req, res) {
    console.log('GET request received at /SCPTales');

    const dbConnect = dbo.getDb();
    if (!checkDbConnection(dbConnect, res)) return;

    try {
        const scpTaleId = req.query.tale_id;  // Get the tale_id from query parameters
        const page = parseInt(req.query.page) || 1;  // Get the page number, default to 1
        const limit = parseInt(req.query.limit) || 50;  // Number of results per page
        const skip = (page - 1) * limit;  // Skip results from previous pages
        let scpTales;

        if (scpTaleId) {
            // If tale_id is provided, find the specific SCPTale by its tale_id
            scpTales = await dbConnect
                .collection('SCPTales')
                .findOne({ tale_id: scpTaleId });  // Use findOne to directly fetch the tale

            if (!scpTales) {
                // If no results are found, return a 404 error with a message
                return res.status(404).send(`Tale with tale_id ${scpTaleId} not found.`);
            }
        } else {
            // If no tale_id is provided, fetch SCPTales with pagination
            scpTales = await dbConnect
                .collection('SCPTales')
                .find({})
                .skip(skip)  // Skip to the correct page
                .limit(limit)  // Limit to 50 results per page
                .toArray();
        }

        if (scpTales.length === 0) {
            return res.status(404).send('No SCPTales found.');
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

// Update a Tale by tale_id (Partial Update)
scpTalesRoutes.route('/SCPTales/:tale_id').put(async function (req, res) {
    console.log('PUT request received at /SCPTales/:tale_id');

    const dbConnect = dbo.getDb();
    if (!dbConnect) {
        console.error('Database connection not established');
        return res.status(500).send('Database connection error');
    }

    const { tale_id } = req.params; // Get the tale_id from the URL parameters
    const updatedFields = req.body;  // Get the updated fields from the request body

    if (Object.keys(updatedFields).length === 0) {
        return res.status(400).send('No fields provided to update.');
    }

    try {
        // Find the existing tale by tale_id
        const existingTale = await dbConnect.collection('SCPTales').findOne({ tale_id: tale_id });

        if (!existingTale) {
            // If the tale doesn't exist, return a 404 error
            return res.status(404).send(`Tale with tale_id ${tale_id} not found.`);
        }

        // Update the tale with the provided fields
        const updateResult = await dbConnect.collection('SCPTales').updateOne(
            { tale_id: tale_id },
            { $set: updatedFields }  // Only update the fields provided in the request body
        );

        if (updateResult.modifiedCount === 0) {
            return res.status(400).send(`Tale with tale_id ${tale_id} was not updated.`);
        }

        // Optionally, update related SCP(s) if any field changes affect them (e.g., `scp_id`)
        if (updatedFields.scp_id) {
            // Handle updates to `scp_id` here, if necessary, like adding/removing tale references from SCPs
            const removedScps = existingTale.scp_id.filter(scp => !updatedFields.scp_id.includes(scp));
            const addedScps = updatedFields.scp_id.filter(scp => !existingTale.scp_id.includes(scp));

            for (let scp of removedScps) {
                await dbConnect.collection('SCPs').updateOne(
                    { scp_id: scp },
                    { $pull: { scp_tales: tale_id } } // Remove the tale reference from SCPs
                );
            }

            for (let scp of addedScps) {
                await dbConnect.collection('SCPs').updateOne(
                    { scp_id: scp },
                    { $addToSet: { scp_tales: tale_id } } // Add the tale reference to new SCPs
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
