'use strict';

module.exports = {
    Dataserve: require('./dataserve'),
    middleware: {
        encrypt: require('./middleware/encrypt'),
        generate: require('./middleware/generate'),
        sanitize: require('./middleware/sanitize'),
        validate: require('./middleware/validate'),
    },
};
