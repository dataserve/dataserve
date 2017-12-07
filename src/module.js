"use strict"

const Promise = require("bluebird");

const Hooks = require("./hooks");
const Validate = require("./validate");
const {intArray} = require("./util");

class Module {

    constructor(model) {
        this.model = model;
        
        this.hooks = {};
    }

    getHooks(command) {
        if (typeof this.hooks[command] !== "undefined") {
            return this.hooks[command];
        }
        
        let hooks = new Hooks(this.model);
        
        this[command](hooks);
        
        return this.hooks[command] = hooks;
    }

    add(hooks) {
        hooks.addPre(query => {
            let validate = new Validate(this.model), errors = {}, promises = [];
            
            for (let field in query.fields) {
                if (!this.model.getField(field).validate) {
                    continue;
                }
                
                if (!this.model.getField(field).validate.add) {
                    continue;
                }
                
                let promise = validate.check(field, query.fields[field], this.model.getField(field).validate.add, errors);
                
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
                        return Promise.reject(errors);
                    }
                    
                    return Promise.resolve();
                });
        });
    }

    get(hooks) {
    }

    getCount(hooks) {
    }

    getMulti(hooks) {
    }
    
    lookup(hooks) {
        hooks.addPre(query => {
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
        
        hooks.addPost(result => {
        });
    }

    remove(hooks) {
    }

    set(hooks) {
        hooks.addPre(query => {
            return new Promise((resolve, reject) => {
                let validate = new Validate, errors = {};
                
                for (let field in query.fields) {
                    if (!this.model.getField(field).validate) {
                        continue;
                    }
                    
                    if (!this.model.getField(field).validate.add) {
                        continue;
                    }
                    
                    validate.check(this.model.getField(field).validate.add, errors);
                }
                
                if (errors) {
                    return reject(errors);
                }
                
                resolve();
            });
        });
    }
    
}

module.exports = Module;
