'use strict'

var mysql = require('mysql');

class MySql {
    
    constructor(){
        this._pool = mysql.createPool({
            connectionLimit: 500,
            host: 'localhost',
            user: 'dataserve',
            password: 'jzVasYqfEdN6o7Kp',
            database: 'dataserve',
        });
    }

    query(sql, bind, force_master, db_override){
        return new Promise((resolve, reject) => {
            this._pool.getConnection((err, connection) => {
                if (err) {
                    return reject(err);
                }

                connection.config.queryFormat = function (query, values) {
                    if (!values) return query;
                    return query.replace(/\:(\w+)/g, function (txt, key) {
                        if (values.hasOwnProperty(key)) {
                            return this.escape(values[key]);
                        }
                        return txt;
                    }.bind(this));
                };

                if (true) {
                    console.log(sql);
                }
                
                connection.query(sql, bind, (error, results, fields) => {
                    connection.release();

                    if (error) {
                        return reject(error);
                    }
                    
                    return resolve(results);
                });
            });
        });
    }
    
}

module.exports = MySql;
