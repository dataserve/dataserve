"use strict"

const Type = require('type-of-is');

const ALLOWED_RULES = {
    "email": [
        "String",
    ],
    "in": [
        "Array",
        "Number",
        "String",
    ],
    "ip_address": [
        "String",
    ],
    "ip_address_v4": [
        "String",
    ],
    "ip_address_v6": [
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
};

class Validate {

    constructor() {
        this.validator = require('validator');
        this.ip = require('ip');
    }

    check(field, val, rules, errors) {
        rules = rules.split("|");
        for (let split of rules) {
            let [rule, extra] = split.split(":");
            if (rule === "required") {
                if (typeof val === "undefined" || val === null) {
                    errors[field] = "The " + field + " is required";
                }
                continue;
            }
            if (!ALLOWED_RULES[rule]) {
                errors[field] = "Invalid rule " + rule + " for field " + field;
                continue;
            }
            let type = Type.string(val);
            if (ALLOWED_RULES[rule].indexOf(type) === -1) {
                errors[field] = "Invalid value type " + type + " for field " + field;
                continue;
            }
            this["validate_" + rule](extra, field, val, type, errors);
        }
    }

    validate_email(extra, field, val, type, errors) {
        let err_str = field + " must be a valid email address";
        if (!this.validator.isEmail(val)) {
            errors[field] = err_str;
        }
    }

    validate_in(extra, field, val, type, errors) {
        let err_str = field + " must be one of " + extra;
        extra = extra.split(",");
        switch (type) {
        case "Array":
            for (let v of val) {
                if (extra.indexOf(v) === -1) {
                    errors[field] = err_str;
                    break;
                }
            }
            break;
        case "Number":
        case "String":
            if (extra.indexOf(val) === -1) {
                errors[field] = err_str;
            }
            break;
        }
    }

    validate_ip_address(extra, field, val, type, errors) {
        let err_str = field + " must be a valid ip address";
        if (!this.ip.isV4Format(val) && !this.ip.isV6Format(val)) {
            errors[field] = err_str;
        }
    }

    validate_ip_address_v4(extra, field, val, type, errors) {
        let err_str = field + " must be a valid v4 ip address";
        if (!this.ip.isV4Format(val)) {
            errors[field] = err_str;
        }
    }

    validate_ip_address(extra, field, val, type, errors) {
        let err_str = field + " must be a valid v6 ip address";
        if (!this.ip.isV6Format(val)) {
            errors[field] = err_str;
        }
    }

    validate_min(extra, field, val, type, errors) {
        let err_str = field + " must be greater than " + extra;
        switch (type) {
        case "Array":
        case "String":
            if (val.length < extra) {
                errors[field] = err_str;
            }
            break;
        case "Date":
            if (val < new Date(extra)) {
                errors[field] = err_str;
            }
            break;
        case "Number":
            if (val < extra) {
                errors[field] = err_str;
            }
            break;
        }
    }

    validate_max(extra, field, val, type, errors) {
        let err_str = field + " must be less than " + extra;
        switch (type) {
        case "Array":
        case "String":
            if (extra < val.length) {
                errors[field] = err_str;
            }
            break;
        case "Date":
            if (new Date(extra) < val) {
                errors[field] = err_str;
                break;
            }
        case "Number":
            if (extra < val) {
                errors[field] = err_str;
            }
            break;
        }
    }


}

module.exports = Validate;
