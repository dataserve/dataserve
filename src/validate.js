"use strict"

const Promise = require("bluebird");
const Type = require('type-of-is');

const {camelize} = require("./util");

const ALLOWED_RULES = {
    "email": [
        "String",
    ],
    "exists": [
        "Date",
        "Number",
        "String",
    ],
    "in": [
        "Array",
        "Number",
        "String",
    ],
    "ipAddress": [
        "String",
    ],
    "ipAddressV4": [
        "String",
    ],
    "ipAddressV6": [
        "String",
    ],
    "min": [
        "Array",
        "Date",
        "Number",
        "String",
    ],
    "max": [
        "Array",
        "Date",
        "Number",
        "String",
    ],
    "required": null,
    "unique": [
        "Date",
        "Number",
        "String",
    ],
};

const PROMISE_RULES = [
    "exists",
    "unique",
];

const REASON = {
    "_invalidRule": "Invalid rule :rule for field :field",
    "_invalidType": "Invalid value type :type for field :field",
    "email": ":field must be a valid email address",
    "exists": ":field does not exist",
    "in": ":field must be one of :extra",
    "ipAddress": ":field must be a valid ip address",
    "ipAddressV4": ":field must be a valid v4 ip address",
    "ipAddressV6": ":field must be a valid v6 ip address",
    "min": ":field must be greater than :extra",
    "max": ":field must be less than :extra",
    "required": ":field is required",
    "unique": ":field already exists",
};

class Validate {

    constructor(model) {
        this.model = model;
        
        this.validator = require('validator');
        
        this.ip = require('ip');
    }

    check(field, val, rules, errors) {
        let promises = [];
        
        rules = rules.split("|");
        
        for (let split of rules) {
            let [rule, extra] = split.split(":");
            
            if (rule === "required") {
                if (typeof val === "undefined" || val === null) {
                    this.addError(rule, extra, field, val, null, errors);
                }
                
                continue;
            }
            
            rule = camelize(rule);
            
            if (!ALLOWED_RULES[rule]) {
                this.addError("_invalidRule", rule, field, val, null, errors);
                
                continue;
            }
            
            let type = Type.string(val);
            
            if (ALLOWED_RULES[rule].indexOf(type) === -1) {
                this.addError("_invalidType", rule, field, val, null, errors);
                
                continue;
            }
            
            let handler = "validate" + rule.charAt(0).toUpperCase() + rule.slice(1);
            
            if (PROMISE_RULES.indexOf(rule) !== -1) {
                promises.push(this[handler](extra, field, val, type, errors));
            } else {
                if (this[handler](extra, field, val, type) === false) {
                    this.addError(rule, extra, field, val, type, errors);
                }
            }
        }
        return promises;
    }

    addError(rule, extra, field, val, type, errors){
        let reason = REASON[rule];
        
        if (rule.substr(0, 1) === "_") {
            rule = extra;
        }
        
        errors[field] = {
            rule: rule,
            reason: reason,
        };
    }

    validateEmail(extra, field, val, type) {
        if (!this.validator.isEmail(val)) {
            return false;
        }
        
        return true;
    }

    validateExists(extra, field, val, type, errors) {
        let [table, column] = extra.split(",");
        
        let input = {
            "=": {
                [field]: val,
            },
            outputStyle: "LOOKUP_RAW",
            page: 1,
            limit: 1
        };
        
        return this.model.dataserve.run(table + ":lookup", input)
            .then(res => {
                if (!res.result.length) {
                    this.addError("exists", extra, field, val, type, errors);
                }
            });
    }
    
    validateIn(extra, field, val, type) {
        extra = extra.split(",");
        
        switch (type) {
        case "Array":
            for (let v of val) {
                if (extra.indexOf(v) === -1) {
                    return false;
                }
            }
            
            break;
        case "Number":
        case "String":
            if (extra.indexOf(val) === -1) {
                return false;
            }
            
            break;
        }
        
        return true;
    }

    validateIpAddress(extra, field, val, type) {
        if (!this.ip.isV4Format(val) && !this.ip.isV6Format(val)) {
            return false;
        }
        
        return true;
    }

    validateIpAddressV4(extra, field, val, type) {
        if (!this.ip.isV4Format(val)) {
            return false;
        }
        
        return true;
    }

    validateIpAddress(extra, field, val, type) {
        if (!this.ip.isV6Format(val)) {
            return false;
        }
        
        return true;
    }

    validateMin(extra, field, val, type) {
        switch (type) {
        case "Array":
        case "String":
            if (val.length < extra) {
                return false;
            }
            
            break;
        case "Date":
            if (val < new Date(extra)) {
                return false;
            }
            
            break;
        case "Number":
            if (val < extra) {
                return false;
            }
            
            break;
        }
        
        return true;
    }

    validateMax(extra, field, val, type) {
        switch (type) {
        case "Array":
        case "String":
            if (extra < val.length) {
                return false;
            }
            
            break;
        case "Date":
            if (new Date(extra) < val) {
                return false;
            }
            
            break;
        case "Number":
            if (extra < val) {
                return false;
            }
            
            break;
        }
        
        return true;
    }

    validateUnique(extra, field, val, type, errors) {
        let [table, column] = extra.split(",");
        
        let input = {
            "=": {
                [field]: val,
            },
            outputStyle: "LOOKUP_RAW",
            page: 1,
            limit: 1
        };
        
        return this.model.dataserve.run(table + ":lookup", input)
            .then(res => {
                if (res.result.length) {
                    this.addError("unique", extra, field, val, type, errors);
                }
            });
    }

}

module.exports = Validate;
