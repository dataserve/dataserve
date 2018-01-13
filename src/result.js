'use strict';

const { Result } = require('../../js-client');

module.exports.Result = Result;

module.exports.resultHandler = model => next => obj => {
    return next(obj).then((result) => {
        if (result instanceof Result) {
            return result;
        }

        if (Array.isArray(result)) {
            return new Result(true, ...result);
        }

        return new Result(true, result);
    }).catch((result) => {
        if (result instanceof Result) {
            return result;
        }

        if (Array.isArray(result)) {
            return new Result(false, ...result);
        }

        return new Result(false, result);
    });
}
