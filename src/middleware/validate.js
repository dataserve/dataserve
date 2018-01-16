'use strict';

const Promise = require('bluebird');

const { camelize } = require('../util');

module.exports = model => next => obj => {
    let validate = new Validate(model);

    return validate.run(obj).then(() => next(obj));
}

const ALLOWED_RULES = {
    'email': [
        'String',
    ],
    'exists': [
        'Date',
        'Integer',
        'Number',
        'String',
    ],
    'in': [
        'Array',
        'Integer',
        'Number',
        'String',
    ],
    'ipAddress': [
        'String',
    ],
    'ipAddressV4': [
        'String',
    ],
    'ipAddressV6': [
        'String',
    ],
    'min': [
        'Array',
        'Date',
        'Integer',
        'Number',
        'String',
    ],
    'max': [
        'Array',
        'Date',
        'Integer',
        'Number',
        'String',
    ],
    'required': null,
    'unique': [
        'Date',
        'Integer',
        'Number',
        'String',
    ],
    'unsigned': [
        'Integer',
        'Number',
    ],
};

const PROMISE_RULES = [
    'exists',
    'unique',
];

const REASON = {
    '_invalidRule': 'Invalid rule :rule for field :field',
    '_invalidType': 'Invalid value type :type for field :field',
    'email': ':field must be a valid email address',
    'exists': ':field does not exist',
    'in': ':field must be one of :extra',
    'ipAddress': ':field must be a valid ip address',
    'ipAddressV4': ':field must be a valid v4 ip address',
    'ipAddressV6': ':field must be a valid v6 ip address',
    'min': ':field must be at least :extra',
    'max': ':field must be under :extra',
    'no': ':field not allowed',
    'required': ':field is required',
    'unique': ':field already exists',
};

class Validate {

    constructor(model) {
        this.model = model;
        
        this.validator = require('validator');
        
        this.ip = require('ip');
    }

    run({ command, query }) {
        let errors = {}, promises = [];

        for (let fieldIndex = 0; fieldIndex < query.getFieldsCnt(); ++fieldIndex) {
            for (let field in query.getFields(fieldIndex)) {
                let rules = this.model.getField(field).validate;

                if (typeof rules === 'object') {
                    rules = rules[command];
                }

                if (typeof rules !== 'string' || !rules.length) {
                    continue;
                }

                let val = query.getField(fieldIndex, field);
                
                let promise = this.validate(field, val, rules, errors);
                
                if (promise.length) {
                    promises = promises.concat(promise);
                }
            }
        }
        
        if (!promises.length) {
            promises = Promise.resolve();
        } else {
            promises = Promise.all(promises);
        }
        
        return promises.then(() => {
            if (Object.keys(errors).length) {
                return Promise.reject(['Validation failed', errors]);
            }
        });
    }

    validate(field, val, rules, errors) {
        let promiseRun = [];
        
        rules = rules.split('|');

        for (let split of rules) {
            let [rule, extra] = split.split(':');
            
            if (rule === 'required') {
                if (typeof val === 'undefined' || val === null) {
                    this.addError(rule, extra, field, null, errors);
                }

                continue;
            }

            if (rule === 'no') {
                if (typeof val !== 'undefined') {
                    this.addError(rule, extra, field, null, errors);
                }

                continue;
            }
            
            rule = camelize(rule);
            
            if (!ALLOWED_RULES[rule]) {
                this.addError('_invalidRule', rule, field, null, errors);
                
                continue;
            }
            
            let type = this.model.getFieldValidateType(field);
            
            if (ALLOWED_RULES[rule].indexOf(type) === -1) {
                this.addError('_invalidType', rule, field, null, errors);
                
                continue;
            }
            
            let handler = 'validate' + rule.charAt(0).toUpperCase() + rule.slice(1);
            
            if (PROMISE_RULES.indexOf(rule) !== -1) {
                promiseRun.push([this[handler], [extra, field, val, type, errors]]);
            } else {
                if (this[handler](extra, field, val, type) === false) {
                    this.addError(rule, extra, field, type, errors);
                }
            }
        }

        //don't run promise validations if errors already found
        if (promiseRun.length && Object.keys(errors).length) {
            return [];
        }

        let promises = [];

        for (let run of promiseRun) {
            promises.push(run[0].bind(this)(...run[1]));
        }
        
        return promises;
    }

    addError(rule, extra, field, type, errors){
        let reason = REASON[rule];

        reason = reason.replace(':field', field)
            .replace(':extra', extra)
            .replace(':type', type);

        if (rule.substr(0, 1) === '_') {
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
        let [dbTable, column] = extra.split(',');

        if (!column) {
            column = field;
        }
        
        let input = {
            '=': {
                [column]: val,
            },
            outputStyle: 'LOOKUP_RAW',
            page: 1,
            limit: 1
        };
        
        return this.model.dataserve.run(`${dbTable}:lookup`, input)
            .then((res) => {
                if (!res.result.length) {
                    this.addError('exists', extra, field, type, errors);
                }
            });
    }
    
    validateIn(extra, field, val, type) {
        extra = extra.split(',');
        
        switch (type) {
        case 'Array':
            if (!Array.isArray(val)) {
                val = [val];
            }
            
            for (let v of val) {
                if (extra.indexOf(v) === -1) {
                    return false;
                }
            }
            
            break;
        case 'Integer':
        case 'Number':
        case 'String':
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
        case 'Array':
            if (!Array.isArray(val)) {
                val = [val];
            }

            if (val.length < extra) {
                return false;
            }
            
            break;
        case 'String':
            if (String(val).length < extra) {
                return false;
            }
            
            break;
        case 'Date':
            if (val < new Date(extra)) {
                return false;
            }
            
            break;
        case 'Integer':
            if (parseInt(val, 10) < extra) {
                return false;
            }
            
            break;
        case 'Number':
            if (Number(val) < extra) {
                return false;
            }
            
            break;
        }
        
        return true;
    }

    validateMax(extra, field, val, type) {
        switch (type) {
        case 'Array':
            if (!Array.isArray(val)) {
                val = [val];
            }

            if (extra < val.length) {
                return false;
            }

            break;
        case 'String':
            if (extra < String(val).length) {
                return false;
            }
            
            break;
        case 'Date':
            if (new Date(extra) < val) {
                return false;
            }
            
            break;
        case 'Integer':
            if (extra < parseInt(val, 10)) {
                return false;
            }
            
            break;
        case 'Number':
            if (extra < Number(val)) {
                return false;
            }
            
            break;
        }
        
        return true;
    }

    validateUnique(extra, field, val, type, errors) {
        let [dbTable, column] = extra.split(',');

        if (!column) {
            column = field;
        }
        
        let input = {
            '=': {
                [column]: val,
            },
            outputStyle: 'LOOKUP_RAW',
            page: 1,
            limit: 1
        };
        
        return this.model.dataserve.run(`${dbTable}:lookup`, input)
            .then((res) => {
                if (res.result.length) {
                    this.addError('unique', extra, field, type, errors);
                }
            });
    }

    validateUnsigned(extra, field, val, type) {
        switch (type) {
        case 'Integer':
        case 'Number':
            if (Number(val) < 0) {
                return false;
            }
            
            break;
        }
        
        return true;
    }
}
