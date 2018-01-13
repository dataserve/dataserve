'use strict';

const Type = require('type-of-is');

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
        
        this.getMulti = {
            field: null,
            vals: null,
        };
        
        this.primaryKey = null;
        
        this.fieldsArr = [];

        this.join = {};
        
        this.leftJoin = {};
        
        this.where = [];
        
        this.bind = {};
        
        this.group = [];
        
        this.order = [];
        
        this.limit = {};

        this.custom = [];

        this.fillin = {};
        
        this.outputStyle = [];

        this.singleRowResult = false;
    }

    build(command, input) {
        input = this.parseCommandInput(command, input);
        
        if (!Type.is(input, Object)) {
            throw new Error('Invalid input, must be an object, primaryKey value(s), received: ' + JSON.stringify(input));
        }

        this.input = input;
        
        if (input.alias) {
            this.setAlias(input.alias);
        } else {
            this.setAlias(this.model.getTableName().substring(0, 1));
        }
        
        if (input.fieldsArr) {
            if (!Array.isArray(input.fieldsArr)) {
                input.fieldsArr = [ input.fieldsArr ];
            }

            for (let fieldObj of input.fieldsArr) {
                let fieldsIndex = this.newField();
                
                for (let field in fieldObj) {
                    this.setField(fieldsIndex, field, fieldObj[field]);
                }
            }
        }
        
        if (input.join) {
            for (let table in input.join) {
                this.addJoin(table, input.join[table]);
            }
        }
        
        if (input.leftJoin) {
            for (let table in input.leftJoin) {
                this.addLeftJoin(table, input.leftJoin[table]);
            }
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
        
        if (input.custom) {
            this.addCustom(input.custom);
        }
        
        if (input.fillin) {
            if (typeof input.fillin === 'string') {
                this.setFillin(input.fillin, true);
            } else if (Array.isArray(input.fillin)) {
                input.fillin.forEach(table => {
                    this.setFillin(table, true);
                });
            } else if (typeof input.fillin === 'object') {
                for (let table in input.fillin) {
                    this.setFillin(table, input.fillin[table]);
                }
            }
        }
        
        if (input.outputStyle) {
            this.addOutputStyle(input.outputStyle);
        }
        
        if (input[this.model.getPrimaryKey()]) {
            this.setPrimaryKey(input[this.model.getPrimaryKey()]);
        }

        switch (command) {
        case 'get':
            if (this.primaryKey) {
                this.setGet(this.model.getPrimaryKey(), this.primaryKey);
            } else {
                for (let field in input) {
                    this.setGet(field, input[field]);
                }
            }
            
            break;
        case 'getMulti':
            for (let field in input) {
                this.setGetMulti(field, input[field]);
            }
            
            break;
        }

        return this;
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
                
                    for (let fields of fieldsArr) {
                        let primaryKey = fields[this.model.getPrimaryKey()];

                        if (typeof primaryKey === 'undefined') {
                            throw new Error('primary key missing in fieldsArr');
                        }
                    
                        primaryKeys.push(primaryKey);
                    }

                    input.fieldsArr = fieldsArr;

                    input[this.model.getPrimaryKey()] = primaryKeys;

                    delete(input.fields);
                } else {
                    input[this.model.getPrimaryKey()] = [ input.fields[this.model.getPrimaryKey()] ];
                    
                    if (typeof input[this.model.getPrimaryKey()] === 'undefined') {
                        throw new Error('primary key missing');
                    }

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
            vals = [vals];
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

    setGetMulti(field, vals) {
        if (!this.model.isGetMulti(field)) {
            return;
        }
        
        if (!Array.isArray(vals)) {
            vals = [vals];
            this.singleRowResult = true;
        } else if (!vals.length) {
            return;
        }
        
        this.getMulti.field = field;
        
        this.getMulti.vals = vals;
    }

    hasGetMulti() {
        return this.getMulti.field ? true : false;
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
        this.join[table] = on;
    }

    addLeftJoin(table, on) {
        this.leftJoin[table] = on;
    }

    addWhere(where, binds) {
        if (!Array.isArray(where)) {
            where = [where];
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
            group = [group];
        } else if (!group.length) {
            return;
        }
        
        this.group = this.group.concat(group);
    }

    addOrder(order) {
        if (!Array.isArray(order)) {
            order = [order];
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

    addCustom(custom) {
        if (!Array.isArray(custom)) {
            custom = [custom];
        } else if (!custom.length) {
            return;
        }
        
        this.custom = this.custom.concat(custom);
    }

    setFillin(field, val) {
        this.fillin[field] = val;
    }

    hasFillin() {
        return Object.keys(this.fillin).length ? true : false;
    }
    
    validOutputStyle(style) {
        if (ALLOWED_OUTPUT_STYLE.indexOf(style) === -1) {
            return false;
        }
        
        return true;
    }
    
    addOutputStyle(style) {
        if (!Array.isArray(style)) {
            style = [style];
        } else if (!style.length) {
            return;
        }
        
        for (let st of style) {
            if (!this.validOutputStyle(st)) {
                continue;
            }
        }
        
        this.outputStyle = this.outputStyle.concat(style);
    }

    setOutputStyle(style) {
        if (!Array.isArray(style)) {
            style = [style];
        }
        
        //CAN SET TO EMPTY ARRAY
        let styleValid = [];
        
        for (let st of style) {
            if (!this.validOutputStyle(st)) {
                continue;
            }
            
            styleValid.push(st);
        }
        
        this.outputStyle = styleValid;
    }

    isOutputStyle(style) {
        return this.outputStyle.indexOf(style) !== -1;
    }
}

module.exports.Query = Query;
