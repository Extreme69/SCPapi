const express = require('express');
const app = express();

app.use(express.json());

app.use((req, res, next) => {
    console.log(`${req.method} request to ${req.url}`);
    next();
});

app.use(function (err, req, res, next) {
    console.error(err.stack);
    res.status(500).send('An error occurred!');
});

app.use(require('./routes/scp'));
app.use(require('./routes/scptales'));

const PORT = 3000;
const dbo = require('./db/connection');

dbo.connectToServer()
    .then(() => {
        app.listen(PORT, () => {
            console.log('Server is running on port: ' + PORT);
        });
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });


process.on('unhandledRejection', (reason, promise) => {
console.error('Unhandled Rejection:', reason);
});
