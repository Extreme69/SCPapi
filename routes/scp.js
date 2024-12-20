const express = require('express');
const scpRoutes = express.Router();
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

// Get all SCPs (with pagination), or filter by series if provided
scpRoutes.route('/SCPs').get(async function (req, res) {
    console.log('GET request received at /SCPs');

    const dbConnect = dbo.getDb();
    if (!checkDbConnection(dbConnect, res)) return;

    try {
        const scpId = req.query.scp_id; // Get the scp_id from query parameters
        const series = req.query.series; // Get the series from query parameters
        const page = parseInt(req.query.page) || 1; // Get the page number, default to 1
        const limit = parseInt(req.query.limit) || 50; // Get the limit from query parameters, default to 50
        const skip = (page - 1) * limit; // Skip results from previous pages

        // Validate page number
        if (page < 1) {
            return res.status(400).json({ error: 'Page number must be 1 or greater.' });
        }

        // Validate limit
        if (limit < 1) {
            return res.status(400).json({ error: 'Limit must be 1 or greater.' });
        }

        const query = {};
        if (scpId) query.scp_id = scpId;
        if (series) query.series = series;

        // Get total count for pagination metadata
        const total = await dbConnect.collection('SCPs').countDocuments(query);
        if (total === 0) {
            return res.status(404).json({ error: 'No SCPs found for the given criteria.' });
        }

        const totalPages = Math.ceil(total / limit);

        // Fetch SCPs
        const SCPs = await dbConnect
            .collection('SCPs')
            .find(query)
            .skip(skip)
            .limit(limit)
            .toArray();

        console.log('Successfully fetched SCPs');
        res.json({
            totalPages,
            currentPage: page,
            data: SCPs,
        });
    } catch (err) {
        console.error('Error fetching SCPs:', err);
        res.status(500).send('Error fetching SCPs!');
    }
});

// Add a new SCP
scpRoutes.route('/SCPs').post(async function (req, res) {
    console.log('POST request received at /SCPs');

    const dbConnect = dbo.getDb();
    if (!checkDbConnection(dbConnect, res)) return;

    const newSCP = req.body; // Get the new SCP data from the request body

    if (!newSCP || !newSCP.scp_id || !newSCP.title || !newSCP.description) {
        // Ensure that necessary fields are provided
        return res.status(400).send('Missing required fields: scp_id, title, description');
    }

    try {
        // Insert the new SCP into the "SCPs" collection
        const result = await dbConnect
            .collection('SCPs')
            .insertOne(newSCP);

        console.log('Successfully added new SCP');
        res.status(201).send(`SCP with scp_id ${newSCP.scp_id} added successfully!`);
    } catch (err) {
        console.error('Error adding SCP:', err);
        res.status(500).send('Error adding SCP!');
    }
});

// Delete an SCP by scp_id
scpRoutes.route('/SCPs/:scp_id').delete(async function (req, res) {
    console.log('DELETE request received at /SCPs/:scp_id');

    const dbConnect = dbo.getDb();
    if (!checkDbConnection(dbConnect, res)) return;

    const { scp_id } = req.params;  // Get the scp_id from the URL parameters

    try {
        // Attempt to delete the SCP with the specified scp_id
        const result = await dbConnect
            .collection('SCPs')
            .deleteOne({ scp_id: scp_id });

        if (result.deletedCount === 0) {
            // If no documents were deleted, that means the SCP with the provided scp_id doesn't exist
            return res.status(404).send(`SCP with scp_id ${scp_id} not found.`);
        }

        console.log(`Successfully deleted SCP with scp_id ${scp_id}`);
        res.status(200).send(`SCP with scp_id ${scp_id} deleted successfully!`);
    } catch (err) {
        console.error('Error deleting SCP:', err);
        res.status(500).send('Error deleting SCP!');
    }
});

// Update an SCP by scp_id
scpRoutes.route('/SCPs/:scp_id').put(async function (req, res) {
    console.log('PUT request received at /SCPs/:scp_id');

    const dbConnect = dbo.getDb();
    if (!checkDbConnection(dbConnect, res)) return;

    const { scp_id } = req.params;  // Get the scp_id from the URL parameters
    const updatedSCP = req.body;    // Get the updated SCP data from the request body

    try {
        // Check if the SCP exists
        const existingSCP = await dbConnect
            .collection('SCPs')
            .findOne({ scp_id: scp_id });

        if (!existingSCP) {
            // If the SCP doesn't exist, return a 404 error with a message
            return res.status(404).send(`SCP with scp_id ${scp_id} not found.`);
        }

        // Filter only the fields that are being updated
        const updateFields = {};
        if (updatedSCP.scp_id) updateFields.scp_id = updatedSCP.scp_id;
        if (updatedSCP.title) updateFields.title = updatedSCP.title;
        if (updatedSCP.description) updateFields.description = updatedSCP.description;
        if (updatedSCP.classification) updateFields.classification = updatedSCP.classification;
        if (updatedSCP.rating) updateFields.rating = updatedSCP.rating;
        if (updatedSCP.url) updateFields.url = updatedSCP.url;
        if (updatedSCP.series) updateFields.series = updatedSCP.series;
        if (updatedSCP.photo_url) updateFields.photo_url = updatedSCP.photo_url;

        // Update the SCP in the collection
        const result = await dbConnect
            .collection('SCPs')
            .updateOne(
                { scp_id: scp_id }, // Filter by scp_id
                { $set: updateFields } // Update only the provided fields
            );

        if (result.modifiedCount === 0) {
            // If no modifications were made, return a 400 error
            return res.status(400).send(`SCP with scp_id ${scp_id} was not updated.`);
        }

        console.log(`Successfully updated SCP with scp_id ${scp_id}`);
        res.status(200).send(`SCP with scp_id ${scp_id} updated successfully!`);
    } catch (err) {
        console.error('Error updating SCP:', err);
        res.status(500).send('Error updating SCP!');
    }
});

module.exports = scpRoutes;