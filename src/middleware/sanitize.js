'use strict';

const Promise = require('bluebird');

const { camelize } = require('../util');

module.exports = model => next => obj => {
    let sanitize = new Sanitize(model);

    return sanitize.run(obj).then(() => next(obj));
}

const ALLOWED_RULES = {
    'trim': [
        'String',
    ],
    'type': [
        'Array',
        'Date',
        'Integer',
        'Number',
        'String',
    ],
};

const PROMISE_RULES = [];

const REASON = {
    '_invalidRule': 'Invalid rule :rule for field :field',
    '_invalidType': 'Invalid value type :type for field :field',
};

class Sanitize {

    constructor(model) {
        this.model = model;
    }

    run({ command, query }) {
        let errors = {}, promises = [];
        
        for (let field in query.getFields()) {
            let rules = this.model.getField(field).sanitize || this.model.getTableConfig('sanitize');

            if (typeof rules === 'object') {
                rules = rules[command];
            }

            if (typeof rules !== 'string' || !rules.length) {
                continue;
            }

            let promise = this.sanitize(query, field, rules, errors);
            
            if (promise.length) {
                promises = promises.concat(promise);
            }
        }
        
        if (!promises.length) {
            promises = Promise.resolve();
        } else {
            promises = Promise.all(promises);
        }
        
        return promises.then(() => {
            if (Object.keys(errors).length) {
                return Promise.reject('Sanitize failed', errors);
            }
        });
    }

    sanitize(query, field, rules, errors) {
        let promiseRun = [];
        
        rules = rules.split('|');
        
        for (let split of rules) {
            let [rule, extra] = split.split(':');

            rule = camelize(rule);
            
            if (!ALLOWED_RULES[rule]) {
                this.addError('_invalidRule', rule, field, val, null, errors);
                
                continue;
            }
            
            let type = this.model.getFieldValidateType(field);
           
            if (ALLOWED_RULES[rule].indexOf(type) === -1) {
                //this.addError('_invalidType', rule, field, val, null, errors);
                
                continue;
            }
            
            let handler = 'sanitize' + rule.charAt(0).toUpperCase() + rule.slice(1);
            
            if (PROMISE_RULES.indexOf(rule) !== -1) {
                promiseRun.push([this[handler], [extra, query, field, type, errors]]);
            } else {
                if (this[handler](extra, query, field, type) === false) {
                    this.addError(rule, extra, field, val, type, errors);
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

    addError(rule, extra, field, val, type, errors){
        let reason = REASON[rule];

        reason = reason.replace(':field', field)
            .replace(':extra', extra);

        if (rule.substr(0, 1) === '_') {
            rule = extra;
        }
        
        errors[field] = {
            rule: rule,
            reason: reason,
        };
    }

    sanitizeTrim(extra, query, field, type) {
        query.setField(field, String(query.getField(field)).trim());
        
        return true;
    }
        
    sanitizeType(extra, query, field, type) {
        switch (type) {
        case 'Array':
            if (!Array.isArray(query.getField(field))) {
                query.setField(field, [query.getField(field)]);
            }
            
            break;
        case 'Date':
            if (typeof query.getField(field) !== 'object' || typeof query.getField(field).getMonth !== 'function') {
                query.setField(field, new Date(query.getField(field)));
            }
            
            break;
        case 'Integer':
            if (typeof query.getField(field) !== 'number' || query.getField(field) % 1 !== 0) {
                query.setField(field, parseInt(query.getField(field), 10));
            }

            break;
        case 'Number':
            if (typeof query.getField(field) !== 'number') {
                query.setField(field, Number(query.getField(field)));
            }

            break;
        case 'String':
            if (typeof query.getField(field) !== 'string') {
                query.setField(field, String(query.getField(field)));
            }
            
            break;
        }

        return true;
    }
    
}
