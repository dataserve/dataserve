"use strict"

const ALLOWED_OUTPUT_STYLE = [
    "BY_ID",
    "INCLUDE_FOUND",
    "FOUND_ONLY"
];

class Query {

    constructor(input, command, model) {
        this.input = input;
        
        this.alias = "";
        this.get = {
            field: null,
            vals: null,
        };
        this.get_multi = {
            field: null,
            vals: null,
        };
        this.primary_key = null;
        this.fields = {};

        this.join = {};
        this.inner_join = {};
        
        this.where = [];
        this.bind = {};
        this.group = [];
        this.order = [];
        this.limit = {};

        this.custom = [];

        this.fillin = {};
        
        this.output_style = [];

        this.single_row_result = false;

        this.build(input, command, model);
    }

    build(input, command, model) {
        if (input.alias) {
            this.set_alias(input.alias);
        } else {
            this.set_alias(model._table().substring(0, 1));
        }
        if (input.fields) {
            for (let field in input.fields) {
                this.set_field(field, input.fields[field]);
            }
        }
        if (input.join) {
            for (let table in input.join) {
                this.set_field(table, input.join[table]);
            }
        }
        if (input.inner_join) {
            for (let table in input.inner_join) {
                this.set_field(table, input.inner_join[table]);
            }
        }
        if (input.where) {
            this.add_where(input.where, input.bind ? input.bind : null);
        }
        if (input.group) {
            this.add_group(input.group);
        }
        if (input.order) {
            this.add_order(input.order);
        }
        if (input.page && input.limit) {
            this.set_limit(input.page, input.limit);
        }
        if (input.custom) {
            this.add_custom(input.custom);
        }
        if (input.fillin) {
            for (let table in input.fillin) {
                this.set_fillin(table, input.fillin[table]);
            }
        }
        if (input.output_style) {
            this.add_output_style(input.output_style);
        }
        if (input[model.get_primary_key()]) {
            this.set_primary_key(input[model.get_primary_key()]);
        }

        switch (command) {
        case "add":
            for (let field in input) {
                if (model.is_fillable(field)) {
                    this.set_field(field, input[field]);
                }
            }
            break;
        case "get":
            if (this.primary_key) {
                this.set_get(model.get_primary_key(), this.primary_key);
            } else {
                for (let field in input) {
                    if (model.is_unique(field)) {
                        this.set_get(field, input[field]);
                    }
                }
            }
            break;
        case "get_multi":
            for (let field in input) {
                if (model.is_get_multi(field)) {
                    this.set_get_multi(field, input[field]);
                }
            }
            break;
        case "lookup":
            break;
        case "set":
            for (let field in input) {
                if (model.is_fillable(field)) {
                    this.set_field(field, input[field]);
                }
            }
            break;
        }
    }

    raw(field) {
        return this.input[field];
    }
  
    set_alias(alias) {
        this.alias = alias;
    }

    set_primary_key(val) {
        this.primary_key = val;
    }
    
    set_get(field, vals) {
        if (!Array.isArray(vals)) {
            vals = [vals];
            this.single_row_result = true;
        } else if (!vals.length) {
            return;
        }
        this.get.field = field;
        this.get.vals = vals;
    }

    has_get() {
        return this.get.field ? true : false;
    }

    set_get_multi(field, vals) {
        if (!Array.isArray(vals)) {
            vals = [vals];
            this.single_row_result = true;
        } else if (!vals.length) {
            return;
        }
        this.get_multi.field = field;
        this.get_multi.vals = vals;
    }

    has_get_multi() {
        return this.get_multi.field ? true : false;
    }
    
    set_field(field, val) {
        this.fields[field] = val;
    }

    has_fields() {
        return Object.keys(this.fields).length ? true: false;
    }

    add_join(table, on) {
        this.join[table] = on;
    }

    add_inner_join(table, on) {
        this.inner_join[table] = on;
    }

    add_where(where, binds) {
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

    add_group(group) {
        if (!Array.isArray(group)) {
            group = [group];
        } else if (!group.length) {
            return;
        }
        this.group = this.group.concat(group);
    }

    add_order(order) {
        if (!Array.isArray(order)) {
            order = [order];
        } else if (!order.length) {
            return;
        }
        this.order = this.order.concat(order);
    }

    set_limit(page, limit) {
        this.limit = {
            page: page,
            limit: limit,
        };
    }

    add_custom(custom) {
        if (!Array.isArray(custom)) {
            custom = [custom];
        } else if (!custom.length) {
            return;
        }
        this.custom = this.custom.concat(custom);
    }

    set_fillin(field, val) {
        this.fillin[field] = val;
    }

    has_fillin() {
        return Object.keys(this.fillin).length ? true : false;
    }
    
    valid_output_style(style) {
        if (ALLOWED_OUTPUT_STYLE.indexOf(style) === -1) {
            return false;
        }
        return true;
    }
    
    add_ouput_style(style) {
        if (!Array.isArray(style)) {
            style = [style];
        } else if (!style.length) {
            return;
        }
        for (let st of style) {
            if (!this.valid_output_style(st)) {
                continue;
            }
        }
        this.output_style = this.output_style.concat(style);
    }

    set_output_style(style) {
        if (!Array.isArray(style)) {
            style = [style];
        }
        //CAN SET TO EMPTY ARRAY
        let style_valid = [];
        for (let st of style) {
            if (!this.valid_output_style(st)) {
                continue;
            }
            style_valid.push(style);
        }
        this.output_style = style_valid;
    }

    is_output_style(style) {
        return this.output_style.indexOf(style) !== -1;
    }
}

module.exports = Query;
