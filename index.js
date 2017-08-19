var express = require('express');
//var validator = require('validator');

var worldWidth = 1200, worldHeight = 1200;

var app = express();
var counter = 0;
var BALL_SPEED = 50;
var WIDTH = 1200;
var HEIGHT = 1200;
var TANK_INIT_HP = 100;
var logged = 0;

//Static resources server
app.use(express.static(__dirname + '/www'));
app.use('/www/images', express.static('public'))

//app.use('/www/images',express.static(__dirname + '/www/images'));

var ipaddress = process.env.OPENSHIFT_NODEJS_IP || "127.0.0.1";
var port = process.env.OPENSHIFT_NODEJS_PORT || 8080;
if(process.platform == 'darwin'){
	port = 8082;
}

var server = app.listen(process.env.PORT || port, function () {
	var port = server.address().port;
	console.log('Server running at port %s', port);
});

var io = require('socket.io')(server);

function GameServer(){
	this.ships = [];
	this.balls = [];
	this.lastBallId = 0;
}

GameServer.prototype = {

	addShip: function(ship){
		this.ships.push(ship);
	},

	addBall: function(ball){
		this.balls.push(ball);
	},

	removeShip: function(shipId){
		//Remove ship object
		this.ships = this.ships.filter( function(t){return t.id != shipId} );
	},

	//Sync ship with new data received from a client
	syncShip: function(newShipData){
		this.ships.forEach( function(ship){
			if(ship.id == newShipData.id){
				ship.x = newShipData.x;
				ship.y = newShipData.y;
				ship.baseAngle = newShipData.baseAngle;
				ship.cannonAngle = newShipData.cannonAngle;
			}
		});
	},

	//The app has absolute control of the balls and their movement
	syncBalls: function(){
		var self = this;
		//Detect when ball is out of bounds
		this.balls.forEach( function(ball){
			self.detectCollision(ball);

			if(ball.x < 0 || ball.x > WIDTH
				|| ball.y < 0 || ball.y > HEIGHT){
				ball.out = true;
			}else{
				ball.fly();
			}
		});
	},

	//Detect if ball collides with any ship
	detectCollision: function(ball){
		var self = this;

		this.ships.forEach( function(ship){
			if(ship.id != ball.ownerId
				&& Math.abs(ship.x - ball.x) < 150
				&& Math.abs(ship.y - ball.y) < 150){
				//Hit ship
				self.hurtShip(ship, ball.ownerId);
				ball.out = true;
				ball.exploding = true;
			}
		});
	},

	hurtShip: function(ship, attackerId){
		ship.hp -= 10;
		if(ship.hp <= 0 && ! ship.dead){
			this.updateLeaderBoard(ship, attackerId);
			/*setTimeout(function(){
				ship.hp = 100;
				ship.dead = false;
			}, 3000);*/
			ship.dead = true;
		}
	},

	updateLeaderBoard: function(deadShip, killerId){
		deadShip.deaths += 1;
		this.ships.forEach( function(ship){
			if(ship.id == killerId){
				ship.kills += 1;
			}
		});
	},

	getData: function(){
		var gameData = {};
		gameData.ships = this.ships;
		gameData.balls = this.balls;

		return gameData;
	},

	getScoreData: function(){
		var scoreData = [];
		this.ships.forEach( function(ship){
			scoreData.push({'id': ship.id, 'name': ship.name, 'kills': ship.kills, 'deaths': ship.deaths});
		});
		return scoreData;
	},

	respawnShip: function(shipId){
		/*this.ships.forEach( function(ship){
			if(ship.id == shipId){
				ship.hp = 100;
				ship.dead = false;
				return ship;
			}
		})*/
	},

	cleanDeadShips: function(){
		this.ships = this.ships.filter(function(t){
			return t.hp > 0;
		});
	},

	cleanDeadBalls: function(){
		this.balls = this.balls.filter(function(ball){
			return !ball.out;
		});
	},

	increaseLastBallId: function(){
		this.lastBallId ++;
		if(this.lastBallId > 1000){
			this.lastBallId = 0;
		}
	}

}

var game = new GameServer();

/* Connection events */

io.on('connection', function(client) {
	client.on('joinGame', function(ship){
		// validator.whitelist() seems to have no effect in version 8.0.0
		//ship.name = validator.whitelist(ship.name, /[a-zA-Z0-9 -]/);
		console.log(ship.name + ' joined the game');
		console.log('His type:' + ship.type);
		var initX = getRandomInt(100, worldWidth-200);
		var initY = getRandomInt(100, worldHeight-200);
		client.emit('addShip', { id: ship.id, name: ship.name, type: ship.type, isLocal: true, x: initX, y: initY, hp: TANK_INIT_HP});
		client.broadcast.emit('addShip', { id: ship.id, name: ship.name, type: ship.type, isLocal: false, x: initX, y: initY, hp: TANK_INIT_HP} );
		game.addShip({ id: ship.id, name:ship.name, type: ship.type, hp: TANK_INIT_HP, kills: 0, deaths: 0 });
	});

	client.on('sync', function(data){
		//Receive data from clients
		if(data.ship != undefined){
			game.syncShip(data.ship);
		}
		//update ball positions
		game.syncBalls();
		//Broadcast data to clients
		client.emit('sync', game.getData());
		client.broadcast.emit('sync', game.getData());

		//I do the cleanup after sending data, so the clients know
		//when the ship dies and when the balls explode
		game.cleanDeadShips();
		game.cleanDeadBalls();
		counter ++;
	});

	client.on('shoot', function(ball){
		var ball = new Ball(ball.ownerId, ball.alpha, ball.x, ball.y );
		game.addBall(ball);
	});

	client.on('respawnRequest', function(shipId){
		console.log('Got a respawn request for ship ' + shipId);
		io.sockets.emit('updateLeaderBoard', game.getScoreData() );
		setTimeout(function(){
			var ship = game.respawnShip();
			client.emit('respawnShip', ship);
		}, 3000);
	});

	client.on('leaveGame', function(shipId){
		console.log(shipId + ' has left the game');
		game.removeShip(shipId);
		client.broadcast.emit('removeShip', shipId);
	});

});

function Ball(ownerId, alpha, x, y){
	this.id = game.lastBallId;
	game.increaseLastBallId();
	this.ownerId = ownerId;
	this.alpha = alpha; //angle of shot in radians
	this.x = x;
	this.y = y;
	this.out = false;
};

Ball.prototype = {

	fly: function(){
		//move to trayectory
		var speedX = BALL_SPEED * Math.sin(this.alpha);
		var speedY = -BALL_SPEED * Math.cos(this.alpha);
		this.x += speedX;
		this.y += speedY;
	}

}

function getRandomInt(min, max) {
	return Math.floor(Math.random() * (max - min)) + min;
}
