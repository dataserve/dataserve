'use strict';

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

class Result {

    constructor(status, result=null, meta={}) {
        if (status) {
            return this.setSuccess(result, meta);
        }

        return this.setError(result, meta);
    }

    isSuccess() {
        return this.status;
    }

    isError() {
        return !this.status;
    }
    
    setSuccess(result, meta={}) {
        this.status = true;
        
        this.result = result;

        this.meta = meta;

        return this;
    }

    setError(error, meta={}) {
        this.status = false;

        if (error instanceof Error) {
            //error = result.toString();
            error = error.stack;
        }

        this.error = error;

        this.meta = meta;

        return this;
    }

    getResult() {
        if (this.status) {
            return {
                status: true,
                result: this.result,
                meta: this.meta,
            };
        };

        return {
            status: false,
            error: this.error,
            meta: this.meta,
        };
    }
    
}

module.exports.Result = Result;
