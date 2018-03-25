'use strict';

const Promise = require('bluebird');

const { camelize } = require('../util');

module.exports = model => next => obj => {
    if (ALLOWED_COMMANDS.indexOf(obj.command) === -1) {
        return next(obj);
    }

    let sanitize = new Sanitize(model);

    return model.log.add(`sanitize,sanitize:${obj.command}`, () => sanitize.run(obj))
        .then(() => next(obj));
}

const ALLOWED_COMMANDS = [
    'add',
    'set',
];

const ALLOWED_RULES = {
    'hexcolor': [
        'String',
    ],
    'trim': [
        'String',
    ],
    'type': [
        'Array',
        'Date',
        'DateTime',
        'Integer',
        'Number',
        'String',
        'Time',
        'Year',
    ],
};

const PROMISE_RULES = [];

const REASON = {
    '_invalidRule': 'Invalid rule :extra for field :field',
    '_invalidType': 'Invalid value type :type for field :field',
    'hexcolor': 'Invalid hex color for field :field',
    'toArray': 'Could not convert value to array for field :field',
    'toDate': 'Could not convert value to date for field :field',
    'toInteger': 'Could not convert value to integer for field :field',
    'toNumber': 'Could not convert value to number for field :field',
    'toString': 'Could not convert value to string for field :field',
};

class Sanitize {

    constructor(model) {
        this.model = model;
    }

    run({ command, query }) {
        let errors = {}, promises = [];
        
        for (let fieldIndex = 0, n = query.getFieldsCnt(); fieldIndex < n; ++fieldIndex) {
            Object.keys(query.getFields(fieldIndex)).forEach((field) => {
                let rules = this.model.getField(field).sanitize || this.model.getTableConfig('sanitize');

                if (typeof rules === 'object') {
                    rules = rules[command];
                }

                if (typeof rules !== 'string' || !rules.length) {
                    return;
                }

                let val = query.getField(fieldIndex, field);

                if (val === null && this.model.getField(field).nullable) {
                    return;
                }
                
                let promise = this.sanitize(query, fieldIndex, field, val, rules, errors);
                
                if (promise.length) {
                    promises = promises.concat(promise);
                }
            });
        }
        
        if (!promises.length) {
            promises = Promise.resolve();
        } else {
            promises = Promise.all(promises);
        }
        
        return promises.then(() => {
            if (Object.keys(errors).length) {
                return Promise.reject([ 'sanitize', { sanitize: errors } ]);
            }
        });
    }

    sanitize(query, fieldIndex, field, val, rules, errors) {
        let promiseRun = [];
        
        rules = rules.split('|');

        rules.forEach((split) => {
            let [rule, extra] = split.split(':');

            rule = camelize(rule);
            
            if (!ALLOWED_RULES[rule]) {
                this.addError('_invalidRule', rule, field, null, errors);
                
                return;
            }
            
            let type = this.model.getFieldValidateType(field);
           
            if (ALLOWED_RULES[rule].indexOf(type) === -1) {
                //this.addError('_invalidType', rule, field, null, errors);
                
                return;
            }
            
            let handler = 'sanitize' + rule.charAt(0).toUpperCase() + rule.slice(1);
            
            if (PROMISE_RULES.indexOf(rule) !== -1) {
                promiseRun.push([this[handler], [extra, query, fieldIndex, field, val, type, errors]]);
            } else {
                if (this[handler](extra, query, fieldIndex, field, val, type, errors) === false) {
                    this.addError(rule, extra, field, type, errors);
                }
            }
        });

        //don't run promise validations if errors already found
        if (promiseRun.length && Object.keys(errors).length) {
            return [];
        }

        let promises = [];

        promiseRun.forEach((run) => {
            promises.push(run[0].bind(this)(...run[1]));
        });
        
        return promises;
    }

    addError(rule, extra, field, type, errors){
        let reason = REASON[rule];

        reason = reason.replace(':field', field)
            .replace(':extra', extra)
            .replace(':type', type)
            .replace(':rule', rule);

        if (rule.substr(0, 1) === '_') {
            rule = extra;
        }
        
        errors[field] = {
            rule: rule,
            reason: reason,
        };
    }

    sanitizeHexcolor(extra, query, fieldIndex, field, val, type) {
        console.log('SANITIZE COLOR', fieldIndex, field, val, type);
        let color = val.replace(/[^0-9a-fA-F]/g, '');

        if (color.length !== 3 && color.length !== 6) {
            return false;
        }

        color = '#' + color;

        query.setField(fieldIndex, field, color);
        
        return true;
    }
    
    sanitizeTrim(extra, query, fieldIndex, field, val, type) {
        query.setField(fieldIndex, field, String(val).trim());
        
        return true;
    }
        
    sanitizeType(extra, query, fieldIndex, field, val, type, errors) {
        switch (type) {
        case 'Array':
            if (!Array.isArray(val)) {
                query.setField(fieldIndex, field, [ val ]);
            }
            
            break;
        case 'DateTime':
            if (type === 'DateTime' && val === '0000-00-00 00:00:00') {
                break;
            }
            //pass thru
        case 'Date':
            if (type === 'Date' && val === '0000-00-00') {
                break;
            }
            //pass thru
        case 'Time':
            if (type === 'Time' && val === '00:00:00') {
                break;
            }
            //pass thru
        case 'Year':
            if (type === 'Year' && val === '0000') {
                break;
            }
            
            if (typeof val !== 'object' || typeof val.getMonth !== 'function') {
                if (typeof val === 'number') {
                    val = new Date(val * 1000);
                } else {
                    val = new Date(val);
                }

                if (isNaN(val.getTime())) {
                    this.addError('toDate', extra, field, type, errors);
                } else {
                    if (type === 'DateTime') {
                        val = val.toISOString().substr(0, 19).replace('T', ' ');
                    } else if (type === 'Date') {
                        val = val.toISOString().substr(0, 10);
                    } else if (type === 'Time') {
                        val = val.toISOString().substr(19, 8);
                    } else if (type === 'Year') {
                        val = val.toISOString().substr(0, 4);
                    }
                    
                    query.setField(fieldIndex, field, val);
                }
            }
            
            break;
        case 'Integer':
            if (typeof val !== 'number' || val % 1 !== 0) {
                val = parseInt(val, 10);

                if (typeof val !== 'number' || val % 1 !== 0) {
                    this.addError('toInteger', extra, field, type, errors);
                } else {
                    query.setField(fieldIndex, field, val);
                }
            }

            break;
        case 'Number':
            if (typeof val !== 'number') {
                val = Number(val);

                if (typeof val !== 'number') {
                    this.addError('toNumber', extra, field, type, errors);
                } else {
                    query.setField(fieldIndex, field, val);
                }
            }

            break;
        case 'String':
            if (typeof val !== 'string') {
                if (typeof val === 'undefined' || val === null || val === false) {
                    query.setField(fieldIndex, field, '');
                } else {
                    query.setField(fieldIndex, field, String(val));
                }
            }
            
            break;
        }

        return true;
    }
    
}
