const express = require('express');
const scpRoutes = express.Router();
const dbo = require('../db/connection');

// Helper function for DB connection check
const checkDbConnection = (dbConnect, res) => {
    if (!dbConnect) {
        console.error('Database connection not established');
        res.status(500).json({ status: 'error', message: 'Database connection error' });
        return false;
    }
    return true;
};

// Helper function to format responses
const createResponse = (status, message, data = null) => ({ status, message, data });

scpRoutes.route('/SCPs').get(async function (req, res) {
    console.log('GET request received at /SCPs');

    const dbConnect = dbo.getDb();
    if (!checkDbConnection(dbConnect, res)) return;

    try {
        const scpId = req.query.scp_id; // Get the scp_id from query parameters
        const series = req.query.series; // Get the series from query parameters
        const search = req.query.search; // Get the search term from query parameters
        const page = parseInt(req.query.page) || 1; // Get the page number, default to 1
        const limit = parseInt(req.query.limit) || 50; // Get the limit from query parameters, default to 50
        const skip = (page - 1) * limit; // Skip results from previous pages

        // Validate page and limit
        if (page < 1 || limit < 1) {
            return res.status(400).json(createResponse('error', 'Invalid pagination parameters.'));
        }

        const query = {};
        if (scpId) query.scp_id = scpId;
        if (series) query.series = series;

        // Add text search if the search query is provided
        if (search) {
            query.$text = { $search: search };
        }

        // Get total count for pagination metadata
        const total = await dbConnect.collection('SCPs').countDocuments(query);
        if (total === 0) {
            return res.status(404).json(createResponse('error', 'No SCPs found for the given criteria.'));
        }

        const totalPages = Math.ceil(total / limit);

        // Fetch SCPs
        const SCPs = await dbConnect
            .collection('SCPs')
            .find(query)
            .skip(skip)
            .limit(limit)
            .sort({ scp_id: 1 })
            .toArray();

        console.log('Successfully fetched SCPs');
        res.json(createResponse('success', 'SCPs retrieved successfully', {
            totalPages,
            currentPage: page,
            data: SCPs,
        }));
    } catch (err) {
        console.error('Error fetching SCPs:', err);
        res.status(500).json(createResponse('error', 'Error fetching SCPs.'));
    }
});

// Add a new SCP
scpRoutes.route('/SCPs').post(async function (req, res) {
    console.log('POST request received at /SCPs');

    const dbConnect = dbo.getDb();
    if (!checkDbConnection(dbConnect, res)) return;

    const newSCP = req.body; // Get the new SCP data from the request body

    if (!newSCP || !newSCP.scp_id || !newSCP.title || !newSCP.description) {
        return res.status(400).json(createResponse('error', 'Missing required fields: scp_id, title, description.'));
    }

    try {
        // Insert the new SCP into the "SCPs" collection
        const result = await dbConnect
            .collection('SCPs')
            .insertOne(newSCP);

        console.log('Successfully added new SCP');
        res.status(201).json(createResponse('success', `SCP with scp_id ${newSCP.scp_id} added successfully!`));
    } catch (err) {
        console.error('Error adding SCP:', err);
        res.status(500).json(createResponse('error', 'Error adding SCP.'));
    }
});

// Delete an SCP by scp_id
scpRoutes.route('/SCPs/:scp_id').delete(async function (req, res) {
    console.log('DELETE request received at /SCPs/:scp_id');

    const dbConnect = dbo.getDb();
    if (!checkDbConnection(dbConnect, res)) return;

    const { scp_id } = req.params;

    try {
        const result = await dbConnect
            .collection('SCPs')
            .deleteOne({ scp_id });

        if (result.deletedCount === 0) {
            return res.status(404).json(createResponse('error', `SCP with scp_id ${scp_id} not found.`));
        }

        console.log(`Successfully deleted SCP with scp_id ${scp_id}`);
        res.status(200).json(createResponse('success', `SCP with scp_id ${scp_id} deleted successfully.`));
    } catch (err) {
        console.error('Error deleting SCP:', err);
        res.status(500).json(createResponse('error', 'Error deleting SCP.'));
    }
});

// Update an SCP by scp_id
scpRoutes.route('/SCPs/:scp_id').put(async function (req, res) {
    console.log('PUT request received at /SCPs/:scp_id');

    const dbConnect = dbo.getDb();
    if (!checkDbConnection(dbConnect, res)) return;

    const { scp_id } = req.params;
    const updatedSCP = req.body;

    try {
        const existingSCP = await dbConnect
            .collection('SCPs')
            .findOne({ scp_id });

        if (!existingSCP) {
            return res.status(404).json(createResponse('error', `SCP with scp_id ${scp_id} not found.`));
        }

        const updateFields = {};
        for (const key of [
            'scp_id',
            'title',
            'description',
            'classification',
            'rating',
            'url',
            'series',
            'photo_url',
            'creator' // Include the 'creator' field
        ]) {
            if (updatedSCP[key] !== undefined) updateFields[key] = updatedSCP[key];
        }

        const result = await dbConnect
            .collection('SCPs')
            .updateOne({ scp_id }, { $set: updateFields });

        if (result.modifiedCount === 0) {
            return res.status(400).json(createResponse('error', `SCP with scp_id ${scp_id} was not updated.`));
        }

        console.log(`Successfully updated SCP with scp_id ${scp_id}`);
        res.status(200).json(createResponse('success', `SCP with scp_id ${scp_id} updated successfully.`));
    } catch (err) {
        console.error('Error updating SCP:', err);
        res.status(500).json(createResponse('error', 'Error updating SCP.'));
    }
});

module.exports = scpRoutes;
