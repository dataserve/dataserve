"use strict"

const DataServe = require('./dataserve');

var dataserve = new DataServe('user');

var command = function(command) {
    console.log('query', command);
    switch (command[0].toLowerCase()) {
    case 'command':
        {
            this.encode(
                [
                    [
                        'ds_get',
                        3, //arrity
                        ['readonly', 'fast'], //flags
                        1, //first key in args
                        2, //last key in args
                        1, //step count
                    ],
                    [
                        'ds_get_multi',
                        3,
                        ['readonly', 'fast'],
                        1,
                        2,
                        1,
                    ],
                ]
            );
        }
        break;
    case 'ds_get':
        {
            let table = command[1];
            let input = JSON.parse(command[2]);
            let result = dataserve.get(input)
                .then(output => {
                    if (output.status) {
                        console.log('CALL SUCCESS:', JSON.stringify(output.result));
                    } else {
                        console.log('CALL FAIL:', JSON.stringify(output.error));
                    }
                });
            //this.encode([]);
        }
        break;
    case 'ds_get_multi':
        break;
    case 'ds_set':
        {
            let table = command[1];
            let input = JSON.parse(command[2]);
            let result = dataserve.set(input)
                .then(output => {
                    console.log("CALL RESULT:", output);
                    if (output.status) {
                        console.log('CALL SUCCESS');
                    } else {
                        console.log('CALL FAIL');
                    }
                });
        }
        break;
    case 'ds_add':
        {
            let table = command[1];
            let input = JSON.parse(command[2]);
            let result = dataserve.add(input)
                .then(output => {
                    console.log("CALL RESULT:", output);
                    if (output.status) {
                        console.log('CALL SUCCESS');
                    } else {
                        console.log('CALL FAIL');
                    }
                });
        }
        break;
    case 'ds_remove':
        {
            let table = command[1];
            let input = JSON.parse(command[2]);
            let result = dataserve.remove(input)
                .then(output => {
                    console.log("CALL RESULT:", output);
                    if (output.status) {
                        console.log('CALL SUCCESS');
                    } else {
                        console.log('CALL FAIL');
                    }
                });
        }
        break;
    case 'ds_remove_multi':
        break;
    case 'ds_lookup':
        break;
    }
}

module.exports = command;
