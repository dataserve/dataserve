'use strict';

module.exports = {
    Dataserve: require('./dataserve'),
    middleware: {
        lookup: require('./middleware/lookup'),
        sanitize: require('./middleware/sanitize'),
        validate: require('./middleware/validate'),
    },
};
