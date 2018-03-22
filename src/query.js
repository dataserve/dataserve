'use strict';

const { intArray } = require('./util');

const ALLOWED_OUTPUT_STYLE = [
    'RETURN_CHANGES',
    'BY_ID',
    'INCLUDE_FOUND',
    'FOUND_ONLY',
    'LOOKUP_RAW',
];

module.exports.queryHandler = model => next => obj => {
    if (!obj.query) {
        let query = new Query(model);
        
        try {
            obj.query = query.build(obj.command, obj.input);
        } catch (error) {
            return Promise.reject(error);
        }
    }
  
    return next(obj);
}

class Query {

    constructor(model) {
        this.model = model;

        this.command = null;
        
        this.input = null;
        
        this.alias = '';
        
        this.get = {
            field: null,
            vals: null,
        };
        
        this.getMany = {
            field: null,
            vals: null,
        };
        
        this.primaryKey = null;
        
        this.fieldsArr = [];

        this.join = null;
        
        this.leftJoin = null;
        
        this.where = [];
        
        this.bind = {};
        
        this.group = [];
        
        this.order = [];
        
        this.limit = {};

        this.custom = {};

        this.fill = {};
        
        this.outputStyle = [];

        this.singleRowResult = false;
    }

    build(command, input) {
        this.command = command;
        
        input = this.parseCommandInput(command, input);

        if (typeof input !== 'object') {
            throw new Error('Invalid input, must be an object, received: ' + JSON.stringify(input));
        }

        this.input = input;

        this.buildFill(input);
        
        if (input.outputStyle) {
            this.addOutputStyle(input.outputStyle);
        }
        
        if (input[this.model.getPrimaryKey()]) {
            this.setPrimaryKey(input[this.model.getPrimaryKey()]);
        }

        switch (command) {
        case 'add':
            this.buildFields(input);
            
            break;
        case 'get':
            if (this.primaryKey) {
                this.setGet(this.model.getPrimaryKey(), this.primaryKey);
            } else {
                Object.keys(input).forEach((field) => {
                    this.setGet(field, input[field]);
                });
            }
            
            break;
        case 'getMany':
            Object.keys(input).forEach((field) => {
                this.setGetMany(field, input[field]);
            });
            
            break;
        case 'inc':
            this.buildFields(input);

            break;
        case 'getCount':
        case 'lookup':
            if (input.alias) {
                this.setAlias(input.alias);
            } else {
                this.setAlias(this.model.getTableName().substring(0, 1));
            }

            if (input.join) {
                Object.keys(input.join).forEach((table) => {
                    this.addJoin(table, input.join[table]);
                });
            }
            
            if (input.leftJoin) {
                Object.keys(input.leftJoin).forEach((table) => {
                    this.addLeftJoin(table, input.leftJoin[table]);
                });
            }
            
            if (input.where) {
                this.addWhere(input.where, input.bind ? input.bind : null);
            }
            
            if (input.group) {
                this.addGroup(input.group);
            }
            
            if (input.order) {
                this.addOrder(input.order);
            }
            
            if (input.page && input.limit) {
                this.setLimit(input.page, input.limit);
            }

            break;
        case 'set':
            this.buildFields(input);
            
            if (input.custom) {
                Object.keys(input.custom).forEach((field) => {
                    this.addCustom(field, input.custom[field]);
                });
            }

            break;
        }

        return this;
    }

    buildFill(input) {
        if (!input.fill) {
            return;
        }
        
        if (typeof input.fill === 'string') {
            this.setFill(input.fill, true);
        } else if (Array.isArray(input.fill)) {
            input.fill.forEach(table => {
                this.setFill(table, true);
            });
        } else if (typeof input.fill === 'object') {
            Object.keys(input.fill).forEach((table) => {
                this.setFill(table, input.fill[table]);
            });
        }
    }
    
    buildFields(input) {
        if (!input.fieldsArr) {
            return;
        }
        
        if (!Array.isArray(input.fieldsArr)) {
            input.fieldsArr = [ input.fieldsArr ];
        }

        input.fieldsArr.forEach((fieldObj) => {
            let fieldsIndex = this.newField();

            Object.keys(fieldObj).forEach((field) => {
                this.setField(fieldsIndex, field, fieldObj[field]);
            });
        });
    }

    parseCommandInput(command, input) {
        switch (command) {
        case 'add':
            if (Array.isArray(input)) {
                input = {
                    fieldsArr: input,
                };
            } else if (input.fields) {
                if (Array.isArray(input.fields)) {
                    input.fieldsArr = input.fields;
                } else {
                    input.fieldsArr = [ input.fields ];
                }

                delete input.fields;
            }

            break;
        case 'inc':
        case 'set':
            if (Array.isArray(input)) {
                input = {
                    fields: input,
                };
            }

            if (input.fields) {
                if (Array.isArray(input.fields)) {
                    let fieldsArr = input.fields;
                
                    let primaryKeys = [];

                    fieldsArr.forEach((fields) => {
                        let primaryKey = fields[this.model.getPrimaryKey()];

                        if (typeof primaryKey === 'undefined') {
                            throw new Error('primary key missing in fieldsArr');
                        }
                    
                        primaryKeys.push(primaryKey);
                    });

                    input.fieldsArr = fieldsArr;

                    input[this.model.getPrimaryKey()] = primaryKeys;

                    delete(input.fields);
                } else {
                    if (typeof input.fields[this.model.getPrimaryKey()] === 'undefined') {
                        throw new Error('primary key missing');
                    }

                    input[this.model.getPrimaryKey()] = input.fields[this.model.getPrimaryKey()];
                    
                    input.fieldsArr = [ input.fields ];
                
                    delete(input.fields);
                }
            }
            
            break;
        case 'get':
        case 'remove':
            if (Array.isArray(input)) {
                input = {
                    [this.model.getPrimaryKey()]: input,
                };
            } else if (!isNaN(parseInt(input, 10))) {
                input = {
                    [this.model.getPrimaryKey()]: input,
                };
            }
            
            break;
        }
        
        return input;
    }
    
    raw(field) {
        return this.input[field];
    }
  
    setAlias(alias) {
        this.alias = alias;
    }

    setPrimaryKey(val) {
        this.primaryKey = val;
    }
    
    setGet(field, vals) {
        if (field != this.model.getPrimaryKey() && !this.model.isUnique(field)) {
            return;
        }
        
        if (!Array.isArray(vals)) {
            vals = [ vals ];
            this.singleRowResult = true;
        } else if (!vals.length) {
            return;
        }
        
        this.get.field = field;
        
        this.get.vals = vals;
    }

    hasGet() {
        return this.get.field ? true : false;
    }

    setGetMany(field, vals) {
        if (!this.model.isGetMany(field)) {
            return;
        }
        
        if (!Array.isArray(vals)) {
            vals = [ vals ];
            this.singleRowResult = true;
        } else if (!vals.length) {
            return;
        }
        
        this.getMany.field = field;
        
        this.getMany.vals = vals;
    }

    hasGetMany() {
        return this.getMany.field ? true : false;
    }

    getFieldsCnt() {
        return this.fieldsArr.length;
    }

    getFields(index) {
        return this.fieldsArr[index];
    }

    getField(index, field) {
        return this.fieldsArr[index][field];
    }

    newField() {
        let index = this.fieldsArr.length;

        this.fieldsArr.push({});

        return index;
    }

    currentField() {
        if (!this.fieldsArr.length) {
            return null;
        }

        return this.fieldsArr.length - 1;
    }
    
    setField(index, field, val) {
        if (!this.model.isFillable(field)) {
            return;
        }
        
        if (typeof index === 'undefined' || index === null) {
            index = this.currentField();

            if (index === null) {
                index = this.newField();
            }
        }
        
        this.fieldsArr[index][field] = val;
    }

    addJoin(table, on) {
        if (!this.join) {
            this.join = {};
        }
        
        this.join[table] = on;
    }

    addLeftJoin(table, on) {
        if (!this.leftJoin) {
            this.leftJoin = {};
        }
        
        this.leftJoin[table] = on;
    }

    addWhere(where, binds) {
        if (!Array.isArray(where)) {
            where = [ where ];
        } else if (!where.length) {
            return;
        }
        
        this.where = this.where.concat(where);
        
        if (binds) {
            this.bind = Object.assign(binds, this.bind);
        }
    }

    addGroup(group) {
        if (!Array.isArray(group)) {
            group = [ group ];
        } else if (!group.length) {
            return;
        }
        
        this.group = this.group.concat(group);
    }

    addOrder(order) {
        if (!Array.isArray(order)) {
            order = [ order ];
        } else if (!order.length) {
            return;
        }
        
        this.order = this.order.concat(order);
    }

    setLimit(page, limit) {
        this.limit = {
            page: page,
            limit: limit,
        };
    }

    addCustom(field, custom) {
        this.custom[field] = custom;
    }

    getCustom(field) {
        return this.custom[field];
    }

    getCustomFields() {
        return Object.keys(this.custom);
    }

    setFill(field, val) {
        this.fill[field] = val;
    }

    hasFill() {
        return Object.keys(this.fill).length ? true : false;
    }

    findFill(tableName) {
        if (!this.hasFill()) {
            return null;
        }

        let found = Object.keys(this.fill).filter((related) => {
            let [ relatedTableName, relatedAliasName ] = related.split(':');

            if (relatedTableName === tableName) {
                return true;
            }

            return false;
        });

        if (found.length) {
            let foundAliasArr = found.map((val) => {
                let [ foundTableName, foundAliasName ] = val.split(':');

                return foundAliasName || foundTableName;
            });
            
            return {
                fill: found,
                aliasNameArr: foundAliasArr,
            };
        }

        return null;
    }
    
    validOutputStyle(style) {
        if (ALLOWED_OUTPUT_STYLE.indexOf(style) === -1) {
            return false;
        }
        
        return true;
    }
    
    addOutputStyle(style) {
        if (!Array.isArray(style)) {
            style = [ style ];
        } else if (!style.length) {
            return;
        }

        style = style.filter((st) => {
            return this.validOutputStyle(st);
        });
        
        this.outputStyle = this.outputStyle.concat(style);
    }

    setOutputStyle(style) {
        if (!Array.isArray(style)) {
            style = [ style ];
        }

        style = style.filter((st) => {
            return this.validOutputStyle(st);
        });
        
        this.outputStyle = style;
    }

    isOutputStyle(style) {
        return this.outputStyle.indexOf(style) !== -1;
    }
}

module.exports.Query = Query;
