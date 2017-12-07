"use strict";

const Type = require('type-of-is');

const ALLOWED_OUTPUT_STYLE = [
    "RETURN_ADD",
    "BY_ID",
    "INCLUDE_FOUND",
    "FOUND_ONLY",
    "LOOKUP_RAW",
];

class Query {

    constructor(input, command, model) {
        this.input = input;
        
        this.model = model;
        
        this.alias = "";
        
        this.get = {
            field: null,
            vals: null,
        };
        
        this.getMulti = {
            field: null,
            vals: null,
        };
        
        this.primaryKey = null;
        
        this.fields = {};

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

        this.build(input, command);
    }

    build(input, command) {
        if (!isNaN(parseInt(input, 10))) {
            this.input = input = {
                [this.model.getPrimaryKey()]: parseInt(input, 10),
            };
        }
        
        if (!Type.is(input, Object)) {
            throw new Error("Invalid input, must be an object or primaryKey value, received: " + JSON.stringify(input));
        }
        
        if (input.alias) {
            this.setAlias(input.alias);
        } else {
            this.setAlias(this.model.getTable().substring(0, 1));
        }
        
        if (input.fields) {
            for (let field in input.fields) {
                this.setField(field, input.fields[field]);
            }
        }
        
        if (input.join) {
            for (let table in input.join) {
                this.setField(table, input.join[table]);
            }
        }
        
        if (input.leftJoin) {
            for (let table in input.leftJoin) {
                this.setField(table, input.leftJoin[table]);
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
            for (let table in input.fillin) {
                this.setFillin(table, input.fillin[table]);
            }
        }
        
        if (input.outputStyle) {
            this.addOutputStyle(input.outputStyle);
        }
        
        if (input[this.model.getPrimaryKey()]) {
            this.setPrimaryKey(input[this.model.getPrimaryKey()]);
        }

        switch (command) {
        case "add":
            for (let field in input) {
                this.setField(field, input[field]);
            }
            
            break;
        case "get":
            if (this.primaryKey) {
                this.setGet(this.model.getPrimaryKey(), this.primaryKey);
            } else {
                for (let field in input) {
                    this.setGet(field, input[field]);
                }
            }
            
            break;
        case "getMulti":
            for (let field in input) {
                this.setGetMulti(field, input[field]);
            }
            
            break;
        case "lookup":
            break;
        case "set":
            for (let field in input) {
                this.setField(field, input[field]);
            }
            
            break;
        }
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
    
    setField(field, val) {
        if (!this.model.isFillable(field)) {
            return;
        }
        
        this.fields[field] = val;
    }

    hasFields() {
        return Object.keys(this.fields).length ? true: false;
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

module.exports = Query;
