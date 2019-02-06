"use strict";

var express = require('express');
var validator = require('validator');

var worldWidth = 1200, worldHeight = 1200;

var app = express();
var counter = 0;
var BALL_SPEED = 50;
var WIDTH = 1200;
var HEIGHT = 1200;
var TANK_INIT_HP = 100;
const DEFAULT_RANK = 'Noob';
var logged = 0;

//Static resources server
app.use(express.static(__dirname + '/www'));
app.use('/www/images', express.static('public'))

//app.use('/www/images',express.static(__dirname + '/www/images'));

var port = 80;

// run locally on my Mac -- change for your needs, for example
if(process.platform == 'darwin'){
	port = 8082;
}

var server = app.listen(process.env.PORT || port, function () {
	var port = server.address().port;
	console.log('Server running at port %s', port);
});

var io = require('socket.io')(server);

/**
	
	USER class

*/
class User {
  constructor() {
    this.id = 'id_1';
		this.kills = 0;
		this.deaths = 0;
		this.rank = DEFAULT_RANK;
		// name etc
  }
  set name(name) {
    this._name = name;
  }
  get name() {
    return this._name;
  }
	set kills(kills) {
		this._kills = kills;
	}
	get kills() {
		return this._kills;
	}
	set deaths(deaths) {
		this._deaths = deaths;
	}
	get deaths() {
		return this._deaths;
	}
	set rank(rank) {
		this._rank = rank;
	}
	get rank() {
		return this._rank;
	}
	leave() {
		// TODO
		console.log(this.name + ' left the game.');
	}
  sayHello() {
    console.log('Hello, my name is ' + this.name + ', I have ID: ' + this.id);
  }
}

var somePlayer = new User();
somePlayer.name = 'martin'; // The setter will be used automatically here.
somePlayer.sayHello();
console.log('His rank is ' + somePlayer.rank);
console.log(somePlayer.deaths);
somePlayer.leave();

/**

	GAMESERVER class

*/

function GameServer(){
	this.users = [];
	this.ships = [];
	this.bullets = [];
	this.lastBulletId = 0;
	this.outfits = [];
}

GameServer.prototype = {
	addUser: function(user){
		this.users.push(user)
	},
	
	addShip: function(ship){
		this.ships.push(ship);
	},

	addBullet: function(bullet){
		this.bullets.push(bullet);
	},

	addOutfit: function(outfit){
		this.outfits.push(outfit);
		console.log('added');
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

	// The app has absolute control of the bullets and their movement
	syncBullets: function(){
		var self = this;
		this.bullets.forEach( function(bullet){
			self.detectCollision(bullet);

			//Detect when bullet is out of bounds
			if(bullet.x < 0 || bullet.x > WIDTH
				|| bullet.y < 0 || bullet.y > HEIGHT){
				bullet.out = true;
			}else{
				bullet.fly();
			}
		});
	},
	
	syncOutfits: function(){
		var self = this;
		this.outfits.forEach( function(outfit){
			self.detectLoot(outfit);
		});
	},

	detectLoot: function(outfit){
		var self = this;
		
		this.ships.forEach( function(ship){
			if(Math.abs(ship.x - outfit.x) < 150
				&& Math.abs(ship.y - outfit.y) < 150){
				console.log('LOOT');
				self.lootOutfit(ship, outfit);
				outfit.out = true;
			}
		});
	},
	
	lootOutfit(ship, outfit){
		// ship.getOutfit(outfit);
		//console.log('loot func')
	},

	//Detect if bullet collides with any ship
	detectCollision: function(bullet){
		var self = this;

		this.ships.forEach( function(ship){
			if(ship.id != bullet.ownerId
				&& Math.abs(ship.x - bullet.x) < 150
				&& Math.abs(ship.y - bullet.y) < 150){
				//Hit ship
				self.hurtShip(ship, bullet.ownerId);
				bullet.out = true;
				bullet.exploding = true;
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
		// deadShip.rank += 1; // we don't track deaths in this model (ship = player)
		this.ships.forEach( function(ship){
			if(ship.id == killerId){
				ship.kills += 1;
				if(ship.kills > 10){
					ship.rank = 'The Boss.';
				} else {
					ship.rank = 'Apprentice'
				}
			}
		});
	},

	idIsAvailable: function(_id){
		if( ! Number.isInteger(_id) ){
			console.log('Id is not an integer.')
			return false;
		}
		this.ships.forEach( function(ship){
			if(ship.id == _id){
				// id already in use
				console.log('Id in use! Previous player: ' + ship.name);
				return false;
			}
		});
		return true;
	},
	
	isValidShoot: function(_bullet){
		this.ships.forEach( function(ship){
			if(ship.id == _bullet.ownerId){
				// user is dead
				if(ship.hp <= 0){
					return false;
				}
				// TODO check distance and position here
			}
		});
		return true;
	},
	
	getData: function(){
		var gameData = {};
		gameData.ships = this.ships;
		gameData.bullets = this.bullets;
		gameData.outfits = this.outfits;
		
		return gameData;
	},

	getScoreData: function(){
		var scoreData = [];
		this.ships.forEach( function(ship){
			scoreData.push({'id': ship.id, 'name': ship.name, 'kills': ship.kills, 'rank': ship.rank});
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

	cleanDeadBullets: function(){
		this.bullets = this.bullets.filter(function(bullet){
			return !bullet.out;
		});
	},

	cleanOutfits: function(){
		this.outfits = this.outfits.filter(function(outfit){
			return !outfit.out;
		});
	},

	increaseLastBulletId: function(){
		this.lastBulletId ++;
		if(this.lastBulletId > 1000){
			this.lastBulletId = 0;
		}
	}

}

var game = new GameServer();

/* Connection events */

io.on('connection', function(client) {
	client.on('joinGame', function(ship){
		ship.name = validator.whitelist(ship.name, /a-zA-Z0-9 /);
		console.log(ship.name + ' joined the game');
		console.log('His vessel type: ' + ship.type);
		console.log('His id: ' + ship.id);
		
		// TODO check if valid id
		console.log(game.idIsAvailable(ship.id));

		var initX = getRandomInt(100, worldWidth-200);
		var initY = getRandomInt(100, worldHeight-200);
		client.emit('addShip', { id: ship.id, name: ship.name, type: ship.type, isLocal: true, x: initX, y: initY, hp: TANK_INIT_HP});
		client.broadcast.emit('addShip', { id: ship.id, name: ship.name, type: ship.type, isLocal: false, x: initX, y: initY, hp: TANK_INIT_HP} );
		game.addShip({ id: ship.id, name:ship.name, type: ship.type, hp: TANK_INIT_HP, kills: 0, rank: 'Noob' });
	});

	client.on('sync', function(data){
		//Receive data from clients
		if(data.ship != undefined){
			game.syncShip(data.ship);
		}
		//update bullet positions
		game.syncBullets();
		game.syncOutfits();
		//Broadcast data to clients
		client.emit('sync', game.getData());
		client.broadcast.emit('sync', game.getData());

		//I do the cleanup after sending data, so the clients know
		//when the ship dies and when the bullets explode
		game.cleanDeadShips();
		game.cleanDeadBullets();
		game.cleanOutfits();
		counter ++;
	});

	client.on('shoot', function(bullet){
		console.log(bullet.ownerId);
		//game.isValidShoot();
		// Check if user can shoot
		// TODO check for position
		var bullet = new Bullet(bullet.ownerId, bullet.alpha, bullet.x, bullet.y );
		game.addBullet(bullet);
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

function Bullet(ownerId, alpha, x, y){
	this.id = game.lastBulletId;
	game.increaseLastBulletId();
	this.ownerId = ownerId;
	this.alpha = alpha; //angle of shot in radians
	this.x = x;
	this.y = y;
	this.out = false;
};

Bullet.prototype = {

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


setTimeout(function(){
	game.addOutfit({'name': 'laser', 'type': 'weapon', 'x': getRandomInt(100, worldWidth-200), 'y': getRandomInt(100, worldWidth-200)});	
}, 1200);