"use strict";

const Promise = require("bluebird");

const Hooks = require("./hooks");
const Validate = require("./middleware/validate");
const { intArray, r } = require("./util");

module.exports.middlewareHandler = middlewareLookup => target => next => (obj) => {
    return next(obj);
}

class Middleware {

    constructor(model, middleware, middlewareLookup) {
        this.model = model;

        if (typeof middleware === "string") {
            middleware = [middleware];
        }
        
        this.middlware = middleware;
        
        this.middlewareLookup = middlewareLookup;

        this.hooks = {};
    }

    getHooks(command) {
        if (typeof this.hooks[command] !== "undefined") {
            return this.hooks[command];
        }
        
        let hooks = new Hooks();

        let funcs = [
            hooks.addPre.bind(hooks),
            hooks.addPost.bind(hooks),
        ];

        for (let middleware of this.middleware) {
            if (!middlewareLookup[middleware]) {
                throw new Error(`missing middlware definition ${middleware}`);
            }

            middlewareLookup[middleware].initCommand(model, command, ...funcs);
        }

        return this.hooks[command] = hooks;
    }

    runValidation(query, command) {
        let validate = new Validate(this.model), errors = {}, promises = [];
        
        for (let field in query.fields) {
            if (!this.model.getField(field).validate) {
                continue;
            }
            
            if (!this.model.getField(field).validate[command]) {
                continue;
            }
            
            let promise = validate.check(field, query.fields[field], this.model.getField(field).validate[command], errors);
            
            if (promise.length) {
                promises = promises.concat(promise);
            }
        }
        
        if (!promises.length) {
            promises.push(Promise.resolve());
        }
        
        return Promise.all(promises)
            .then(() => {
                if (Object.keys(errors).length) {
                    return Promise.reject(r(false, 'Validation failed', errors));
                }
                
                return Promise.resolve();
            });
    }

    add(addPre, addPost) {
        addPre(query => {
            return this.runValidation(query, "add");
        });
    }

    get(addPre, addPost) {
    }

    getCount(addPre, addPost) {
    }

    getMulti(addPre, addPost) {
    }
    
    lookup(addPre, addPost) {
        addPre(query => {
            return new Promise((resolve, reject) => {
                let tableConfig = this.model.getTableConfig();
                
                let where = [], bind = {}, input = null;
                
                if (input = query.raw('=')) {
                    for (let field in input) {
                        if (!this.model.getField(field)) {
                            continue;
                        }
                        
                        let vals = input[field];
                        
                        if (!Array.isArray(vals)) {
                            vals = [vals];
                        }
                        
                        if (this.model.getField(field).type == "int") {
                            vals = intArray(vals);
                            
                            where.push(query.alias + "." + field + " IN (" + vals.join(",") + ") ");
                        } else {
                            vals = [...new Set(vals)];
                            
                            let wh = [], cnt = 1;
                            
                            for (let val of vals) {
                                wh.push(":" + field + cnt);
                                
                                bind[field + cnt] = val;
                                
                                ++cnt;
                            }
                            
                            where.push(field + " IN (" + wh.join(",") + ")");
                        }
                    }
                }
                
                if (input = query.raw("%search")) {
                    for (let field in input) {
                        if (!this.model.getField(field)) {
                            continue;
                        }
                        
                        where.push(query.alias + "." + field + " LIKE :" + field);
                        
                        bind[field] = "%" + input[field];
                    }
                }
                
                if (input = query.raw("search%")) {
                    for (let field in input) {
                        if (!this.model.getField(field)) {
                            continue;
                        }
                        
                        where.push(query.alias + "." + field + " LIKE :" + field);
                        
                        bind[field] = input[field] + "%";
                    }
                }
                
                if (input = query.raw("%search%")) {
                    for (let field in input) {
                        if (!this.model.getField(field)) {
                            continue;
                        }
                        
                        where.push(query.alias + "." + field + " LIKE :" + field);
                        
                        bind[field] = "%" + input[field] + "%";
                    }
                }
                
                if (input = query.raw(">")) {
                    for (let field in input) {
                        if (!this.model.getField(field)) {
                            continue;
                        }
                        
                        where.push(":" + field + "_greater < " + query.alias + "." + field);
                        
                        bind[field + "_greater"] = parseInt(input[field], 10);
                    }
                }
                
                if (input = query.raw(">=")) {
                    for (let field in input) {
                        if (!this.model.getField(field)) {
                            continue;
                        }
                        
                        where.push(":" + field + "_greater_equal <= " + query.alias + "." + field);
                        
                        bind[field + "_greater_equal"] = parseInt(input[field], 10);
                    }
                }
                
                if (input = query.raw("<")) {
                    for (let field in input) {
                        if (!this.model.getField(field)) {
                            continue;
                        }
                        
                        where.push(query.alias + "." + field + " < :" + field + "_less");
                        
                        bind[field + "_less"] = parseInt(input[field], 10);
                    }
                }
                
                if (input = query.raw("<=")) {
                    for (let field in input) {
                        if (!this.model.getField(field)) {
                            continue;
                        }
                        
                        where.push(query.alias + "." + field + ". <= :" + field + "_less_equal");
                        
                        bind[field + "_less_equal"] = parseInt(input[field], 10);
                    }
                }
                
                if (input = query.raw("modulo")) {
                    for (let field in input) {
                        if (!this.model.getField(field)) {
                            continue;
                        }
                        
                        where.push(query.alias + "." + field + " % :" + field + "_modulo_mod = :" + field + "_modulo_val");
                        
                        bind[field + "_modulo_mod"] = parseInt(input[field]["mod"], 10);
                        
                        bind[field + "_modulo_val"] = parseInt(input[field]["val"], 10);
                    }
                }
                
                query.addWhere(where, bind);
                
                resolve();
            });
        });
    }

    remove(addPre, addPost) {
    }

    set(addPre, addPost) {
        addPre(query => {
            return this.runValidation(query, "set");
        });
    }
    
}

module.exports.Middleware = Middleware;
