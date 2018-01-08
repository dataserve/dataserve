'use strict';

module.exports = {
    Dataserve: require('./dataserve'),
    middleware: {
        sanitize: require('./middleware/sanitize'),
        validate: require('./middleware/validate'),
    },
};
