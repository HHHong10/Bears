var mysql = require('mysql');
var express = require('express');
var express2 = require('express')
var bodyParser = require('body-parser');
const app = express();
const app2 = express2();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));


const server = require('http').createServer(app2);
const io = require('socket.io')(server);


app.listen(3000, 'ec2-3-36-159-238.ap-northeast-2.compute.amazonaws.com', function () {
    console.log('3000 port 서버 실행 중...');
});

var connection = mysql.createConnection({
    host: "beardb.c4ujghepitdv.ap-northeast-2.rds.amazonaws.com",
    user: "bears",
    database: "bears",
    password: "bearsbears",
    port: 3306
});

connection.connect();

app.post('/drivers/login', function (req, res) {
    var BusId = req.body.BusId;
    var BusPwd = req.body.BusPwd;
    var sql = 'select * from drivers where BusId = ?';
    console.log(BusId + " " + BusPwd);

    connection.query(sql, [BusId], function (err, result) {
        var resultCode = 404;
        var message = '에러가 발생했습니다';
        

        if (err) {
            console.log(err);
        } else {
            if (result.length === 0) {
                resultCode = 204;
                message = '존재하지 않는 계정입니다!';
                console.log("존재하지 않는 계정");
            } else if (BusId !== result[0].BusId) {
                resultCode = 204;
                message = '아이디가 틀렸습니다!';
                console.log("아이디 틀림");
            } else if (BusPwd !== result[0].BusPwd) {
                resultCode = 204;
                message = '비밀번호가 틀렸습니다!';
                console.log("비밀번호 틀림");
            } else {
                resultCode = 200;
                var busname = result[0].BusNum;
                message = '로그인 성공! ' + result[0].BusId + '님 환영합니다!';
                console.log("로그인 성공");
            }
        }

        res.json({
            'code': resultCode,
            'message': message,
            'busname': busname
        });
    })
});

app.post('/user/boarding', (req,res)=>{
    var station = req.body.BusStopName;
    var bus = req.body.vehId;
    var sql = 'select * from drivers where BusVId = ?';
    console.log('Got boarding signal from ' + station);
    console.log('to ' + bus);

    connection.query(sql, [bus], function (err, result) {
        var resultCode = 404;
        var message = '에러가 발생했습니다';

        if (err) {
            console.log(err);
        } else {
            if (result.length === 0) {
                resultCode = 204;
                message = '존재하지 않는 버스입니다!';
                console.log("존재하지 않는 버스");
            } else if (bus !== result[0].BusVId) {
                resultCode = 204;
                message = '존재하지 않는 버스입니다!';
                console.log("존재하지 않는 버스");
            } else {
                resultCode = 200;
                message = '탑승 알림 전송 성공!';
                console.log("Got signal successfully");
                
                var id = result[0].BusId;
                var bea = result[0].BeaId;

                var sig = {
                    B : bus,
                    S : station,
                    R : id.slice(-2,id.length)
                }
                console.log(sig);

                connection.query('select * from drivers where BusVId = ?', [sig.B], function (er, result) {
                    if (er) {
                        console.log(er);
                    } else {
                        if (result[0].BusCon == 'T') {
                            io.sockets.in(sig.R).emit('board', JSON.stringify(sig.S));
                            console.log('Driver existence, send signal');
                        } else {
                            connection.query('INSERT INTO usersignal (Rnum, Sname) VALUES(?,?)', [sig.R, sig.S], function (err, results) {
                                if (er) {
                                    console.log(err);
                                } else {
                                    console.log('Room' + sig.R + ' driver absence, save signal in DB');
                                }
                            })
                        }
                    }
                })
            }
        }

        res.json({
            'code' : resultCode,
            'BeaId': bea,
            'message': message
        });
    })
});


io.sockets.on('connection', function (socket) {
    console.log('client connected');

    socket.on('enter', (data) => {
        const driverData = JSON.parse(data);

        const DDD = driverData.nameValuePairs;
        const busId = DDD.username;
        const roomNumber = DDD.roomNumber;

        connection.query("update drivers set BusCon = 'T' where BusId = ?", [busId], function (err, result) {
            if (err) {
                console.log(err);
            } else {
                console.log('[ID : ' + busId + ' ] entered and DB updated')
            }
        })   

        socket.join(`${roomNumber}`)
        console.log(`[BusId : ${busId}] entered [room number : ${roomNumber}]`)

        connection.query('select * from usersignal where Rnum = ?', [roomNumber], function (err, result) {
            if (err) {
                console.log(err);
            } else if (result.length < 1) {
                console.log('room number ' + roomNumber + ' empty waiting new signal')
            } else {
                var sig = [];
                for (var i = 0; i < result.length; i++) {
                    sig.push(result[i].Sname);
                }
                io.sockets.in(roomNumber).emit('board', JSON.stringify(sig));
                console.log('saved signal all send to [room number : ' + roomNumber + ' ]');

                connection.query('delete from usersignal where Rnum = ?', [roomNumber], function (err, result) {
                    if (err) {
                        console.log(err);
                    } else {
                        console.log('saved signal for room number ' + roomNumber + ' all deleted')
                    }
                })
            }
        })

        
    });

    socket.on('logout', function (data) {
        const busId = data;
        const roomNumber = busId.slice(-2, busId.length);

        socket.leave(`${roomNumber}`)
        console.log(`[room number : ${roomNumber}] is empty`)

        connection.query("update drivers set BusCon = 'F' where BusId = ?", [busId], function (err, result) {
            if (err) {
                console.log(err);
            } else {
                console.log('[ID : ' + busId + ' ] left and DB updated')
            }
        })  
    });

    socket.on('disconnect', function () {
        console.log('server disconnected');
    });
});

server.listen(8080, 'ec2-3-36-159-238.ap-northeast-2.compute.amazonaws.com', function () {
    console.log('8080 port 서버 실행 중...');
});