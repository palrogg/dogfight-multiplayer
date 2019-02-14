var DEBUG = true;
var INTERVAL = 50;
var ROTATION_SPEED = 5;
var ARENA_MARGIN = 30;
var MULTI = true;
var trailEmitters = [];
var lastUpdate = Date.now();
var lastShoot = 0, shootPosition = -20;

var shipSpecs = {
	'leviathan': {
  	'texture': '//res.cloudinary.com/dogfight/image/upload/v1499983263/leviathan_yk4ezv.png',
    'mass': 480,
		'maxSpeed': 120,
		'maneuverability': 0.005,
    'properties': `engine -25 125
	engine 25 125
	gun -39 -33 "Particle Cannon"
	gun 39 -33 "Particle Cannon"
	gun -51 -21 "Particle Cannon"
gun 51 -21 "Particle Cannon"`
  },
	'falcon': {
  	'texture': '//res.cloudinary.com/dogfight/image/upload/v1500035643/mfalconw_opvp7t.png',
    'mass': 510,
    'properties': `engine -17 143
      engine 17 143
      gun -17 -88 "Plasma Cannon"
      gun 17 -88 "Plasma Cannon"
      gun -17 -88 "Torpedo Launcher"
      gun 17 -88 "Torpedo Launcher"`
  },
	'firebird': {
  	'texture': '//res.cloudinary.com/dogfight/image/upload/v1500035611/mfirebirdw_hoigix.png',
    'mass': 290,
    'properties': `engine -33 65
      engine 33 65
      gun -28 -27 "Heavy Laser"
      gun 28 -27 "Heavy Laser"
      gun -39 -13 "Heavy Laser"
      gun 39 -13 "Heavy Laser"`
  }
};

var app = new PIXI.Application(900, 600, {backgroundColor : 0x111111});
document.body.appendChild(app.view);
var universe = new PIXI.Container();
var bulletContainer = new PIXI.Container();
var outfitContainer = new PIXI.Container();
app.stage.position.x = app.renderer.width / 2;
app.stage.position.y = app.renderer.height / 2;

app.stage.addChild(universe);

var universeWidth = 1200;
var universeHeight = 1200;



/* =========== STARS */
// from https://codepen.io/shableep/pen/RWZmrg
var sprites = new PIXI.particles.ParticleContainer(800, {
    scale: true,
    position: true,
    rotation: false,
    uvs: false,
    alpha: true
});
universe.addChild(sprites);

for (var i = 0; i < 800; i++) {
    var star = PIXI.Sprite.fromImage('//res.cloudinary.com/dogfight/image/upload/v1500022202/circle-16x16_kjgyem.png');
    star.scale.set(0.1 + Math.random() * 0.3);
    star.alpha = 0.6 + 0.4 * Math.random();
    star.x = Math.random() * (universeWidth + 1000) - 500;
    star.y = Math.random() * (universeHeight + 1000) - 500;
    sprites.addChild(star);
}

function createPlanet(texturePath){
	var planet = PIXI.Sprite.fromImage(texturePath);
  planet.x = Math.random() * app.renderer.width;
  planet.y = Math.random() * app.renderer.height;
  universe.addChild(planet);
}
createPlanet('http://res.cloudinary.com/dogfight/image/upload/v1500022952/ice4_kdvmdm.png');

/* ===== == limits === ===== */

var textureLimit = PIXI.Texture.fromImage('images/ring/ringworld.png');

var universeLimitTop = new PIXI.extras.TilingSprite(textureLimit, universeWidth, 30);
universeLimitTop.rotation = Math.PI;
universeLimitTop.x = universeWidth;
var universeLimitLeft = new PIXI.extras.TilingSprite(textureLimit, universeWidth, 30);
universeLimitLeft.rotation = Math.PI / 2;

var universeLimitBottom = new PIXI.extras.TilingSprite(textureLimit, universeWidth, 30);
universeLimitBottom.y = universeHeight;

var universeLimitRight = new PIXI.extras.TilingSprite(textureLimit, universeWidth, 30);
universeLimitRight.rotation = - Math.PI / 2;
universeLimitRight.x = universeWidth;
universeLimitRight.y = universeHeight;


universe.addChild(universeLimitTop);
universe.addChild(universeLimitLeft);
universe.addChild(universeLimitBottom);
universe.addChild(universeLimitRight);
universe.addChild(outfitContainer);
universe.addChild(bulletContainer);


/* ===== ====== ===== */

function Game(arenaId, w, h, socket){
	this.ships = []; //Ships (other than the local ship)
	this.bullets = [];
	this.width = w;
	this.height = h;
	this.$arena = $(arenaId);
	// Outfits
	this.outfits = [];
	this.glowVar = -4;
	this.lastGlow = 0;
  if(MULTI){
  	this.socket = socket;
  }
	var g = this;
	setInterval(function(){
		g.mainLoop();
	}, INTERVAL);
}

Game.prototype = {
	addOutfit: function(name, type, x, y){
		var outfit = new Outfit(name, type, x, y);
		outfit.materialize();
		this.outfits.push(outfit);
	},

	addToLeaderboard: function(ship, isLocal){

		var isLocalClass = isLocal ? 'local score' : 'score';

		$('#leaderboard table').append(`
			<tr id="` +  ship.id + `" class="` + isLocalClass + `">
				<td></td>
				<td>` + ship.name + `</td>
				<td>` + ship.kills + `</td>
				<td>` + ship.rank + `</td>
			</tr>
			`);

		$('#messageBoard').append('<p>' + ship.name + ' joined the game.</p>').animate({
    	opacity: 0
		}, 3000, function() {
			$('#messageBoard').html('');
		});
	},

	addShip: function(id, name, type, isLocal, x, y, hp, kills, rank){
		var t = new Ship(id, name, type, this.$arena, this, isLocal, x, y, hp, kills, rank);
		if(isLocal){
			this.localShip = t;
		}else{
			if(game.localShip){
				jumpInSound.play();
			}
			this.ships.push(t);
		}
		if(!$('#' + id).length){ // TODO: remove this manual check, improve logical flow
			this.addToLeaderboard(t, t.isLocal);
		}

	},

	removeShip: function(ship){
		//Remove ship object
		this.ships = this.ships.filter( function(t){return t.id != ship.id} );
		//remove ship from scene
		universe.removeChild(ship.container);
		console.log('One ship removed. Ships[] length is now ' + this.ships.length);
	},

	// Someone (this may include the player) looted the weapon
	removeOutfit: function(outfit){
		this.outfits = this.outfits.filter( function(o){return o.id != outfit.id} );
		universe.removeChild(outfit.sprite);		
	},
	
	lootEvent: function(outfitData){
		console.log(outfitData);
		// our user looted
		if(game.localShip.id == outfitData.looterId){
			console.log('yeah twas us')
			this.localShip.outfits.push(outfitData.outfit.name)
		}else{
			// Some freaking sound / animation here
			console.log('not same id')
		}
		
		// another user looted
	},
	
	killShip: function(ship){
		console.log('KILLTANK CALLED - ' + Date.now())
		console.log('Is the ship already dead?')
		console.log(ship.dead)
		console.log(ship);
		ship.dead = true;

		//ship.container.visible = false;

		// explosion sound and animation
		explosionSound.play();
		var explosionFrames = [];
		for (var i = 0; i < 10; i++) {
				explosionFrames.push(PIXI.Texture.fromImage('//res.cloudinary.com/dogfight/image/upload/v1499983451/explosion/huge_' + i + '.png'));
		}

		if(ship.id == game.localShip.id){
			setTimeout(function(){
				if(ship.id == game.localShip.id){
					$('#ship-name').hide();
					$('#join').addClass('fullWidth');
					$('#join').val('Try again, ' + ship.name);
					$('#prompt').show();
				}
			}, 1000);

		var explosionAnimation = new PIXI.extras.AnimatedSprite(explosionFrames);
		explosionAnimation.loop = false;
		if(explosionAnimation.anchor){
			explosionAnimation.anchor.set(0.5);
		}else{
			console.log('Explosion has no anchor')
		}

		explosionAnimation.x = ship.x;
		explosionAnimation.y = ship.y;
		explosionAnimation.animationSpeed = 1;
		explosionAnimation.play();
		universe.addChild(explosionAnimation);

		explosionAnimation.onComplete = function(){
			universe.removeChild(this);
			this.destroy();
			} // end animation onComplete
		}

		this.removeShip(ship);

	},

	respawnShip: function(){
		this.localShip.hp = 100;
		this.localShip.dead = false;
		//this.localShip.container.visible = true;
	},

	mainLoop: function(){
		if(this.localShip != undefined){
			//send data to server about local ship
			this.sendData();
			//move local ship
			this.localShip.move();
		}
	},

	sendData: function(){
		//Send local data to server
		var gameData = {};

		//Send ship data
		var t = {
			id: this.localShip.id,
			x: this.localShip.x,
			y: this.localShip.y,
			name: this.localShip.name,
			type: this.localShip.type,
			baseAngle: this.localShip.baseAngle,
			cannonAngle: this.localShip.cannonAngle
		};
		gameData.ship = t;
		//Client game does not send any info about bullets,
		//the server controls that part
    if(MULTI){
    	this.socket.emit('sync', gameData);
    }

	},

	receiveData: function(serverData){
		var game = this;
		
		serverData.outfits.forEach( function(serverOutfit){
			var found = false;
			game.outfits.forEach( function(clientOutfit){
				if(clientOutfit.id == serverOutfit.id){
					found = true;
					if(serverOutfit.out){
						game.removeOutfit(clientOutfit);
					}
				}
			} );
			
			if(!found){ // new outfit has popped
				console.log(serverOutfit);
				game.addOutfit(serverOutfit.name, serverOutfit.type, serverOutfit.x, serverOutfit.y);
			}
		});
		
		serverData.ships.forEach( function(serverShip){

			//Update local ship stats
			if(game.localShip !== undefined && serverShip.id == game.localShip.id){

				game.localShip.hp = serverShip.hp;

				if(game.localShip.hp <= 0 && !game.localShip.dead){
					game.killShip(game.localShip);
					//game.localShip.hp = 100;
					sendRespawnRequest(game.localShip.id);
				}
			}
			
			
			//Update foreign ships
			var found = false;
			var counter = 1;
			game.ships.forEach( function(clientShip){
				//update foreign ships
				if(clientShip.id == serverShip.id){

					clientShip.x = serverShip.x;
					clientShip.y = serverShip.y;
					clientShip.name = serverShip.name;
					clientShip.type = serverShip.type;
					clientShip.baseAngle = serverShip.baseAngle;
					clientShip.cannonAngle = serverShip.cannonAngle;
					clientShip.hp = serverShip.hp;
					if(clientShip.hp <= 0 && !clientShip.dead){
						console.log('Counter = ' + counter)
						counter++;
						console.log('GAME TANKS:')
						console.log(game.ships)
						game.killShip(clientShip);
					}
					clientShip.refresh();
					found = true;
				}
			});
			if(!found &&
				(game.localShip == undefined || serverShip.id != game.localShip.id)){
				//I need to create it
				game.addShip(serverShip.id, serverShip.name, serverShip.type, false, serverShip.x, serverShip.y, serverShip.hp);
			}
		});

		//Render bullets

		for (var i = bulletContainer.children.length - 1; i >= 0; i--){
			bulletContainer.removeChild(bulletContainer.children[i]);
		};

		serverData.bullets.forEach( function(serverBullet){
			var b = new Bullet(serverBullet.id, serverBullet.ownerId, game.$arena, serverBullet.x, serverBullet.y, serverBullet.alpha);
			b.exploding = serverBullet.exploding;
			if(b.exploding){
				b.explode();
			}
		});
	}
}

/*
	OUTFIT class
	weapons
	shields
	...
*/
function Outfit(name, type, x, y){
	this.name = name;
  this.type = type;
  this.x = x;
  this.y = y;
  this.active = true;
  this.sprite = null;
}
Outfit.prototype = {
	materialize: function(){
    	var spriteURLs = {
    	'twinWeapons': 'https://res.cloudinary.com/dogfight/image/upload/v1531467481/outfit/hai_rifle.png',
      'minishield': 'http://res.cloudinary.com/dogfight/image/upload/c_scale,w_67/v1531467481/outfit/blue_sun.png'
    }
    var outfitSprite = PIXI.Sprite.fromImage(spriteURLs[this.name]);
		outfitSprite.filters = [
      // new PIXI.filters.GlowFilter(10, 2, 1, 0xCCFF00, 0.5)
    ];
    outfitSprite.x = this.x;
    outfitSprite.y = this.y;
    outfitSprite.anchor.set(0.5);
    
    universe.addChild(outfitSprite);
    this.sprite = outfitSprite;
  },
  respawn: function(){
  	
  },
	remove: function(){
		console.log('remove')
		universe.removeChild(this);
	}
};

function Bullet(id, ownerId, $arena, x, y, alpha){
	this.id = id;
	this.ownerId = ownerId;
	this.$arena = $arena;
	this.x = x;
	this.y = y;
	this.alpha = alpha;

	this.materialize();
}

Bullet.prototype = {

	materialize: function(){
		var bulletSprite = PIXI.Sprite.fromImage('//res.cloudinary.com/dogfight/image/upload/v1499983127/ship/plasma_1.png');

		//shipSprite.anchor.set(0.5);
		bulletSprite.anchor.set(0.5);
		bulletSprite.x = this.x;
		bulletSprite.y = this.y;
		bulletSprite.rotation = this.alpha;
		bulletContainer.addChild(bulletSprite);
		this.sprite = bulletSprite;
	},

	explode: function(){
		var bulletHitAnimation = new PIXI.extras.AnimatedSprite(bulletHitFrames);
		bulletHitAnimation.loop = false;
		bulletHitAnimation.onComplete = function(){
			universe.removeChild(this);
		}
		bulletHitAnimation.anchor.set(0.5);
		bulletHitAnimation.x = this.x;
		bulletHitAnimation.y = this.y;
		bulletHitAnimation.animationSpeed = 1;
    bulletHitAnimation.play();
		universe.addChild(bulletHitAnimation);
	}
}

function Ship(id, name, type, $arena, game, isLocal, x, y, hp, kills, rank){
	this.id = id;
	this.name = name;
	this.type = type;
	this.speed = 0;
	this.xSpeed = 0;
	this.ySpeed = 0;
	this.maxSpeed = 100;
	this.acceleration = 4; // 0.0001;
	this.maneuverability = 0.003;
	this.$arena = $arena;
	this.w = 60;
	this.h = 80;
	this.baseAngle = getRandomInt(0, 1);
	this.cannonAngle = 0;
	this.x = x;
	this.y = y;
	this.mx = null;
	this.my = null;
	this.outfits = [];
	this.dir = {
		up: false,
		down: false,
		left: false,
		right: false
	};
	this.game = game;
	this.isLocal = isLocal;
	this.hp = hp;
	if(!kills) kills = 0;
	if(!rank) rank = 'Noob';
	this.kills = kills;
	this.rank = rank;
	this.dead = false;

	this.materialize();
}

Ship.prototype = {
	materialize: function(){

  	function readProperties(rawText){ // to read text properties of Endless Sky ships
    	if(rawText == ''){
        return null;
      }
      var engines = [];
      var guns = [];
      rawText.split('\n').forEach( function(line){
        var contents = $.trim(line).split(' ');
        if(contents[0] == 'gun'){
          guns.push({'x': parseInt(contents[1]), 'y': parseInt(contents[2])})
        }
        if(contents[0] == 'engine'){
          engines.push({'x': parseInt(contents[1]), 'y': parseInt(contents[2])})
        }
      });
			loadTrails();
      return {'engines': engines, 'guns': guns}
    }

 		this.container = new PIXI.Container();

		var shipSprite = PIXI.Sprite.fromImage(shipSpecs[this.type].texture);

		shipSprite.anchor.set(0.5);
		this.container.x = app.renderer.width / 2;
		this.container.y = app.renderer.height / 2;
		universe.addChild(this.container);
		this.container.addChild(shipSprite);
		this.sprite = shipSprite;

		this.healthBar = new PIXI.Graphics();
		this.healthBar.lineStyle(0);
		this.healthBar.beginFill(0x00ff00);
		this.healthBar.drawRect(0, 0, 100, 10)
		this.healthBar.endFill();
		this.healthBar.x = -50;
		this.healthBar.y = -120;

    this.trailEmitters = [];
    this.specs = readProperties(shipSpecs[this.type].properties)
		shootPosition = this.specs.guns[0].x;
		this.container.addChild(this.healthBar);

		this.nameText = new PIXI.Text(this.name, new PIXI.TextStyle({
	    fontSize: 14,
	    fill: this.isLocal ? '#00ff00' : '#ff0000'}));
		this.nameText.x = -50;
		this.nameText.y = -160;
		this.container.addChild(this.nameText);

		this.refresh();
		if(this.isLocal){
			this.setControls();
		}
	},

  addEmitters: function(data){
    this.trailEmitters[0] = createTrail(data, this, this.specs.engines[0]);
    this.trailEmitters[1] = createTrail(data, this, this.specs.engines[1]);
    trailEmitters.push(game.localShip.trailEmitters[0]);
    trailEmitters.push(game.localShip.trailEmitters[1]);

  },

	isMoving: function(){
		return this.dir.up || this.dir.down || this.dir.left || this.dir.right;
	},

	refresh: function(){
		this.container.x = this.x;
		this.container.y = this.y;
		this.sprite.rotation = this.baseAngle;

		if(this.hp){
			this.healthBar.clear();
			this.healthBar.lineStyle(0);
			this.healthBar.beginFill(getGreenToRedHex(this.hp));
			this.healthBar.drawRect(0, 0, 100, 10)
			this.healthBar.endFill();
		}

	},

	setControls: function(){
		var t = this;

		/* Detect both keypress and keyup to allow multiple keys
		 and combined directions */
		$(document).keydown( function(e){
			var k = e.which;
			switch(k){
				case 9:
					e.preventDefault();
					t.shootRequest = true;
					break;
				case 17: // ctrl
				case 32: // o
					t.shootRequest = true;
					break;
        case 80:
        	console.log('Autodestruction')
          game.killShip(t);
				case 38: // arrow up
				case 87: //W
					t.dir.up = true;
					break;
				case 39: // arrow right
				case 68: //D
					t.dir.right = true;
					break;
				case 40: // arrow down
				case 83: //S
					t.dir.down = true;
					/*if(t.dead != true){
						console.log('Autodestruction')
						game.killShip(t);
					}else{
						console.log('already †††')
					}*/
					break;
				case 37: // arrow left
				case 65: //A
					t.dir.left = true;
					break;
			}

		}).keyup( function(e){
			var k = e.which;
			switch(k){
				case 9: // tab
				case 17: // ctrl (in the browser, the tab key...)
				case 32:
					t.shootRequest = false;
					break;
				case 38: // arrow up
				case 87: //W
					t.dir.up = false;
					break;
				case 39: // arrow right
				case 68: //D
					t.dir.right = false;
					break;
				case 83: //S
					t.dir.down = false;
					break;
				case 37: // arrow left
				case 65: //A
					t.dir.left = false;
					break;
			}
		});
	},

	move: function(){
		if(this.dead){
			return;
		}

		var now = Date.now();
		var dt = now - lastUpdate;
		lastUpdate = now;

    for(item in trailEmitters){
      trailEmitters[item].update(dt * 0.001);
    }

		var thrustRequest = 0;
		var rotateRequest = 0;

    this.trailEmitters.forEach(function(item){
      item.emit = false;
    });

		if (this.dir.up) {
			thrustRequest = 1;
      this.trailEmitters.forEach(function(item){
      	item.emit = true;
      });
		} else if (this.dir.down) {
			thrustRequest = -1;
		}
		if (this.dir.left) {
			rotateRequest = -1;
		} else if (this.dir.right) {
			rotateRequest = 1;
		}

		if(thrustRequest != 0){
			this.speed += thrustRequest * this.acceleration * dt;
			if(this.speed > this.maxSpeed){
				this.speed = this.maxSpeed;
			}else if(this.speed < 0){
				this.speed = 0;
			}
		}else{
			this.speed *= .8;
		}
		this.xSpeed += this.speed * Math.sin(this.baseAngle) * 0.0002;
		this.ySpeed -= this.speed * Math.cos(this.baseAngle) * 0.0002;



		if(this.x < 100 && this.xSpeed < 0 ){
			this.xSpeed *= -0.2;
		}else if(this.x > universeWidth - 100 & this.xSpeed > 0){
			this.xSpeed *= -0.2;
		}
		if(this.y < 100 && this.ySpeed < 0){
			this.ySpeed *= -0.2;
		}else if(this.y > universeHeight - 100 & this.ySpeed > 0){
			this.ySpeed *= -0.2;
		}

		this.x += this.xSpeed * dt;
		this.y += this.ySpeed * dt;

		universe.x = -this.x;
    universe.y = -this.y;

		if(rotateRequest != 0){
			this.baseAngle += rotateRequest * dt * this.maneuverability;
		}

		if(this.shootRequest && now - lastShoot > 200){
			this.shoot();
			lastShoot = now;
		}


		this.refresh();
	},

	setCannonAngle: function(){
		var ship = { x: this.x , y: this.y};
		var deltaX = this.mx - ship.x;
		var deltaY = this.my - ship.y;
		this.cannonAngle = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
		this.cannonAngle += 90;
	},

	createBullet: function(gunIndex, bulletIndex){
	//Emit bullet to server
		var serverBullet = {bulletIndex: bulletIndex};
		serverBullet.alpha = this.baseAngle; //angle of shot in radians

		//Set init position
		var cannonLength = -this.specs.guns[gunIndex].y; //100;
		var deltaX = cannonLength * Math.sin(serverBullet.alpha) + (shootPosition) * Math.cos(serverBullet.alpha);
		var deltaY = cannonLength * Math.cos(serverBullet.alpha) - (shootPosition) * Math.sin(serverBullet.alpha);
		serverBullet.ownerId = this.id;
		serverBullet.x = this.x + deltaX;
		serverBullet.y = this.y - deltaY;
		serverBullet.momentum = {x: this.xSpeed, y: this.ySpeed};
		return serverBullet;
	},
	
	shoot: function(){
		if(this.dead){
			return;
		}
		
		if(MULTI){
    	this.game.socket.emit('shoot', this.createBullet(3, 0));
			shootPosition *= -1;
			if( this.outfits.indexOf('twinWeapons') !== -1 ){
				this.game.socket.emit('shoot', this.createBullet(0, 1));
				//this.game.socket.emit('shoot', this.createBullet(1, 2));
				//this.game.socket.emit('shoot', this.createBullet(2, 3));
			}
			protonSound.play();
    }else{
			var serverBullet = this.createBullet(0);
    	var x = new Bullet(1, this.id, null, serverBullet.x, serverBullet.y, this.baseAngle)
    }
	}

}

function debug(msg){
	if(DEBUG){
		console.log(msg);
	}
}

function getRandomInt(min, max) {
	return Math.floor(Math.random() * (max - min)) + min;
}


function getGreenToRedHex(percentage){
	var hex = '0x';
	if(percentage == 100){
  	hex += '00FF00';
  }else if (percentage == 0){
  	hex += 'FF0000';
  }else{
		var hxRed = parseInt((100-percentage) / 100 * 255).toString(16);
		var hxGreen = parseInt(percentage / 100 * 255).toString(16);
    if(hxRed.length < 2){ hxRed = '0' + hxRed; }
    if(hxGreen.length < 2){ hxGreen = '0' + hxGreen; }
		hex += hxRed + hxGreen + '00';
  }
	return hex;
}



/* ====== */

if(!MULTI){
	var game = new Game('#arena', 900, 600, null);
	var selectedShip = 1;
	var shipName = 'Rodolphe', shipId = new Date().getTime();
	game.addShip(shipId, shipName, null, true, 400, 400, 100);
	game.ships.forEach( function(clientShip){
	  //update foreign ships
	  if(clientShip.id == serverShip.id){

	    clientShip.x = serverShip.x;
	    clientShip.y = serverShip.y;
	    clientShip.baseAngle = serverShip.baseAngle;
	    clientShip.cannonAngle = serverShip.cannonAngle;
	    clientShip.hp = serverShip.hp;
	    if(clientShip.hp <= 0){
	      game.killShip(clientShip);
	    }
	    clientShip.refresh();
	    found = true;
	  }

	  // for emitters
	  game.ships.forEach( function(clientShip){
	    // ---

	  });
	});

}

/* afterburner trails */

function loadTrails(){
	const loader = new PIXI.loaders.Loader();
	loader.add('emitterData', '//res.cloudinary.com/dogfight/raw/upload/v1500034225/emitter_3_z0ov2v.json');
	// loader.load((loader, resources) => {
	loader.load( function(loader, resources){
	  if(game.localShip){
	  	game.localShip.addEmitters(resources.emitterData.data);
	   }
	});
}

function createTrail(emitterConfig, targetShip, position){
	emitter = new PIXI.particles.Emitter(
		targetShip.sprite,
		// The collection of particle images to use
    [PIXI.Texture.fromImage('//res.cloudinary.com/dogfight/image/upload/v1500034284/particle_ipclhx.png')],
		emitterConfig
	);
  emitter.updateSpawnPos(position.x-8, position.y)
	emitter.emit = false;
  return emitter;
}


var protonSound = new Howl({
  src: ['//res.cloudinary.com/dogfight/video/upload/v1500143339/proton_ukfove.wav']
});
var explosionSound = new Howl({
  src: ['//res.cloudinary.com/dogfight/video/upload/v1500143341/final_explosion_small_jtm70y.wav']
});
var jumpInSound = new Howl({
	src: ['//res.cloudinary.com/dogfight/video/upload/v1500143339/jump_in_eppjnq.wav']
});

var bulletHitFrames = [];
for (var i = 0; i < 8; i++) {
		bulletHitFrames.push(PIXI.Texture.fromImage('//res.cloudinary.com/dogfight/image/upload/v1500145849/projectileHit/plasmaImpact/plasma_explosion_' + i + '.png'));
}



// https://github.com/pixijs/pixi-particles
// http://res.cloudinary.com/dogfight/raw/upload/v1500025334/emitter_ufl9kc.json
