'use strict';

module.exports = {
    Dataserve: require('./dataserve'),
    middleware: {
        encrypt: require('./middleware/encrypt'),
        sanitize: require('./middleware/sanitize'),
        validate: require('./middleware/validate'),
    },
};
