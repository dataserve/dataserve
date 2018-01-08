'use strict';

const Promise = require('bluebird');

const Hooks = require('./hooks');

const modelMiddleware = {};

module.exports.middlewareHandler = middlewareLookup => model => next => obj => {
    if (modelMiddleware[model]) {
        return modelMiddleware[model].run(next, obj);
    }

    let middleware = model.getMiddleware();

    if (!middleware) {
        return next(obj);
    }
    
    modelMiddleware[model] = new Middleware(model, middleware, middlewareLookup);

    return modelMiddleware[model].run(next, obj);
}

class Middleware {

    constructor(model, middleware, middlewareLookup) {
        this.model = model;

        this.middlewareLookup = middlewareLookup;

        this.middleware = {};

        this.hooks = {};

        for (let mw of middleware) {
            if (!this.middlewareLookup || !this.middlewareLookup[mw]) {
                throw new Error(`missing middlware definition for '${mw}'`);
            }

            this.middleware[mw] = new this.middlewareLookup[mw](this.model);
        }

    }

    run(next, obj) {
        let hooks = this.getHooks(obj.command);

        return hooks.runPre(obj)
            .then(output => {
                return next(obj)
                    .then(output => {
                        if (typeof output.status !== "undefined" && !output.status) {
                            return output;
                        }
                        
                        return hooks.runPost(output);
                    });
            })
            .catch(output => output);
    }

    getHooks(command) {
        if (typeof this.hooks[command] !== 'undefined') {
            return this.hooks[command];
        }
        
        let hooks = new Hooks();

        let funcs = [
            hooks.addPre.bind(hooks),
            hooks.addPost.bind(hooks),
        ];

        for (let mw in this.middleware) {
            this.middleware[mw].populate(...funcs);
        }

        return this.hooks[command] = hooks;
    }

}

module.exports.Middleware = Middleware;
