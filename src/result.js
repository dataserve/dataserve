'use strict';

const { Result } = require('dataserve-client');

function createResult(status=null, data=null, meta={}) {
    meta.generatedBy = 'dataserve';

    return new Result(status, data, meta);
}

module.exports.createResult = createResult;

module.exports.Result = Result;

module.exports.resultHandler = model => next => obj => {
    return next(obj).then((result) => {
        if (result instanceof Result) {
            return result;
        }

        if (Array.isArray(result)) {
            return createResult(true, ...result);
        }

        return createResult(true, result);
    }).catch((result) => {
        if (result instanceof Result) {
            return result;
        }

        if (Array.isArray(result)) {
            return createResult(false, ...result);
        }

        return createResult(false, result);
    });
}
