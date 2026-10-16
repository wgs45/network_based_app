const express = require("express");
const router = express.Router();

// Middleware log before and after the request
router.use((req, res, next) => {
    const beforeTime = new Date().toISOString();
    console.log(`[BEFORE] Request received at: ${beforeTime}`);

    res.on("finish", () => {
        const afterTime = new Date().toISOString();
        console.log(`[AFTER] Request received at: ${afterTime}`);
    });

    next();
})

router.get('/', (req, res) => {
    res.send("hello from the /test route!");
})

module.exports = router;