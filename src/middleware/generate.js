'use strict';

const Promise = require('bluebird');

const { camelize, randomString } = require('../util');

module.exports = model => next => obj => {
    let generate = new Generate(model);

    return generate.run(obj).then(() => {
        console.log('GENERATE DONE');
        return next(obj);
    });
}

const ALLOWED_RULES = {
    'slug': [
        'String',
    ],
    'slugUnique': [
        'String',
    ],
    'uuid': [
        'String',
    ],
};

const PROMISE_RULES = [
    'slugUnique',
];

const REASON = {
    '_invalidRule': 'Invalid rule :rule for field :field',
    '_invalidType': 'Invalid value type :type for field :field',
    'slugUnique': 'Unable to generate unique value for :field',
};

class Generate {

    constructor(model) {
        this.model = model;

        this.uuid = require('uuid/v4');
    }

    run({ command, query }) {
        let errors = {}, promises = [];

        for (let field in this.model.getFields()) {
            let rules = this.model.getField(field).generate || this.model.getTableConfig('generate');

            if (typeof rules === 'object') {
                rules = rules[command];
            }

            if (typeof rules !== 'string' || !rules.length) {
                continue;
            }

            for (let fieldIndex = 0; fieldIndex < query.getFieldsCnt(); ++fieldIndex) {
                let promise = this.generate(query, fieldIndex, field, rules, errors);
            
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
                return Promise.reject('Generate failed', errors);
            }
        });
    }

    generate(query, fieldIndex, field, rules, errors) {
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
            
            let handler = 'generate' + rule.charAt(0).toUpperCase() + rule.slice(1);
            
            if (PROMISE_RULES.indexOf(rule) !== -1) {
                promiseRun.push([this[handler], [extra, query, fieldIndex, field, type, errors]]);
            } else {
                if (this[handler](extra, query, fieldIndex, field, type) === false) {
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

    buildSlug(extra, query, fieldIndex, field, type, cnt) {
        let [ slugType, slugOpt ] = extra.split(',');
        
        if (slugType === 'alpha') {
            return randomString(slugOpt, 'A');
        }

        if (slugType === 'alphaNum') {
            return randomString(slugOpt, 'A#');
        }
        
        if (slugType === 'field') {
            if (!query.getField(fieldIndex, slugOpt)) {
                return '';
            }

            let val = query.getField(fieldIndex, slugOpt);

            if (cnt && 1 < cnt) {
                val += ' ' + cnt;
            }
        
            let slug = val
                .toString()
                .toLowerCase()
                .replace(/\s+/g, '-') // Replace spaces with -
                .replace(/[^\w\-]+/g, '') // Remove all non-word chars
                .replace(/\-\-+/g, '-') // Replace multiple - with single -
                .replace(/^-+/, '') // Trim - from start of text
                .replace(/-+$/, ''); // Trim - from end of text

            return slug;
        }
    }
    
    generateSlug(extra, query, fieldIndex, field, type, cnt) {
        let slug = this.buildSlug(extra, query, fieldIndex, field, type);

        if (typeof slug !== 'undefined' && typeof slug !== null) {
            query.setField(fieldIndex, field, slug);
        }
    }

    generateSlugUnique(extra, query, fieldIndex, field, type, cnt=0) {
        let val = this.buildSlug(extra, query, fieldIndex, field, type, cnt);
        
        let input = {
            '=': {
                [field]: val,
            },
            outputStyle: 'LOOKUP_RAW',
            page: 1,
            limit: 1
        };
        
        return this.model.run({ command: 'lookup', input }).then(res => {
            if (res.data.length) {
                if (10 <= cnt) {
                    this.addError('slugUnique', extra, field, val, type, errors);
                    
                    return;
                }
                
                return this.generateSlugUnique(extra, query, fieldIndex, field, type, cnt + 1);
            }
            
            query.setField(fieldIndex, field, val);
        });
    }
    
    generateUuid(extra, query, fieldIndex, field, type) {
        query.setField(fieldIndex, field, this.uuid());
    }

}
