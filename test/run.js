var socket = require('socket.io-client')('http://localhost:8888');
socket.on('connect', function(){
    console.log('connected!');
    socket.emit('user.get', {id: 1}, (data) => {
        console.log('got data');
        console.log(data);
    });
});
socket.on('disconnect', function(){
    console.log('disconnected!');
    process.exit(-1);
});
